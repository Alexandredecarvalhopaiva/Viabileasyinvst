"""Profiles must reach the approval queue before the first login."""

from pathlib import Path
from uuid import uuid4

import psycopg
import test_database
from psycopg.types.json import Jsonb
from test_database import account, call

database = test_database.database

MIGRATION = Path(__file__).resolve().parents[2] / "supabase/migrations/202610300002_signup_profiles.sql"


def insert_identity(conn, email, metadata=None):
    uid = uuid4()
    conn.execute(
        "insert into auth.users values(%s,%s,null,%s)",
        (uid, email, Jsonb(metadata or {})),
    )
    return uid


def test_signup_is_pending_before_first_login(database):
    admin = account(database, admin=True)
    with psycopg.connect(database) as conn:
        uid = insert_identity(
            conn,
            f"{uuid4()}@example.test",
            {
                "full_name": "Novo Cadastro",
                "role": "super_admin",
                "account_status": "approved",
                "balance": 100,
            },
        )
        profile = conn.execute(
            "select name,role,account_status,balance,last_seen_at from viabil_private.profiles where id=%s",
            (uid,),
        ).fetchone()
    assert profile == ("Novo Cadastro", "user", "pending", 0, 0)
    assert any(item["id"] == str(uid) for item in call(database, admin, "overview")["pendingUsers"])
    assert call(database, uid, "session")["status"] == 403


def test_missing_profile_is_backfilled_without_resetting_admin(database):
    admin = account(database, admin=True, balance=7)
    with psycopg.connect(database) as conn:
        uid = insert_identity(conn, f"{uuid4()}@example.test", {"full_name": "A"})
        conn.execute("delete from viabil_private.profiles where id=%s", (uid,))
        conn.execute(MIGRATION.read_text(), prepare=False)
        conn.execute(MIGRATION.read_text(), prepare=False)
        assert conn.execute(
            "select role,account_status,balance from viabil_private.profiles where id=%s", (admin,)
        ).fetchone() == ("super_admin", "approved", 7)
        assert conn.execute(
            "select length(name),role,account_status from viabil_private.profiles where id=%s", (uid,)
        ).fetchone() == (2, "user", "pending")


def test_email_added_later_creates_profile_without_resetting_existing(database):
    with psycopg.connect(database) as conn:
        uid = insert_identity(conn, None)
        assert (
            conn.execute("select count(*) from viabil_private.profiles where id=%s", (uid,)).fetchone()[0]
            == 0
        )
        conn.execute("update auth.users set email=%s where id=%s", (f"{uid}@example.test", uid))
        assert conn.execute(
            "select role,account_status from viabil_private.profiles where id=%s", (uid,)
        ).fetchone() == ("user", "pending")
        conn.execute("update viabil_private.profiles set account_status='rejected' where id=%s", (uid,))
        conn.execute("update auth.users set email=%s where id=%s", (f"changed-{uid}@example.test", uid))
        assert (
            conn.execute("select account_status from viabil_private.profiles where id=%s", (uid,)).fetchone()[
                0
            ]
            == "rejected"
        )
