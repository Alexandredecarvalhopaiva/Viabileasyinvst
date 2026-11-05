"""Opt-in browser journey against real local GoTrue, PostgREST and PostgreSQL.

Set GOTRUE_BIN, POSTGREST_BIN and optionally PG_BIN. No hosted credentials are read.
Install Playwright and Chromium separately as described in docs/administracao-contas.md.
"""

import base64
import hashlib
import hmac
import json
import os
import secrets
import socket
import subprocess
import time
from pathlib import Path

import httpx
import psycopg
import pytest

ROOT = Path(__file__).resolve().parents[2]


def free_port():
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


def jwt(secret, role):
    def encode(value):
        return base64.urlsafe_b64encode(value).decode().rstrip("=")

    header = encode(b'{"alg":"HS256","typ":"JWT"}')
    body = encode(json.dumps({"role": role, "exp": int(time.time()) + 3600}).encode())
    signature = encode(hmac.new(secret.encode(), f"{header}.{body}".encode(), hashlib.sha256).digest())
    return f"{header}.{body}.{signature}"


@pytest.fixture
def live_stack(tmp_path):
    gotrue = os.getenv("GOTRUE_BIN")
    postgrest = os.getenv("POSTGREST_BIN")
    if not gotrue or not postgrest:
        pytest.skip("Set GOTRUE_BIN and POSTGREST_BIN for the disposable real-service journey.")
    pytest.importorskip("playwright.sync_api")
    pg = Path(os.getenv("PG_BIN", "/opt/homebrew/opt/postgresql@17/bin"))
    ports = [free_port() for _ in range(4)]
    pg_port, auth_port, rest_port, pages_port = ports
    database = f"postgresql://postgres@127.0.0.1:{pg_port}/postgres"
    origin = f"https://127.0.0.1:{pages_port}"
    secret = secrets.token_urlsafe(48)
    service_key = jwt(secret, "service_role")
    processes, logs = [], []
    pg_started = False

    def run(*args, **kwargs):
        return subprocess.run(args, check=True, capture_output=True, text=True, **kwargs)

    def start(command, env, name):
        log = (tmp_path / f"{name}.log").open("w")
        logs.append(log)
        process = subprocess.Popen(command, env=env, cwd=ROOT, stdout=log, stderr=log)
        processes.append(process)
        return process

    def ready(url, process):
        with httpx.Client(verify=False, trust_env=False) as client:
            for _ in range(150):
                if process.poll() is not None:
                    pytest.fail(f"Local service exited. Inspect {tmp_path.name} test logs.")
                try:
                    if client.get(url).status_code < 500:
                        return
                except httpx.TransportError:
                    pass
                time.sleep(0.1)
        pytest.fail("Local service did not become ready.")

    try:
        run(
            str(pg / "initdb"),
            "-D",
            str(tmp_path / "pg"),
            "-U",
            "postgres",
            "-A",
            "trust",
            "--no-locale",
            "-E",
            "UTF8",
        )
        run(
            str(pg / "pg_ctl"),
            "-D",
            str(tmp_path / "pg"),
            "-l",
            str(tmp_path / "postgres.log"),
            "-o",
            f"-p {pg_port} -k /tmp -h 127.0.0.1",
            "-w",
            "start",
        )
        pg_started = True
        with psycopg.connect(database, autocommit=True) as conn:
            conn.execute(
                "create role anon; create role authenticated; create role service_role bypassrls; create role supabase_auth_admin login; create schema auth"
            )
        env = {
            **os.environ,
            "GOTRUE_JWT_SECRET": secret,
            "GOTRUE_JWT_AUD": "authenticated",
            "GOTRUE_JWT_DEFAULT_GROUP_NAME": "authenticated",
            "GOTRUE_JWT_ADMIN_ROLES": "service_role",
            "GOTRUE_DB_DRIVER": "postgres",
            "DB_NAMESPACE": "auth",
            "DATABASE_URL": database + "?search_path=auth",
            "API_EXTERNAL_URL": f"http://127.0.0.1:{auth_port}",
            "GOTRUE_API_HOST": "127.0.0.1",
            "PORT": str(auth_port),
            "GOTRUE_SITE_URL": origin,
            "GOTRUE_DISABLE_SIGNUP": "true",
            "GOTRUE_MAILER_AUTOCONFIRM": "false",
            "GOTRUE_EXTERNAL_EMAIL_ENABLED": "true",
            "GOTRUE_LOG_LEVEL": "error",
            "GOTRUE_LOG_SQL": "none",
        }
        run(gotrue, "migrate", env=env)
        auth = start([gotrue, "serve"], env, "auth")
        ready(f"http://127.0.0.1:{auth_port}/health", auth)
        with psycopg.connect(database, autocommit=True) as conn:
            conn.execute("""
                create or replace function auth.jwt() returns jsonb language sql stable as
                  $$ select nullif(current_setting('request.jwt.claims',true),'')::jsonb $$;
                create or replace function auth.uid() returns uuid language sql stable as
                  $$ select (auth.jwt()->>'sub')::uuid $$;
            """)
            for migration in sorted((ROOT / "supabase/migrations").glob("*.sql")):
                conn.execute(migration.read_text(), prepare=False)
        rest = start(
            [postgrest],
            {
                **os.environ,
                "PGRST_DB_URI": database,
                "PGRST_DB_SCHEMAS": "public",
                "PGRST_DB_ANON_ROLE": "anon",
                "PGRST_JWT_SECRET": secret,
                "PGRST_SERVER_HOST": "127.0.0.1",
                "PGRST_SERVER_PORT": str(rest_port),
            },
            "rest",
        )
        ready(f"http://127.0.0.1:{rest_port}/", rest)
        key, cert = tmp_path / "tls.key", tmp_path / "tls.pem"
        run(
            "openssl",
            "req",
            "-x509",
            "-newkey",
            "rsa:2048",
            "-nodes",
            "-keyout",
            str(key),
            "-out",
            str(cert),
            "-days",
            "1",
            "-subj",
            "/CN=localhost",
        )
        config = {
            "port": pages_port,
            "auth": f"http://127.0.0.1:{auth_port}",
            "rest": f"http://127.0.0.1:{rest_port}",
            "key": str(key),
            "cert": str(cert),
            "env": {
                "APP_URL": origin,
                "SUPABASE_URL": "https://local.supabase.co",
                "SUPABASE_PUBLISHABLE_KEY": jwt(secret, "anon"),
                "SUPABASE_SECRET_KEY": service_key,
            },
        }
        config_path = tmp_path / "config.json"
        config_path.write_text(json.dumps(config))
        config_path.chmod(0o600)
        pages = start(
            ["node", "tests/supabase/pages-server.mjs"],
            {**os.environ, "ACCOUNTS_TEST_CONFIG": str(config_path)},
            "pages",
        )
        ready(origin + "/api/health", pages)
        # The initial administrator is created solely in this disposable Auth database.
        password = secrets.token_urlsafe(24)
        with httpx.Client(trust_env=False) as client:
            response = client.post(
                config["auth"] + "/admin/users",
                headers={"Authorization": "Bearer " + service_key},
                json={
                    "email": "admin@example.test",
                    "password": password,
                    "email_confirm": True,
                    "user_metadata": {"full_name": "Administrador de teste"},
                },
            )
            assert response.status_code == 200
            uid = response.json()["id"]
        with psycopg.connect(database) as conn:
            conn.execute(
                """insert into viabil_private.profiles(id,email,name,role,account_status,created_at,updated_at,last_seen_at)
                values(%s,'admin@example.test','Administrador de teste','super_admin','approved',1,1,1)""",
                (uid,),
            )
        yield {"origin": origin, "database": database, "password": password, "folder": tmp_path}
    finally:
        for process in reversed(processes):
            process.terminate()
            try:
                process.wait(timeout=10)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait()
        for log in logs:
            log.close()
        if pg_started:
            run(str(pg / "pg_ctl"), "-D", str(tmp_path / "pg"), "-m", "fast", "-w", "stop")


def test_admin_browser_journey_with_real_identity_and_data_services(live_stack):
    from playwright.sync_api import expect, sync_playwright

    origin = live_stack["origin"]
    password = secrets.token_urlsafe(24)
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch()
        admin = browser.new_context(ignore_https_errors=True)
        person = browser.new_context(ignore_https_errors=True)
        page = admin.new_page()
        errors = []
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.goto(origin)
        page.locator("[data-public-login]").first.click()
        page.get_by_label("E-mail", exact=True).fill("admin@example.test")
        page.get_by_label("Senha", exact=True).fill(live_stack["password"])
        page.get_by_role("button", name="Entrar na minha conta").click()
        page.get_by_role("button", name="Cadastrar pessoa", exact=True).click()
        page.get_by_label("Nome", exact=True).fill("Pessoa de homologação")
        page.get_by_label("E-mail", exact=True).fill("person@example.test")
        page.screenshot(path=str(live_stack["folder"] / "create-account-desktop.png"), animations="disabled")
        page.set_viewport_size({"width": 390, "height": 844})
        page.screenshot(path=str(live_stack["folder"] / "create-account-mobile.png"), animations="disabled")
        assert page.locator("html").evaluate("(node) => node.scrollWidth <= innerWidth")
        bounds = page.get_by_role("dialog").bounding_box()
        assert bounds["x"] >= 0 and bounds["x"] + bounds["width"] <= 390
        page.set_viewport_size({"width": 1280, "height": 720})
        with page.expect_response(
            lambda response: response.url == origin + "/api/admin/users" and response.request.method == "POST"
        ) as creation:
            page.get_by_role("button", name="Cadastrar pessoa", exact=True).last.click()
        assert creation.value.status == 201, creation.value.json().get("error")
        link = page.get_by_label("Link de uso único").input_value()
        assert link.startswith(origin + "/#reset=")
        assert not page.get_by_label("Link de uso único").is_editable()
        page.get_by_role("button", name="Fechar", exact=True).click()
        # The token is absent from the screenshot and subsequent browser storage.
        expect(page.get_by_label("Link de uso único")).to_have_count(0)
        page.screenshot(path=str(live_stack["folder"] / "admin-accounts.png"), full_page=True)
        user_page = person.new_page()
        user_page.goto(link)
        expect(user_page.get_by_label("Nova senha", exact=True)).to_be_visible()
        assert "reset=" not in user_page.url
        user_page.get_by_label("Nova senha", exact=True).fill(password)
        user_page.get_by_label("Confirme a nova senha", exact=True).fill(password)
        user_page.get_by_role("button", name="Salvar nova senha").click()
        expect(user_page.get_by_role("button", name="Entrar na minha conta")).to_be_visible()
        with psycopg.connect(live_stack["database"]) as conn:
            state = conn.execute(
                "select account_status,balance,credentials_defined,email_verified from viabil_private.profiles where email='person@example.test'"
            ).fetchone()
            assert state == ("pending", 0, True, False)
        user_page.get_by_label("E-mail", exact=True).fill("person@example.test")
        user_page.get_by_label("Senha", exact=True).fill(password)
        user_page.get_by_role("button", name="Entrar na minha conta").click()
        expect(user_page.get_by_role("heading", name="Seu cadastro está em análise.")).to_be_visible()
        card = page.locator("[data-review-card]").filter(has_text="person@example.test")
        card.get_by_role("button", name="Aprovar acesso").click()
        page.locator(".admin-usage-card").filter(has_text="person@example.test").get_by_role(
            "button", name="Liberar usos"
        ).click()
        page.get_by_label("Quantidade de usos a adicionar").fill("1")
        page.get_by_label("Motivo da liberação").fill("Homologação local")
        page.get_by_role("button", name="Adicionar usos ao saldo").click()
        expect(page.get_by_role("dialog")).to_have_count(0)
        user_page.get_by_role("button", name="Voltar para entrar").click()
        user_page.get_by_label("E-mail", exact=True).fill("person@example.test")
        user_page.get_by_label("Senha", exact=True).fill(password)
        user_page.get_by_role("button", name="Entrar na minha conta").click()
        expect(user_page.locator("body")).to_have_attribute("data-auth", "ready")
        entry = {
            "lot": {"id": "live-lot", "name": "Lote de homologação", "area": 360, "width": 12, "depth": 30},
            "scenario": {
                "floors": 6,
                "to": 50,
                "efficiency": 76,
                "unitArea": 70,
                "use": "H3",
                "price": 8200,
                "cost": 2700,
                "landPrice": 2500000,
                "indirect": 22,
                "profit": 18,
            },
        }
        # Use the browser's real application save entry point, including its HttpOnly session.
        user_page.evaluate("entry => window.ViabilAuth.saveStudy(entry)", entry)
        user_page.evaluate("entry => window.ViabilAuth.saveStudy(entry)", entry)
        assert user_page.evaluate("async () => (await (await fetch('/api/usage')).json()).usage") == {
            "balance": 0,
            "used": 1,
            "unlimited": False,
        }
        assert user_page.evaluate("async () => (await fetch('/api/admin/overview')).status") == 403
        row = page.locator(".admin-table tbody tr").filter(has_text="person@example.test").first
        row.get_by_role("button", name="Bloquear", exact=True).click()
        page.get_by_label("Motivo").fill("Bloqueio em homologação")
        page.get_by_role("button", name="Bloquear conta", exact=True).click()
        expect(page.get_by_role("dialog")).to_have_count(0)
        assert user_page.evaluate("async () => (await fetch('/api/studies')).status") in (401, 403)
        assert not errors
        browser.close()
