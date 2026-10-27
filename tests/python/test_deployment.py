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
