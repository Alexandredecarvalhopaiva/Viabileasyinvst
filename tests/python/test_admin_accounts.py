from concurrent.futures import ThreadPoolExecutor
from dataclasses import replace
from urllib.parse import parse_qs, urlsplit

from conftest import ORIGIN, PASSWORD, call, grant, login, study
from fastapi.testclient import TestClient

from backend.db import execute, one
from backend.main import create_app
from backend.security import digest, now


def create(system, key="new-account"):
    return call(
        system["client"],
        "/api/admin/users",
        "POST",
        {
            "email": " New.Person@Example.Test ",
            "name": "Nova Pessoa",
            "requestKey": key,
            "role": "super_admin",
            "credits": 1000,
            "account_status": "approved",
        },
    )


def secret(result):
    return parse_qs(urlsplit(result["accessLink"]).fragment)["reset"][0]


def test_admin_creation_activation_approval_grant_analysis(system, accounts):
    c = system["client"]
    result = create(system)
    assert result.status_code == 201
    data = result.json()
    user = data["user"]
    assert user["email"] == "new.person@example.test"
    assert user["role"] == "user" and user["accountStatus"] == "pending"
    assert user["hasPassword"] is False and user["emailVerified"] is False
    assert user["usage"]["balance"] == 0 and data["delivery"] == "manual"
    assert system["mail"].messages == []
    assert create(system).json() == {"user": user, "duplicate": True}
    assert create(system, "duplicate-email").status_code == 409
    key = secret(data)
    with system["app"].state.db.engine.connect() as conn:
        assert one(conn, "SELECT hash FROM resets WHERE user_id=?", (user["id"],))["hash"] == digest(key)
    assert (
        call(c, "/api/auth/reset-password", "POST", {"token": key, "password": PASSWORD}).status_code == 200
    )
    assert login(system, user["email"]).json()["code"] == "ACCOUNT_PENDING"
    login(system, accounts["admin"]["email"])
    review = {"decision": "approved", "requestKey": "review-new", "note": "Cadastro conferido"}
    path = f"/api/admin/users/{user['id']}/review"
    assert call(c, path, "POST", review).status_code == 200
    assert call(c, path, "POST", review).json()["duplicate"] is True
    assert login(system, user["email"]).json()["user"]["usage"]["balance"] == 0
    assert call(c, "/api/studies/lot-1", "PUT", study()).json()["code"] == "NO_CREDITS"
    login(system, accounts["admin"]["email"])
    assert grant(system, user, 1).status_code == 200
    login(system, user["email"])
    first = call(c, "/api/studies/lot-1", "PUT", study()).json()
    assert first["charged"] is True and first["usage"]["balance"] == 0
    assert call(c, "/api/studies/lot-1", "PUT", study()).json()["charged"] is False
    assert call(c, "/api/studies/lot-1/open", "POST", {}).status_code == 200
    assert c.get("/api/usage").json()["usage"]["used"] == 1
    assert (
        call(c, "/api/auth/reset-password", "POST", {"token": key, "password": PASSWORD}).status_code == 400
    )
    with system["app"].state.db.engine.connect() as conn:
        assert one(conn, "SELECT COUNT(*) AS n FROM account_events WHERE user_id=?", (user["id"],))["n"] == 3


def test_reissue_expiry_and_concurrent_single_use(system, accounts):
    c = system["client"]
    first = create(system).json()
    uid = first["user"]["id"]
    path = f"/api/admin/users/{uid}/access-link"
    data = {"requestKey": "reissue", "note": "Identidade conferida"}
    replacement = call(c, path, "POST", data).json()
    assert call(c, path, "POST", data).json() == {"duplicate": True}
    assert call(c, "/api/auth/reset/check", "POST", {"token": secret(first)}).status_code == 400
    token = secret(replacement)

    def redeem(_):
        with TestClient(system["app"], base_url=ORIGIN) as client:
            return call(
                client, "/api/auth/reset-password", "POST", {"token": token, "password": PASSWORD}
            ).status_code

    with ThreadPoolExecutor(max_workers=2) as pool:
        assert sorted(pool.map(redeem, range(2))) == [200, 400]
    # A new application lifespan above disposed the pool but leaves persistent data intact.
    login(system, accounts["admin"]["email"])
    data["requestKey"] = "expired"
    expired = secret(call(c, path, "POST", data).json())
    with system["app"].state.db.transaction() as conn:
        execute(conn, "UPDATE resets SET expires_at=? WHERE hash=?", (now() - 1, digest(expired)))
    assert call(c, "/api/auth/reset/check", "POST", {"token": expired}).status_code == 400


def test_block_revokes_existing_sessions_and_links_without_changing_balance(system, accounts):
    c = system["client"]
    user = accounts["user"]
    grant(system, user, 3)
    login(system, user["email"])
    existing_cookies = dict(c.cookies)
    login(system, accounts["admin"]["email"])
    path = f"/api/admin/users/{user['id']}/status"
    data = {"blocked": True, "note": "Acesso suspenso pelo responsável", "requestKey": "block-1"}
    assert call(c, path, "POST", data).json()["user"]["accountStatus"] == "blocked"
    assert call(c, path, "POST", data).status_code == 200
    assert login(system, user["email"]).json()["code"] == "ACCOUNT_BLOCKED"
    with TestClient(system["app"], base_url=ORIGIN) as stale:
        stale.cookies.update(existing_cookies)
        assert stale.get("/api/studies").status_code == 401
    login(system, accounts["admin"]["email"])
    assert (
        call(
            c,
            f"/api/admin/users/{user['id']}/access-link",
            "POST",
            {"note": "Teste", "requestKey": "blocked-link"},
        ).status_code
        == 403
    )
    data.update(blocked=False, requestKey="restore-1")
    assert call(c, path, "POST", data).json()["user"]["accountStatus"] == "approved"
    assert login(system, user["email"]).json()["user"]["usage"]["balance"] == 3


def test_administration_requires_server_authorization_and_registration_closed(system, accounts):
    c = system["client"]
    login(system, accounts["user"]["email"])
    assert create(system).status_code == 403
    for suffix in ("access-link", "status"):
        assert (
            call(
                c,
                f"/api/admin/users/{accounts['other']['id']}/{suffix}",
                "POST",
                {"blocked": True, "note": "Teste", "requestKey": "forged"},
            ).status_code
            == 403
        )
    c.cookies.clear()
    assert create(system).status_code == 401
    app = create_app(replace(system["settings"], registration_mode="admin"), system["mail"], system["google"])
    with TestClient(app, base_url=ORIGIN) as client:
        assert (
            call(
                client,
                "/api/auth/register",
                "POST",
                {"email": "public@example.test", "name": "Pessoa", "password": PASSWORD},
            ).status_code
            == 403
        )


def test_failed_study_write_rolls_back_debit_before_retry(system, accounts, monkeypatch):
    from backend import studies

    grant(system, accounts["user"], 1)
    login(system, accounts["user"]["email"])
    original = studies.execute

    def fail_save(conn, sql, params=()):
        if "INSERT INTO studies" in sql:
            raise RuntimeError("Falha simulada na persistência")
        return original(conn, sql, params)

    with monkeypatch.context() as patch:
        patch.setattr(studies, "execute", fail_save)
        assert call(system["client"], "/api/studies/lot-1", "PUT", study()).status_code == 500
    assert system["client"].get("/api/usage").json()["usage"]["balance"] == 1
    assert system["client"].get("/api/studies").json()["studies"] == []
    assert call(system["client"], "/api/studies/lot-1", "PUT", study()).json()["usage"]["balance"] == 0
