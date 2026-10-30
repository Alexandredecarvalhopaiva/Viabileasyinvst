"""Exercise the actual migration on a disposable local PostgreSQL, never the hosted project."""

import base64
import os
import shutil
import subprocess
import tempfile
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from uuid import uuid4

import psycopg
import pytest
from psycopg.types.json import Jsonb

ROOT = Path(__file__).resolve().parents[2]
MIGRATION = ROOT / "supabase/migrations/202610300001_pages.sql"


@pytest.fixture(scope="session")
def database():
    bindir = Path(os.environ.get("PG_BIN", "/opt/homebrew/opt/postgresql@17/bin"))
    if not (bindir / "initdb").is_file():
        pytest.skip("Set PG_BIN to a local PostgreSQL bin directory to exercise the migration.")
    folder = Path(tempfile.mkdtemp(prefix="vepg-", dir="/tmp"))
    data = folder / "data"

    def run(*args):
        result = subprocess.run([str(bindir / args[0]), *args[1:]], capture_output=True, text=True)
        if result.returncode:
            raise RuntimeError(result.stdout + result.stderr)

    started = False
    try:
        run("initdb", "-D", str(data), "-A", "trust", "--no-locale", "-E", "UTF8")
        run(
            "pg_ctl",
            "-D",
            str(data),
            "-l",
            str(folder / "server.log"),
            "-o",
            f"-k {folder} -c listen_addresses=''",
            "-w",
            "start",
        )
        started = True
        dsn = f"host={folder} dbname=postgres"
        with psycopg.connect(dsn, autocommit=True) as conn:
            conn.execute("""
                create role anon; create role authenticated;
                create schema auth;
                create table auth.users(id uuid primary key, email text, email_confirmed_at timestamptz, raw_user_meta_data jsonb);
                create table auth.identities(user_id uuid references auth.users(id), provider text);
                create function auth.uid() returns uuid language sql stable as
                  $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
            """)
            conn.execute(MIGRATION.read_text(), prepare=False)
        yield dsn
    finally:
        if started:
            run("pg_ctl", "-D", str(data), "-m", "fast", "-w", "stop")
        shutil.rmtree(folder)


def call(database, uid, operation, payload=None):
    with psycopg.connect(database) as conn:
        conn.execute("set local role authenticated")
        conn.execute("select set_config('request.jwt.claim.sub',%s,true)", (str(uid),))
        return conn.execute("select public.viabil_api(%s,%s)", (operation, Jsonb(payload or {}))).fetchone()[
            0
        ]


def account(database, approved=False, admin=False, balance=0, google=False, confirmed=True):
    uid = uuid4()
    with psycopg.connect(database) as conn:
        conn.execute(
            "insert into auth.users values(%s,%s,%s,%s)",
            (
                uid,
                f"{uid}@example.test",
                "2026-10-30T00:00:00Z" if confirmed else None,
                Jsonb({"full_name": "Test Person"}),
            ),
        )
        conn.execute("insert into auth.identities values(%s,%s)", (uid, "google" if google else "email"))
    if confirmed:
        assert call(database, uid, "session")["user"]["accountStatus"] == "pending"
    if approved or admin:
        with psycopg.connect(database) as conn:
            conn.execute(
                "update viabil_private.profiles set role=%s,account_status='approved',balance=%s where id=%s",
                ("super_admin" if admin else "user", balance, uid),
            )
    return uid


def study(identifier="lot1", width=12):
    return {
        "id": identifier,
        "lot": {"id": identifier, "name": "Test lot", "area": 360, "width": width, "depth": 30},
        "scenario": {
            "floors": 6,
            "to": 60,
            "efficiency": 80,
            "unitArea": 60,
            "price": 5000,
            "cost": 2000,
            "landPrice": 100000,
            "indirect": 10,
            "profit": 20,
            "use": "H1",
        },
    }


def test_grants_and_reapply(database):
    with psycopg.connect(database) as conn:
        conn.execute(MIGRATION.read_text(), prepare=False)
        conn.execute("set local role anon")
        assert conn.execute("select public.viabil_ready()").fetchone()[0] == {"status": "ready"}
        with pytest.raises(psycopg.errors.InsufficientPrivilege):
            conn.execute("select public.viabil_api('session')")
    for sql in [
        "select * from viabil_private.profiles",
        "select * from viabil_private.documents",
        "select viabil_private.fail(400,'injected')",
    ]:
        with psycopg.connect(database) as conn:
            conn.execute("set local role authenticated")
            with pytest.raises(psycopg.errors.InsufficientPrivilege):
                conn.execute(sql)


def test_email_password_identity_and_pending_cannot_self_approve(database):
    unverified = account(database, confirmed=False)
    assert call(database, unverified, "session")["status"] == 403
    email_user = account(database)
    email_profile = call(database, email_user, "session")["user"]
    assert email_profile["googleConnected"] is False
    assert email_profile["hasPassword"] is True
    uid = account(database)
    result = call(
        database, uid, "session", {"role": "super_admin", "account_status": "approved", "balance": 999}
    )
    assert result["user"]["role"] == "user"
    assert result["user"]["accountStatus"] == "pending"
    for operation in ["studies", "overview", "profile", "credits"]:
        assert (
            call(database, uid, operation, {"name": "Override", "amount": 999})["code"] == "ACCOUNT_PENDING"
        )


def test_review_and_grants_are_admin_only_and_idempotent(database):
    admin = account(database, admin=True)
    uid = account(database)
    ordinary = account(database, approved=True)
    assert call(database, ordinary, "review", {"id": str(uid), "decision": "approved"})["status"] == 403
    assert (
        call(database, admin, "review", {"id": str(uid), "decision": "approved"})["user"]["accountStatus"]
        == "approved"
    )
    assert call(database, admin, "review", {"id": str(uid), "decision": "rejected"})["status"] == 409
    payload = {"id": str(uid), "amount": 5, "requestKey": "grant-1", "note": "Test grant"}
    assert call(database, admin, "credits", payload)["usage"]["balance"] == 5
    assert call(database, admin, "credits", payload)["usage"]["duplicate"] is True
    assert call(database, admin, "credits", {**payload, "amount": 6})["status"] == 409
    assert call(database, uid, "usage")["usage"]["balance"] == 5
    overview = call(database, admin, "overview")
    assert any(user["id"] == str(uid) for user in overview["users"])


def test_concurrent_saves_and_geometry_change_charge_atomically(database):
    uid = account(database, approved=True, balance=1)
    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(lambda _: call(database, uid, "save-study", study()), range(2)))
    assert all("study" in result for result in results), results
    assert sum(result["charged"] for result in results) == 1
    assert call(database, uid, "usage")["usage"] == {"balance": 0, "used": 1, "unlimited": False}
    changed_price = study()
    changed_price["scenario"]["price"] = 6500
    assert call(database, uid, "save-study", changed_price)["charged"] is False
    assert call(database, uid, "save-study", study(width=13))["code"] == "NO_CREDITS"
    assert call(database, uid, "study", {"id": "lot1"})["study"]["lot"]["width"] == 12


def test_two_new_studies_cannot_spend_last_credit_twice(database):
    uid = account(database, approved=True, balance=1)
    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(lambda n: call(database, uid, "save-study", study(f"lot{n}")), range(2)))
    assert sum("study" in result for result in results) == 1
    assert sum(result.get("code") == "NO_CREDITS" for result in results) == 1


def test_study_isolation_validation_and_delete(database):
    owner = account(database, approved=True, balance=2)
    stranger = account(database, approved=True)
    bad = study()
    bad["lot"]["geometry"] = {"vertices": [[0, 0], [1, 0], ["bad", 1]]}
    assert call(database, owner, "save-study", bad)["status"] == 400
    assert call(database, owner, "usage")["usage"]["balance"] == 2
    assert "study" in call(database, owner, "save-study", study())
    assert call(database, stranger, "studies")["studies"] == []
    for op in ["study", "open-study", "delete-study"]:
        assert call(database, stranger, op, {"id": "lot1"})["status"] == 404
    assert call(database, owner, "open-study", {"id": "lot1"})["lastOpenedAt"] > 0
    assert call(database, owner, "delete-study", {"id": "lot1"}) == {"ok": True}
    assert call(database, owner, "studies")["studies"] == []


def document(scope="lot"):
    return {
        "scope": scope,
        "lotId": "lot1",
        "title": "Reference",
        "issuer": "Issuer",
        "filename": "test.pdf",
        "category": "outro",
        "pdf": base64.b64encode(b"%PDF-1.4\nsynthetic document\n%%EOF").decode(),
    }


def test_private_pdfs_library_and_duplicate_rules(database):
    owner = account(database, admin=True)
    stranger = account(database, approved=True)
    assert "study" in call(database, owner, "save-study", study())
    data = call(database, owner, "add-document", document())
    assert "document" in data, data
    doc = data["document"]
    assert doc["size"] > 0
    assert call(database, owner, "add-document", document())["status"] == 409
    assert call(database, stranger, "documents")["total"] == 0
    assert call(database, stranger, "file", {"id": doc["id"]})["status"] == 404
    pdf = call(database, owner, "file", {"id": doc["id"]})
    assert base64.b64decode(pdf["pdf"]).startswith(b"%PDF-")
    assert call(database, stranger, "add-document", document("library"))["status"] == 403
    library = call(database, owner, "add-document", document("library"))["document"]
    assert call(database, stranger, "documents")["documents"][0]["id"] == library["id"]
    assert "pdf" in call(database, stranger, "file", {"id": library["id"]})
    assert call(database, stranger, "delete-document", {"id": library["id"]})["status"] == 404
    assert call(database, owner, "delete-study", {"id": "lot1"}) == {"ok": True}
    assert call(database, owner, "file", {"id": doc["id"]})["status"] == 404
    assert "pdf" in call(database, owner, "file", {"id": library["id"]})


def test_profile_photo_and_missing_payloads(database):
    uid = account(database, approved=True)
    assert (
        call(database, uid, "profile", {"name": "New Name", "role": "super_admin"})["user"]["role"] == "user"
    )
    assert call(database, uid, "profile", {"name": "New Name"})["user"]["name"] == "New Name"
    assert call(database, uid, "photo", {"image": None})["user"]["avatar"] is None
    assert (
        call(database, uid, "photo", {"image": "data:image/jpeg;base64,c3ZnIG9ubG9hZD0iZXZpbCI="})["status"]
        == 400
    )
    assert call(database, uid, "save-study", {})["status"] == 400
    assert call(database, uid, "documents", {"page": "-1"})["status"] == 400


def test_study_quota_does_not_debit_and_rounded_geometry_is_same_analysis(database):
    uid = account(database, approved=True, balance=3)
    original = study()
    original["lot"]["geometry"] = {"vertices": [[0, 0], [12, 0], [12, 30], [0, 30]]}
    assert call(database, uid, "save-study", original)["charged"] is True
    reopened = study()
    reopened["lot"]["geometry"] = {"vertices": [[0.000001, 0], [12, 0], [12, 30], [0, 30]]}
    assert call(database, uid, "save-study", reopened)["charged"] is False
    with psycopg.connect(database) as conn:
        conn.execute(
            """insert into viabil_private.studies(user_id,id,payload,identity,updated_at)
          select %s,'seed-'||n,'{}'::jsonb,'{}'::jsonb,1 from generate_series(1,499) n""",
            (uid,),
        )
    assert call(database, uid, "save-study", study("over-quota"))["status"] == 409
    assert call(database, uid, "usage")["usage"] == {"balance": 2, "used": 1, "unlimited": False}


def test_invalid_document_missing_study_and_malicious_source_url(database):
    uid = account(database, approved=True, balance=1)
    baseline = call(database, uid, "documents")["total"]
    assert call(database, uid, "add-document", document())["status"] == 404
    assert "study" in call(database, uid, "save-study", study())
    for changes in [
        {"pdf": base64.b64encode(b"not a PDF").decode()},
        {"pdf": "%%%invalid"},
        {"sourceURL": "javascript:alert(1)"},
        {"sourceURL": "https://user:password@example.test/path"},
        {"filename": "file.html"},
        {"category": "invented"},
    ]:
        result = call(database, uid, "add-document", {**document(), **changes})
        assert result["status"] == 400, result
    assert call(database, uid, "documents")["total"] == baseline


def test_rejected_requests_count_towards_rate_limit(database):
    uid = account(database, approved=True)
    assert call(database, uid, "save-study", {})["status"] == 400
    with psycopg.connect(database) as conn:
        count = conn.execute(
            "select count from viabil_private.rate_limits where user_id=%s", (uid,)
        ).fetchone()[0]
        assert count == 2  # Account initialization plus the rejected save.
        conn.execute("update viabil_private.rate_limits set count=600 where user_id=%s", (uid,))
    assert call(database, uid, "usage")["status"] == 429
