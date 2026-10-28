import getpass
import json
from dataclasses import replace

import httpx
import pytest
from conftest import PASSWORD
from fastapi.testclient import TestClient
from sqlalchemy.engine import make_url

from backend.admin import assign_role
from backend.config import Settings
from backend.mail import Mailer
from backend.main import create_app


def test_deploy_validation_lists_all_missing_settings(tmp_path):
    settings = Settings(data_dir=tmp_path, environment="production")
    errors = settings.validation_errors()
    for key in ("HTTPS", "PostgreSQL", "BREVO_API_KEY", "MAIL_FROM"):
        assert any(key in error for error in errors)


def test_render_origin_and_brevo_are_loaded_without_local_env(monkeypatch):
    monkeypatch.setattr("backend.config.load_dotenv", lambda *args, **kwargs: None)
    monkeypatch.delenv("APP_URL", raising=False)
    monkeypatch.setenv("RENDER_EXTERNAL_URL", "https://viabileasy-test.onrender.com")
    monkeypatch.setenv("BREVO_API_KEY", "test-key")
    settings = Settings.from_env()
    assert settings.app_url == "https://viabileasy-test.onrender.com"
    assert settings.brevo_api_key == "test-key"


@pytest.mark.parametrize(
    "url", ["https://host.test:invalid", "https://host.test:70000", "https://host.test/path"]
)
def test_invalid_public_origins_are_reported(url):
    assert any("APP_URL" in message for message in Settings(app_url=url).validation_errors())


def test_deploy_validation_accepts_brevo_and_never_echoes_database_secret(tmp_path):
    settings = Settings(
        app_url="https://viabileasy-test.onrender.com",
        environment="production",
        data_dir=tmp_path,
        database_url="postgresql://app:private-placeholder@db.test/app?sslmode=require",
        brevo_api_key="test-key",
        mail_from="ViabilEasy <sender@sender.test>",
    )
    assert not settings.validation_errors()
    invalid = replace(settings, database_url="postgresql://app:private-placeholder@db.test:invalid/app")
    errors = invalid.validation_errors()
    assert any("DATABASE_URL" in message for message in errors)
    assert "private-placeholder" not in " ".join(errors)
    insecure = replace(
        settings, database_url="postgresql://app:private-placeholder@db.test/app?sslmode=disable"
    )
    assert any("sslmode" in message for message in insecure.validation_errors())


@pytest.mark.parametrize("provider", ["brevo", "resend"])
def test_password_reset_email_provider_contract(provider):
    captured = []

    def accept(request):
        captured.append(request)
        return httpx.Response(201, json={"id": "test-message"})

    settings = Settings(
        mail_from="ViabilEasy <sender@sender.test>", **{provider + "_api_key": "private-test-key"}
    )
    Mailer(settings, httpx.MockTransport(accept)).send(
        {
            "to": "user@recipient.test",
            "subject": "Recupere seu acesso",
            "text": "https://app.test/#reset=test-reset-token",
        }
    )
    request = captured[0]
    data = json.loads(request.content)
    if provider == "brevo":
        assert str(request.url) == "https://api.brevo.com/v3/smtp/email"
        assert data["sender"]["email"] == "sender@sender.test"
        assert data["to"] == [{"email": "user@recipient.test"}]
        assert "#reset=test-reset-token" in data["textContent"]
    else:
        assert str(request.url) == "https://api.resend.com/emails"
        assert data["to"] == ["user@recipient.test"]
        assert "#reset=test-reset-token" in data["text"]


@pytest.mark.parametrize("provider", ["brevo", "resend"])
def test_mail_provider_failure_does_not_disclose_response_or_key(provider):
    settings = Settings(**{provider + "_api_key": "private-test-key"})
    transport = httpx.MockTransport(lambda request: httpx.Response(403, text="private provider response"))
    with pytest.raises(RuntimeError) as error:
        Mailer(settings, transport).send({"to": "user@recipient.test", "subject": "Teste", "text": "Teste"})
    assert "private" not in str(error.value)


def test_full_production_mode_uses_postgres_https_and_secure_sessions(system):
    if system["database"] != "postgresql":
        pytest.skip("Modo de produção exige a parametrização PostgreSQL.")
    url = make_url(system["settings"].database_url)
    if not url.username:
        url = url.set(username=getpass.getuser())
    origin = "https://viabileasy-test.onrender.com"
    settings = replace(
        system["settings"],
        app_url=origin,
        environment="production",
        database_url=url.render_as_string(hide_password=False),
        brevo_api_key="test-key",
        mail_from="ViabilEasy <sender@sender.test>",
    )
    app = create_app(settings, system["mail"], system["google"])
    with TestClient(app, base_url=origin) as client:
        assert client.get("/").status_code == 200
        assert client.get("/api/ready").status_code == 200
        assert client.get("/").headers["strict-transport-security"] == "max-age=31536000"
        headers = {"Origin": origin, "X-Viabileasy-Request": "1"}
        response = client.post(
            "/api/auth/register",
            json={
                "name": "Administrador de produção de teste",
                "email": "admin@production.test",
                "password": PASSWORD,
            },
            headers=headers,
        )
        assert response.status_code == 201
        assign_role(app.state.db, "admin@production.test", "super_admin")
        response = client.post(
            "/api/auth/login", json={"email": "admin@production.test", "password": PASSWORD}, headers=headers
        )
        assert response.status_code == 200
        assert "Secure" in response.headers["set-cookie"]
        assert client.get("/api/admin/overview").status_code == 200


def test_environment_typo_cannot_disable_production_checks():
    assert any("APP_ENV" in error for error in Settings(environment="prodution").validation_errors())


def test_render_does_not_import_local_development_dotenv(monkeypatch, tmp_path):
    (tmp_path / ".env").write_text("APP_URL=http://127.0.0.1:4173\nDATABASE_URL=sqlite:///local.sqlite\n")
    monkeypatch.setattr("backend.config.ROOT", tmp_path)
    for key in ("APP_URL", "DATABASE_URL"):
        monkeypatch.delenv(key, raising=False)
    monkeypatch.setenv("RENDER", "true")
    monkeypatch.setenv("RENDER_EXTERNAL_URL", "https://deploy.onrender.com")
    settings = Settings.from_env()
    assert settings.app_url == "https://deploy.onrender.com"
    assert settings.database_url == ""


def test_render_mail_policy_rejects_smtp_only(monkeypatch):
    monkeypatch.setattr("backend.config.load_dotenv", lambda *args, **kwargs: None)
    monkeypatch.setenv("APP_ENV", "production")
    monkeypatch.setenv("MAIL_REQUIRE_HTTPS", "true")
    monkeypatch.setenv("SMTP_HOST", "smtp.sender.test")
    monkeypatch.setenv("BREVO_API_KEY", "")
    monkeypatch.setenv("RESEND_API_KEY", "")
    settings = Settings.from_env()
    assert any("MAIL_REQUIRE_HTTPS" in error for error in settings.validation_errors())
    assert not any(
        "MAIL_REQUIRE_HTTPS" in error
        for error in replace(settings, brevo_api_key="test-key").validation_errors()
    )


def production_settings(**changes):
    return Settings(
        app_url="https://deploy.onrender.com",
        environment="production",
        database_url="postgresql://app:private-placeholder@db.test/app?sslmode=require",
        brevo_api_key="test-key",
        mail_from="ViabilEasy <sender@sender.test>",
        **changes,
    )


def test_cli_explicit_env_file_does_not_load_development_file(monkeypatch, tmp_path, capsys):
    from backend.cli import main

    for key in ("APP_URL", "APP_ENV", "DATABASE_URL", "BREVO_API_KEY", "MAIL_FROM"):
        monkeypatch.delenv(key, raising=False)
    config = tmp_path / "production.env"
    config.write_text(
        "APP_URL=https://deploy.onrender.com\nAPP_ENV=production\n"
        "DATABASE_URL=postgresql://app:private-placeholder@db.test/app?sslmode=require\n"
        "BREVO_API_KEY=test-key\nMAIL_FROM=ViabilEasy <sender@sender.test>\n"
    )
    monkeypatch.setattr("sys.argv", ["cli", "--env-file", str(config), "check-deploy"])
    main()
    output = capsys.readouterr().out
    assert "válida" in output
    assert "private-placeholder" not in output


def test_cli_database_failure_is_redacted(monkeypatch, capsys):
    from backend.cli import main

    monkeypatch.setattr(Settings, "from_env", lambda *args: production_settings())
    monkeypatch.setattr("sys.argv", ["cli", "check-deploy", "--check-database"])

    def fail(settings):
        raise RuntimeError("private-placeholder: SQL and provider details")

    monkeypatch.setattr("backend.cli.Database", fail)
    with pytest.raises(SystemExit) as error:
        main()
    assert error.value.code == 1
    output = capsys.readouterr().out
    assert "Conexão PostgreSQL falhou" in output
    assert "private-placeholder" not in output


def test_cli_database_probe_does_not_initialize_schema(system, monkeypatch, capsys):
    if system["database"] != "postgresql":
        pytest.skip("Checagem de produção exige PostgreSQL.")
    from backend.cli import main
    from backend.db import Database

    url = make_url(system["settings"].database_url)
    if not url.username:
        url = url.set(username=getpass.getuser())
    settings = replace(
        production_settings(data_dir=system["settings"].data_dir),
        database_url=url.render_as_string(hide_password=False),
    )
    monkeypatch.setattr(Settings, "from_env", lambda *args: settings)
    monkeypatch.setattr("sys.argv", ["cli", "check-deploy", "--check-database"])

    def forbidden(self):
        pytest.fail("A checagem não pode inicializar nem migrar o schema.")

    monkeypatch.setattr(Database, "initialize", forbidden)
    main()
    assert "Conexão PostgreSQL confirmada" in capsys.readouterr().out


def test_cli_does_not_approve_development_mode_as_production(monkeypatch, capsys):
    from backend.cli import main

    settings = replace(production_settings(), environment="development")
    monkeypatch.setattr(Settings, "from_env", lambda *args: settings)
    monkeypatch.setattr("sys.argv", ["cli", "check-deploy"])
    with pytest.raises(SystemExit) as error:
        main()
    assert error.value.code == 1
    assert "APP_ENV=production" in capsys.readouterr().out
