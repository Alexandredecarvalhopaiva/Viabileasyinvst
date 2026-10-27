import os
from pathlib import Path
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text
from sqlalchemy.engine import make_url

from backend.admin import assign_role
from backend.config import Settings
from backend.main import create_app

PASSWORD = "senha de teste longa e segura"
ORIGIN = "http://testserver"


class CapturedMail:
    def __init__(self):
        self.messages = []
        self.fail = False

    def send(self, message):
        if self.fail:
            raise RuntimeError("Provedor indisponível")
        self.messages.append(message)


class FakeGoogle:
    def __init__(self):
        self.claims = {}

    def verify(self, code, verifier):
        if code != "valid-code" or not verifier:
            raise ValueError("Código inválido")
        return self.claims


@pytest.fixture(params=["sqlite"] + (["postgresql"] if os.getenv("PG_TEST_DATABASE_URL") else []))
def system(request, tmp_path):
    database_url, engine, schema = "", None, None
    if request.param == "postgresql":
        url = make_url(os.environ["PG_TEST_DATABASE_URL"])
        if url.host not in ("localhost", "127.0.0.1"):
            pytest.fail("O banco PostgreSQL de teste deve ser local e descartável.")
        engine = create_engine(url)
        schema = "test_" + uuid4().hex
        with engine.begin() as conn:
            conn.execute(text(f'CREATE SCHEMA "{schema}"'))
        database_url = url.update_query_dict({"options": "-csearch_path=" + schema}).render_as_string(
            hide_password=False
        )
    settings = Settings(
        app_url=ORIGIN,
        data_dir=Path(tmp_path),
        database_url=database_url,
        google_client_id="test-client",
        google_client_secret="test-secret",
    )
    mailer, google = CapturedMail(), FakeGoogle()
    app = create_app(settings, mailer, google)
    try:
        with TestClient(app, base_url=ORIGIN) as client:
            yield {
                "app": app,
                "client": client,
                "settings": settings,
                "mail": mailer,
                "google": google,
                "database": request.param,
            }
    finally:
        app.state.db.engine.dispose()
        if engine:
            with engine.begin() as conn:
                conn.execute(text(f'DROP SCHEMA "{schema}" CASCADE'))
            engine.dispose()


def call(client, path, method="GET", data=None, **kwargs):
    headers = {"Origin": ORIGIN, "X-Viabileasy-Request": "1", **kwargs.pop("headers", {})}
    return client.request(method, path, json=data, headers=headers, **kwargs)


def signup(system, email, name="Usuário Teste"):
    response = call(
        system["client"], "/api/auth/register", "POST", {"email": email, "name": name, "password": PASSWORD}
    )
    assert response.status_code == 201, response.text
    return response.json()["user"]


def login(system, email, password=PASSWORD, client=None):
    return call(client or system["client"], "/api/auth/login", "POST", {"email": email, "password": password})


@pytest.fixture
def accounts(system):
    admin = signup(system, "admin@example.test", "Administrador Teste")
    assign_role(system["app"].state.db, admin["email"], "super_admin")
    assert login(system, admin["email"]).status_code == 200
    user = signup(system, "user@example.test")
    other = signup(system, "other@example.test", "Outra Pessoa")
    for account in (user, other):
        response = call(
            system["client"], f"/api/admin/users/{account['id']}/review", "POST", {"decision": "approved"}
        )
        assert response.status_code == 200, response.text
    return {"admin": admin, "user": user, "other": other}


def study(identifier="lot-1", **changes):
    return {
        "lot": {"id": identifier, "name": "Terreno Teste", "area": 360, "width": 12, "depth": 30, **changes},
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


def grant(system, user, amount=2, key="release-1"):
    return call(
        system["client"],
        f"/api/admin/users/{user['id']}/credits",
        "POST",
        {"amount": amount, "requestKey": key},
    )
