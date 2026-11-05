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
MIGRATIONS = sorted((ROOT / "supabase/migrations").glob("*.sql"))


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
                create role anon; create role authenticated; create role service_role;
                create schema auth;
                create table auth.users(id uuid primary key, email text, email_confirmed_at timestamptz, raw_user_meta_data jsonb, raw_app_meta_data jsonb default '{}');
                create table auth.sessions(id uuid primary key, user_id uuid references auth.users(id));
                create table auth.identities(user_id uuid references auth.users(id), provider text);
                create function auth.uid() returns uuid language sql stable as
                  $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
                create function auth.jwt() returns jsonb language sql stable as
                  $$ select jsonb_build_object('session_id',current_setting('request.jwt.claim.sub',true)) $$;
            """)
            for migration in MIGRATIONS:
                conn.execute(migration.read_text(), prepare=False)
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
            "insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values(%s,%s,%s,%s)",
            (
                uid,
                f"{uid}@example.test",
                "2026-10-30T00:00:00Z" if confirmed else None,
                Jsonb({"full_name": "Test Person"}),
            ),
        )
        conn.execute("insert into auth.identities values(%s,%s)", (uid, "google" if google else "email"))
        conn.execute("insert into auth.sessions values(%s,%s)", (uid, uid))
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
        for migration in MIGRATIONS:
            conn.execute(migration.read_text(), prepare=False)
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


def service_call(database, operation, payload):
    with psycopg.connect(database) as conn:
        conn.execute("set local role service_role")
        return conn.execute("select public.viabil_accounts(%s,%s)", (operation, Jsonb(payload))).fetchone()[0]


def provision(database, admin, key="create-managed"):
    uid = uuid4()
    email = f"{uid}@example.test"
    payload = {
        "actorId": str(admin),
        "sessionId": str(admin),
        "requestKey": key,
        "email": email,
        "name": "Pessoa administrada",
        "hash": uid.hex * 2,
    }
    with psycopg.connect(database) as conn:
        conn.execute(
            """insert into auth.users(id,email,raw_user_meta_data,raw_app_meta_data) values(%s,%s,%s,%s)""",
            (
                uid,
                email,
                Jsonb({"full_name": payload["name"]}),
                Jsonb({"viabil_actor": str(admin), "viabil_request_key": key}),
            ),
        )
        conn.execute("insert into auth.identities values(%s,'email')", (uid,))
    return uid, payload, service_call(database, "provision", payload)


def test_managed_account_provisioning_separates_credentials_approval_and_email(database):
    admin = account(database, admin=True)
    uid, payload, result = provision(database, admin)
    assert result["user"]["role"] == "user"
    assert result["user"]["hasPassword"] is False
    assert result["user"]["emailVerified"] is False
    assert result["user"]["accountStatus"] == "pending"
    assert result["user"]["usage"]["balance"] == 0
    assert service_call(database, "lookup", payload)["userId"] == str(uid)
    assert service_call(database, "provision", payload)["duplicate"] is True
    assert service_call(database, "lookup", {**payload, "requestKey": "different"})["status"] == 409
    overview = call(database, admin, "overview")
    assert any(user["id"] == str(uid) and user["hasPassword"] is False for user in overview["users"])
    for role in ("anon", "authenticated"):
        with psycopg.connect(database) as conn:
            conn.execute(f"set local role {role}")
            with pytest.raises(psycopg.errors.InsufficientPrivilege):
                conn.execute("select public.viabil_accounts('check','{}')")
    assert service_call(database, "check", {"hash": payload["hash"]}) == {"valid": True}
    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(
            pool.map(lambda _: service_call(database, "consume", {"hash": payload["hash"]}), range(2))
        )
    assert sum(result.get("userId") == str(uid) for result in results) == 1
    assert sum(result.get("status") == 400 for result in results) == 1
    # Reissue waits until an unfinished provider operation expires to avoid competing password writes.
    assert (
        service_call(
            database,
            "issue",
            {
                **payload,
                "id": str(uid),
                "hash": "b" * 64,
                "note": "Identidade conferida",
                "requestKey": "retry-during-update",
            },
        )["status"]
        == 409
    )
    assert service_call(database, "complete", {"hash": payload["hash"]}) == {"ok": True}
    assert service_call(database, "check", {"hash": payload["hash"]})["status"] == 400
    with psycopg.connect(database) as conn:
        row = conn.execute(
            "select credentials_defined,email_verified,account_status,balance from viabil_private.profiles where id=%s",
            (uid,),
        ).fetchone()
    assert row == (True, False, "pending", 0)


def test_reissue_expiry_block_and_session_revocation(database):
    admin = account(database, admin=True)
    uid, payload, _ = provision(database, admin, "another-account")
    issue = {
        **payload,
        "id": str(uid),
        "hash": "c" * 64,
        "requestKey": "new-link",
        "note": "Identidade conferida",
    }
    assert "expiresAt" in service_call(database, "issue", issue)
    assert service_call(database, "issue", issue) == {"duplicate": True}
    assert service_call(database, "check", {"hash": payload["hash"]})["status"] == 400
    with psycopg.connect(database) as conn:
        conn.execute("update viabil_private.access_links set expires_at=1 where user_id=%s", (uid,))
    assert service_call(database, "check", {"hash": "c" * 64})["status"] == 400
    ordinary = account(database, approved=True, balance=1)
    data = {"id": str(ordinary), "blocked": True, "note": "Suspensão solicitada", "requestKey": "block"}
    assert call(database, admin, "status", data)["user"]["accountStatus"] == "blocked"
    assert call(database, admin, "status", data)["duplicate"] is True
    assert call(database, ordinary, "usage")["status"] == 401
    assert (
        call(database, admin, "status", {**data, "blocked": False, "requestKey": "restore"})["user"][
            "accountStatus"
        ]
        == "approved"
    )
    # Old JWT remains unusable even after restoration.
    assert call(database, ordinary, "usage")["status"] == 401


def test_failed_persistence_rolls_back_the_credit_debit(database):
    uid = account(database, approved=True, balance=1)
    with psycopg.connect(database) as conn:
        conn.execute("""
            create function viabil_private.reject_test_save() returns trigger language plpgsql as $$
            begin
              if new.id='failed-write' then
                raise exception using errcode='P0001', message='Falha simulada na persistência', detail='{"status":503}';
              end if;
              return new;
            end $$;
            create trigger reject_test_save before insert on viabil_private.studies
              for each row execute function viabil_private.reject_test_save();
        """)
    try:
        assert call(database, uid, "save-study", study("failed-write"))["status"] == 503
        assert call(database, uid, "usage")["usage"] == {"balance": 1, "used": 0, "unlimited": False}
        assert call(database, uid, "studies")["studies"] == []
    finally:
        with psycopg.connect(database) as conn:
            conn.execute(
                "drop trigger reject_test_save on viabil_private.studies; drop function viabil_private.reject_test_save()"
            )
    assert call(database, uid, "save-study", study("failed-write"))["usage"]["balance"] == 0
