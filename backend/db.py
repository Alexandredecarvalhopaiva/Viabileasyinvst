"""Transactions and schema shared by SQLite development and PostgreSQL hosting.

Table names and password/session formats preserve the existing Node database.
"""

from contextlib import contextmanager

from sqlalchemy import (
    BigInteger,
    CheckConstraint,
    Column,
    ForeignKey,
    Integer,
    LargeBinary,
    MetaData,
    String,
    Table,
    Text,
    UniqueConstraint,
    create_engine,
    event,
    inspect,
    text,
)

metadata = MetaData()


def table(name, *columns):
    return Table(name, metadata, *columns)


users = table(
    "users",
    Column("id", String, primary_key=True),
    Column("email", String, nullable=False, unique=True),
    Column("name", Text, nullable=False),
    Column("password_hash", Text),
    Column("google_sub", String, unique=True),
    Column("photo", LargeBinary),
    Column("photo_type", Text),
    Column("google_photo", Text),
    Column("updated_at", BigInteger, nullable=False),
    Column("created_at", BigInteger, nullable=False),
    Column("role", String, nullable=False, server_default="user"),
    Column("account_status", String, nullable=False, server_default="pending"),
    Column("reviewed_at", BigInteger),
    Column(
        "reviewed_by",
        String,
        ForeignKey("users.id", ondelete="SET NULL", deferrable=True, initially="DEFERRED"),
    ),
    CheckConstraint("role IN ('user','super_admin')"),
    CheckConstraint("account_status IN ('pending','approved','rejected')"),
)
for name, columns in {
    "sessions": [
        Column("hash", String, primary_key=True),
        Column("user_id", String, ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        Column("expires_at", BigInteger, nullable=False),
    ],
    "resets": [
        Column("hash", String, primary_key=True),
        Column("user_id", String, ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        Column("expires_at", BigInteger, nullable=False),
    ],
    "oauth": [
        Column("hash", String, primary_key=True),
        Column("verifier", Text, nullable=False),
        Column("nonce", Text, nullable=False),
        Column("user_id", String),
        Column("session_hash", String),
        Column("expires_at", BigInteger, nullable=False),
    ],
    "limits": [
        Column("key", String, primary_key=True),
        Column("count", Integer, nullable=False),
        Column("expires_at", BigInteger, nullable=False),
    ],
}.items():
    table(name, *columns)
studies = table(
    "studies",
    Column("user_id", String, ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
    Column("id", String, primary_key=True),
    Column("payload", Text, nullable=False),
    Column("updated_at", BigInteger, nullable=False),
    Column("last_opened_at", BigInteger),
)
documents = table(
    "documents",
    Column("id", String, primary_key=True),
    Column("user_id", String, ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
    Column("scope", String, nullable=False),
    Column("lot_id", String),
    Column("lot_name", Text),
    *[
        Column(name, Text, nullable=False)
        for name in ("title", "issuer", "reference", "category", "source_url", "notes", "filename")
    ],
    Column("size", Integer, nullable=False),
    Column("sha256", String, nullable=False),
    Column("pdf", LargeBinary, nullable=False),
    Column("created_at", BigInteger, nullable=False),
    CheckConstraint("(scope='library' AND lot_id IS NULL) OR (scope='lot' AND lot_id IS NOT NULL)"),
)
table(
    "credit_wallets",
    Column("user_id", String, ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
    Column("balance", Integer, nullable=False, server_default="0"),
    CheckConstraint("balance>=0"),
)
table(
    "credit_ledger",
    Column("id", String, primary_key=True),
    Column("user_id", String, ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
    Column("actor_id", String, ForeignKey("users.id"), nullable=False),
    Column("kind", String, nullable=False),
    Column("operation_key", String, nullable=False),
    Column("delta", Integer, nullable=False),
    Column("balance_after", Integer, nullable=False),
    Column("note", Text, nullable=False),
    Column("created_at", BigInteger, nullable=False),
    CheckConstraint("balance_after>=0"),
    CheckConstraint("(kind='grant' AND delta>0) OR (kind='use' AND delta=-1)"),
    UniqueConstraint("user_id", "kind", "operation_key"),
)
table("schema_versions", Column("version", Integer, primary_key=True))


def execute(conn, sql, params=()):
    """Bind values, including in the few portable SQL statements used by modules."""
    if isinstance(params, dict):
        return conn.execute(text(sql), params)
    parts = sql.split("?")
    if len(parts) - 1 != len(params):
        raise ValueError("Quantidade de parâmetros SQL inconsistente.")
    query = "".join(part + (f":p{i}" if i < len(params) else "") for i, part in enumerate(parts))
    return conn.execute(text(query), {f"p{i}": value for i, value in enumerate(params)})


def one(conn, sql, params=()):
    row = execute(conn, sql, params).mappings().first()
    return dict(row) if row is not None else None


def all_rows(conn, sql, params=()):
    return [dict(row) for row in execute(conn, sql, params).mappings()]


class Database:
    def __init__(self, settings):
        settings.data_dir.mkdir(mode=0o700, parents=True, exist_ok=True)
        url = settings.database_url or f"sqlite:///{settings.data_dir / 'accounts.sqlite'}"
        if url.startswith(("postgres://", "postgresql://")):
            url = "postgresql+psycopg://" + url.split("://", 1)[1]
        self.sqlite = url.startswith("sqlite:")
        self.engine = create_engine(
            url,
            pool_pre_ping=True,
            hide_parameters=True,
            connect_args={"check_same_thread": False, "timeout": 15}
            if self.sqlite
            else {"connect_timeout": 10},
        )
        if self.sqlite:

            @event.listens_for(self.engine, "connect")
            def sqlite_pragmas(dbapi_connection, _):
                dbapi_connection.execute("PRAGMA foreign_keys=ON")
                dbapi_connection.execute("PRAGMA busy_timeout=15000")
                dbapi_connection.execute("PRAGMA journal_mode=WAL")

    def initialize(self):
        # Idempotent additive migration v1. PostgreSQL advisory lock serializes workers.
        with self.transaction() as conn:
            if not self.sqlite:
                execute(conn, "SELECT pg_advisory_xact_lock(846142019)")
            metadata.create_all(conn)
            cols = {item["name"] for item in inspect(conn).get_columns("users")}
            if "role" not in cols:
                execute(conn, "ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'user'")
            if "account_status" not in cols:
                execute(conn, "ALTER TABLE users ADD COLUMN account_status TEXT NOT NULL DEFAULT 'pending'")
                execute(conn, "UPDATE users SET account_status='approved'")
            for name, definition in {
                "reviewed_at": "BIGINT",
                "reviewed_by": "TEXT REFERENCES users(id) ON DELETE SET NULL",
            }.items():
                if name not in cols:
                    execute(conn, f"ALTER TABLE users ADD COLUMN {name} {definition}")
            if "last_opened_at" not in {c["name"] for c in inspect(conn).get_columns("studies")}:
                execute(conn, "ALTER TABLE studies ADD COLUMN last_opened_at BIGINT")
            execute(conn, "CREATE INDEX IF NOT EXISTS documents_lot ON documents(user_id,lot_id,created_at)")
            execute(
                conn,
                "CREATE UNIQUE INDEX IF NOT EXISTS documents_unique_file ON documents(user_id,scope,COALESCE(lot_id,''),sha256)",
            )
            execute(
                conn,
                "CREATE INDEX IF NOT EXISTS credit_ledger_user_date ON credit_ledger(user_id,created_at)",
            )
            execute(conn, "INSERT INTO schema_versions(version) VALUES(1) ON CONFLICT(version) DO NOTHING")
        if self.sqlite and self.engine.url.database != ":memory:":
            from pathlib import Path

            Path(self.engine.url.database).chmod(0o600)

    @contextmanager
    def transaction(self):
        with self.engine.connect() as conn:
            try:
                if self.sqlite:
                    conn.exec_driver_sql("BEGIN IMMEDIATE")
                else:
                    conn.begin()
                yield conn
                conn.commit()
            except BaseException:
                conn.rollback()
                raise

    def lock_user(self, conn, user_id):
        suffix = "" if self.sqlite else " FOR UPDATE"
        return one(conn, "SELECT * FROM users WHERE id=?" + suffix, (user_id,))
