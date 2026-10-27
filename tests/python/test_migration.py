import json
import os
import shutil
import sqlite3
import subprocess
from uuid import uuid4

import pytest
from conftest import ORIGIN, PASSWORD, call, login, study
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text
from sqlalchemy.engine import make_url

from backend.cli import backup, migrate_sqlite
from backend.config import Settings
from backend.db import execute, one
from backend.main import create_app
from backend.security import digest, now
from backend.studies import analysis_identity


def test_node_hash_and_legacy_sqlite_migration(tmp_path):
    # Produce the password hash with the original Node crypto implementation.
    encoded = subprocess.check_output(
        [
            "node",
            "-e",
            "const c=require('node:crypto');const salt='0123456789abcdef0123456789abcdef';console.log(salt+':'+c.scryptSync(process.argv[1],salt,64,{N:32768,r:8,p:1,maxmem:64*1024*1024}).toString('hex'));",
            PASSWORD,
        ],
        text=True,
    ).strip()
    with sqlite3.connect(tmp_path / "accounts.sqlite") as db:
        db.executescript("""CREATE TABLE users(id TEXT PRIMARY KEY,email TEXT NOT NULL UNIQUE,name TEXT NOT NULL,password_hash TEXT,google_sub TEXT UNIQUE,photo BLOB,photo_type TEXT,google_photo TEXT,updated_at INTEGER NOT NULL,created_at INTEGER NOT NULL);
            CREATE TABLE studies(user_id TEXT NOT NULL,id TEXT NOT NULL,payload TEXT NOT NULL,updated_at INTEGER NOT NULL,PRIMARY KEY(user_id,id));""")
        db.execute(
            "INSERT INTO users(id,email,name,password_hash,updated_at,created_at) VALUES(?,?,?,?,?,?)",
            ("legacy", "legacy@example.test", "Pessoa Existente", encoded, now(), now()),
        )
        db.execute("INSERT INTO studies VALUES(?,?,?,?)", ("legacy", "lot-1", json.dumps(study()), now()))
    app = create_app(Settings(app_url=ORIGIN, data_dir=tmp_path))
    with TestClient(app, base_url=ORIGIN) as client:
        response = call(
            client, "/api/auth/login", "POST", {"email": "legacy@example.test", "password": PASSWORD}
        )
        assert response.status_code == 200
        assert response.json()["user"]["accountStatus"] == "approved"
        assert client.get("/api/studies").json()["studies"][0]["lot"]["id"] == "lot-1"
        new = call(
            client,
            "/api/auth/register",
            "POST",
            {"email": "new@example.test", "name": "Nova Pessoa", "password": PASSWORD},
        )
        assert new.json()["user"]["accountStatus"] == "pending"
    with TestClient(create_app(Settings(app_url=ORIGIN, data_dir=tmp_path)), base_url=ORIGIN) as client:
        assert (
            call(
                client, "/api/auth/login", "POST", {"email": "new@example.test", "password": PASSWORD}
            ).json()["code"]
            == "ACCOUNT_PENDING"
        )


def test_analysis_identity_matches_original_javascript():
    lots = [
        study()["lot"],
        study(lat=-7.123456789, lng=-34.123456789, area=360.004)["lot"],
        study(geometry={"vertices": [[0, 0], [12.000001, 0], [12, 30]], "crs": "local"})["lot"],
        study(
            geometry={
                "vertices": [[0, 0], [12, 0], [12, 30]],
                "geographic": [[-34.8, -7.1], [-34.8001, -7.1], [-34.8, -7.1001]],
            }
        )["lot"],
    ]
    original = json.loads(
        subprocess.check_output(
            [
                "node",
                "-e",
                "const a=require('./dist/analysis-identity.js');console.log(JSON.stringify(JSON.parse(process.argv[1]).map(l=>a.key(l))));",
                json.dumps(lots),
            ],
            text=True,
        )
    )
    assert [analysis_identity(lot) for lot in lots] == original


def test_backup_integrity_and_no_overwrite(system, accounts, tmp_path):
    if system["database"] != "sqlite":
        pytest.skip("Backup PostgreSQL é validado pelo teste de migração/restauração específico.")
    target = tmp_path / "backup.sqlite"
    backup(system["app"].state.db, target)
    assert target.stat().st_mode & 0o777 == 0o600
    with sqlite3.connect(target) as conn:
        assert conn.execute("PRAGMA integrity_check").fetchone()[0] == "ok"
        assert conn.execute("SELECT COUNT(*) FROM users").fetchone()[0] == 3
    with pytest.raises(FileExistsError):
        backup(system["app"].state.db, target)


def test_sqlite_to_postgres_is_atomic_and_preserves_passwords(system, tmp_path):
    if system["database"] != "postgresql":
        pytest.skip("Migração entre bancos é executada quando PG_TEST_DATABASE_URL está definido.")
    from backend.admin import assign_role
    from backend.db import Database
    from backend.security import hash_password

    source_settings = Settings(app_url=ORIGIN, data_dir=tmp_path / "source")
    source = Database(source_settings)
    source.initialize()
    encoded = hash_password(PASSWORD)
    with source.transaction() as conn:
        execute(
            conn,
            "INSERT INTO users(id,email,name,password_hash,updated_at,created_at,role,account_status) VALUES(?,?,?,?,?,?,'user','pending')",
            ("import-user", "import@example.test", "Conta Importada", encoded, now(), now()),
        )
    assign_role(source, "import@example.test", "super_admin")
    with source.transaction() as conn:
        execute(
            conn,
            "INSERT INTO sessions(hash,user_id,expires_at) VALUES(?,?,?)",
            (digest("old-session"), "import-user", now() + 100_000),
        )
    counts = migrate_sqlite(system["settings"], source_settings.data_dir / "accounts.sqlite")
    assert counts["users"] == 1
    assert login(system, "import@example.test").status_code == 200
    with system["app"].state.db.engine.connect() as conn:
        assert one(conn, "SELECT password_hash FROM users WHERE id='import-user'")["password_hash"] == encoded
        assert (
            one(conn, "SELECT COUNT(*) AS count FROM sessions WHERE hash=?", (digest("old-session"),))[
                "count"
            ]
            == 0
        )
    with pytest.raises(ValueError, match="vazio"):
        migrate_sqlite(system["settings"], source_settings.data_dir / "accounts.sqlite")
    with source.engine.connect() as conn:
        assert one(conn, "SELECT COUNT(*) AS count FROM users")["count"] == 1
    source.engine.dispose()


def test_postgres_backup_restores_to_separate_database(system, accounts, tmp_path):
    if system["database"] != "postgresql" or not shutil.which("pg_dump") or not shutil.which("pg_restore"):
        pytest.skip("Restauração PostgreSQL exige banco local e clientes pg_dump/pg_restore.")
    url = make_url(system["settings"].database_url).set(query={})
    archive = backup(system["app"].state.db, tmp_path / "restorable.dump")
    schema = make_url(system["settings"].database_url).query["options"].split("=", 1)[1]
    name = "restore_test_" + uuid4().hex
    maintenance = create_engine(url, isolation_level="AUTOCOMMIT")
    restored = None
    with maintenance.connect() as conn:
        conn.execute(text(f'CREATE DATABASE "{name}"'))
    try:
        env = {
            **os.environ,
            "PGHOST": url.host,
            "PGPORT": str(url.port or 5432),
            "PGUSER": url.username or "",
            "PGPASSWORD": url.password or "",
            "PGDATABASE": name,
        }
        result = subprocess.run(
            [shutil.which("pg_restore"), "--no-owner", "--exit-on-error", "--dbname", name, str(archive)],
            capture_output=True,
            env=env,
        )
        assert result.returncode == 0, "O arquivo de backup não pôde ser restaurado no banco separado."
        restored = create_engine(url.set(database=name))
        with restored.connect() as conn:
            assert conn.execute(text(f'SELECT COUNT(*) FROM "{schema}".users')).scalar_one() == 3
    finally:
        if restored:
            restored.dispose()
        with maintenance.connect() as conn:
            conn.execute(text(f'DROP DATABASE "{name}"'))
        maintenance.dispose()
