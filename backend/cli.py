"""Trusted operator commands. Never expose these operations to public signup."""

import argparse
import os
import shutil
import sqlite3
import subprocess
import tempfile
from dataclasses import replace
from pathlib import Path

from sqlalchemy.engine import make_url

from .admin import assign_role
from .config import Settings
from .db import Database, all_rows, execute, metadata, one


def backup(db, output):
    output = Path(output).resolve()
    output.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    fd = os.open(output, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
    os.close(fd)
    try:
        if db.sqlite:
            # SQLite's backup API includes committed WAL pages, unlike copying the .sqlite file.
            with sqlite3.connect(db.engine.url.database) as source, sqlite3.connect(output) as target:
                source.backup(target)
                if target.execute("PRAGMA integrity_check").fetchone()[0] != "ok":
                    raise RuntimeError("Falha na verificação do backup SQLite.")
        else:
            executable = shutil.which("pg_dump")
            if not executable:
                raise RuntimeError("Instale pg_dump (cliente PostgreSQL) para gerar o backup.")
            url = make_url(db.engine.url)
            env = {
                **os.environ,
                "PGHOST": url.host or "localhost",
                "PGPORT": str(url.port or 5432),
                "PGUSER": url.username or "",
                "PGPASSWORD": url.password or "",
                "PGDATABASE": url.database or "",
            }
            for key, variable in (("sslmode", "PGSSLMODE"), ("options", "PGOPTIONS")):
                if key in url.query:
                    env[variable] = url.query[key]
            result = subprocess.run(
                [executable, "--format=custom", "--no-owner", "--file", str(output)],
                env=env,
                capture_output=True,
            )
            if result.returncode:
                raise RuntimeError(
                    "pg_dump falhou. Confira conectividade, SSL e versão do cliente PostgreSQL."
                )
        return output
    except BaseException:
        output.unlink(missing_ok=True)
        raise


def migrate_sqlite(settings, source_path):
    """Import a consistent snapshot into an empty PostgreSQL database, atomically.

    The original SQLite file is never changed. Stop writes before a final cutover.
    Sessions and password reset/OAuth tokens are deliberately not transferred.
    """
    source_path = Path(source_path).resolve()
    if not source_path.is_file():
        raise ValueError("Banco SQLite de origem não encontrado.")
    destination = Database(settings)
    if destination.sqlite:
        destination.engine.dispose()
        raise ValueError("A migração exige DATABASE_URL PostgreSQL como destino.")
    destination.initialize()
    try:
        with tempfile.TemporaryDirectory(prefix="viabileasy-migrate-") as folder:
            snapshot = Path(folder) / "accounts.sqlite"
            with (
                sqlite3.connect(f"file:{source_path}?mode=ro", uri=True) as original,
                sqlite3.connect(snapshot) as clone,
            ):
                original.backup(clone)
            source = Database(
                replace(settings, database_url="", data_dir=Path(folder), environment="development")
            )
            source.initialize()
            try:
                counts = {}
                omitted = {"schema_versions", "sessions", "resets", "oauth", "limits"}
                tables = [table for table in metadata.sorted_tables if table.name not in omitted]
                with source.engine.connect() as read, destination.transaction() as write:
                    execute(write, "SELECT pg_advisory_xact_lock(846142021)")
                    for table in metadata.sorted_tables:
                        if (
                            table.name != "schema_versions"
                            and one(write, f"SELECT COUNT(*) AS count FROM {table.name}")["count"]
                        ):
                            raise ValueError(
                                "O banco de destino precisa estar vazio; nenhum dado foi sobrescrito."
                            )
                    for table in tables:
                        rows = all_rows(read, f"SELECT * FROM {table.name}")
                        allowed = set(table.columns.keys())
                        cleaned = [
                            {key: value for key, value in row.items() if key in allowed} for row in rows
                        ]
                        if cleaned:
                            write.execute(table.insert(), cleaned)
                        counts[table.name] = len(rows)
                        if one(write, f"SELECT COUNT(*) AS count FROM {table.name}")["count"] != len(rows):
                            raise RuntimeError("A conferência da migração falhou.")
                return counts
            finally:
                source.engine.dispose()
    finally:
        destination.engine.dispose()


def main():
    parser = argparse.ArgumentParser(description="Operação do backend ViabilEasy")
    parser.add_argument(
        "--env-file", type=Path, help="Arquivo privado de configuração; variáveis do processo têm prioridade"
    )
    commands = parser.add_subparsers(dest="command", required=True)
    commands.add_parser("init-db", help="Criar/atualizar o esquema sem apagar dados")
    check = commands.add_parser(
        "check-deploy", help="Verificar configuração de produção sem expor segredos nem modificar o banco"
    )
    check.add_argument(
        "--check-database",
        action="store_true",
        help="Testar conexão PostgreSQL com SELECT 1, sem criar tabelas",
    )
    role = commands.add_parser("set-role", help="Atribuir perfil por operação local")
    role.add_argument("email")
    role.add_argument("role", choices=("user", "super_admin"))
    save = commands.add_parser("backup", help="Backup consistente; não sobrescreve arquivos")
    save.add_argument("output")
    migrate = commands.add_parser("migrate-sqlite", help="Importar SQLite para PostgreSQL vazio")
    migrate.add_argument("source")
    args = parser.parse_args()
    if args.env_file is not None and not args.env_file.is_file():
        parser.error("Arquivo de configuração não encontrado.")
    settings = Settings.from_env(args.env_file)
    if args.command == "check-deploy":
        errors = replace(settings, environment="production").validation_errors()
        if not settings.production:
            errors.insert(0, "Defina APP_ENV=production para ativar as proteções de produção.")
        if errors:
            print("Configurações pendentes para produção:")
            for error in errors:
                print("-", error)
            raise SystemExit(1)
        if args.check_database:
            db = None
            try:
                db = Database(settings)
                with db.engine.connect() as conn:
                    execute(conn, "SELECT 1")
            except Exception:
                print("Conexão PostgreSQL falhou. Confira credenciais, host, SSL e acesso de rede.")
                raise SystemExit(1) from None
            finally:
                if db is not None:
                    db.engine.dispose()
            print("Conexão PostgreSQL confirmada; nenhuma tabela foi criada ou alterada.")
        print(
            "Configuração de produção válida. Ainda é necessário conferir conexão, entrega de e-mail e /api/ready no provedor."
        )
        return
    if args.command == "migrate-sqlite":
        counts = migrate_sqlite(settings, args.source)
        print("Migração conferida:", counts, "· usuários precisam entrar novamente.")
        return
    db = Database(settings)
    try:
        if args.command == "backup":
            print("Backup verificado:", backup(db, args.output))
        else:
            db.initialize()
            if args.command == "set-role":
                account = assign_role(db, args.email, args.role)
                print(
                    f"Perfil persistido: {account['email']} · {account['role']} · {account['accountStatus']}"
                )
            else:
                print("Banco inicializado e esquema atualizado.")
    finally:
        db.engine.dispose()


if __name__ == "__main__":
    main()
