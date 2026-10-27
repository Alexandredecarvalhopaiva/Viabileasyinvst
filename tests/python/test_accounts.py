import base64
import re
from dataclasses import replace
from io import BytesIO
from urllib.parse import parse_qs, urlsplit

import pytest
from conftest import ORIGIN, PASSWORD, call, login, signup
from fastapi.testclient import TestClient
from PIL import Image

from backend.admin import assign_role
from backend.db import execute, one
from backend.main import create_app
from backend.security import digest, now


def test_public_frontend_health_and_private_routes(system):
    c = system["client"]
    assert c.get("/").status_code == 200
    assert c.get("/api/health").json()["backend"] == "python"
    assert c.get("/api/ready").status_code == 200
    assert c.get("/api/auth/session").json()["user"] is None
    for path in ("/api/studies", "/api/usage", "/api/profile/photo", "/api/documents", "/api/admin/overview"):
        assert c.get(path).status_code == 401
    for path in ("/.env", "/.data/accounts.sqlite", "/server/accounts.mjs", "/api/unknown"):
        assert c.get(path).status_code == 404


def test_signup_pending_and_no_privilege_injection(system):
    c = system["client"]
    data = {
        "email": "new@example.test",
        "name": "Pessoa Teste",
        "password": PASSWORD,
        "role": "super_admin",
        "account_status": "approved",
        "credits": 999,
    }
    response = call(c, "/api/auth/register", "POST", data)
    assert response.status_code == 201
    user = response.json()["user"]
    assert user["role"] == "user" and user["accountStatus"] == "pending"
    assert user["usage"]["balance"] == 0
    assert "viabileasy_session" not in c.cookies
    assert login(system, data["email"]).json()["code"] == "ACCOUNT_PENDING"
    assert call(c, "/api/auth/register", "POST", data).status_code == 409
    data["email"], data["password"] = "weak@example.test", "weak"
    assert call(c, "/api/auth/register", "POST", data).status_code == 400


def test_bootstrap_only_first_admin_is_approved(system):
    first = signup(system, "first@example.test")
    second = signup(system, "second@example.test")
    db = system["app"].state.db
    assert assign_role(db, first["email"], "super_admin")["accountStatus"] == "approved"
    assert assign_role(db, second["email"], "super_admin")["accountStatus"] == "pending"
    assert login(system, second["email"]).status_code == 403
    assert login(system, first["email"]).status_code == 200
    assert (
        call(
            system["client"], f"/api/admin/users/{first['id']}/review", "POST", {"decision": "rejected"}
        ).status_code
        == 400
    )


def test_approval_review_once_and_regular_users_cannot_review(system, accounts):
    pending = signup(system, "pending@example.test")
    path = f"/api/admin/users/{pending['id']}/review"
    assert call(system["client"], path, "POST", {"decision": "approved"}).status_code == 200
    assert call(system["client"], path, "POST", {"decision": "rejected"}).status_code == 409
    assert login(system, accounts["user"]["email"]).status_code == 200
    assert system["client"].get("/api/admin/overview").status_code == 403
    assert call(system["client"], path, "POST", {"decision": "approved"}).status_code == 403
    rejected = signup(system, "rejected@example.test")
    assert login(system, accounts["admin"]["email"]).status_code == 200
    assert (
        call(
            system["client"], f"/api/admin/users/{rejected['id']}/review", "POST", {"decision": "rejected"}
        ).status_code
        == 200
    )
    assert login(system, rejected["email"]).json()["code"] == "ACCOUNT_REJECTED"


def test_origin_content_type_size_and_invalid_json(system):
    c = system["client"]
    assert (
        call(c, "/api/auth/register", "POST", {}, headers={"Origin": "https://attacker.test"}).status_code
        == 403
    )
    assert c.post("/api/auth/register", json={}).status_code == 403
    h = {"Origin": ORIGIN, "X-Viabileasy-Request": "1"}
    assert c.post("/api/auth/register", content="{}", headers=h).status_code == 415
    for invalid in ("{", "[]", '{"name":NaN}'):
        assert (
            c.post(
                "/api/auth/register", content=invalid, headers={**h, "Content-Type": "application/json"}
            ).status_code
            == 400
        )
    assert call(c, "/api/auth/register", "POST", {"huge": "a" * 800_000}).status_code == 413


def test_profile_photo_logout_and_session_storage(system, accounts):
    c = system["client"]
    login(system, accounts["user"]["email"])
    secret = c.cookies["viabileasy_session"]
    with system["app"].state.db.engine.connect() as conn:
        assert one(conn, "SELECT hash FROM sessions WHERE hash=?", (digest(secret),))
        assert not one(conn, "SELECT hash FROM sessions WHERE hash=?", (secret,))
    updated = call(c, "/api/profile", "PUT", {"name": "Nome Atualizado", "role": "super_admin"}).json()[
        "user"
    ]
    assert updated["name"] == "Nome Atualizado" and updated["role"] == "user"
    image = BytesIO()
    Image.new("RGB", (1, 1)).save(image, format="PNG")
    encoded = "data:image/png;base64," + base64.b64encode(image.getvalue()).decode()
    assert call(c, "/api/profile/photo", "PUT", {"image": encoded}).status_code == 200
    assert c.get("/api/profile/photo").content == image.getvalue()
    assert (
        call(
            c, "/api/profile/photo", "PUT", {"image": "data:image/png;base64,PHN2Zz5hbGVydCgxKTwvc3ZnPg=="}
        ).status_code
        == 400
    )
    login(system, accounts["other"]["email"])
    assert c.get("/api/profile/photo").status_code == 404
    assert call(c, "/api/auth/logout", "POST", {}).status_code == 200
    assert c.get("/api/auth/session").json()["user"] is None
    assert c.get("/api/studies").status_code == 401


def test_reset_generic_single_use_revokes_sessions_and_rejection_survives(system, accounts):
    c = system["client"]
    login(system, accounts["user"]["email"])
    known = call(c, "/api/auth/forgot-password", "POST", {"email": accounts["user"]["email"]})
    unknown = call(c, "/api/auth/forgot-password", "POST", {"email": "unknown@example.test"})
    assert known.json() == unknown.json()
    secret = re.search(r"#reset=([A-Za-z0-9_-]+)", system["mail"].messages[0]["text"])[1]
    assert secret not in known.text
    assert call(c, "/api/auth/reset/check", "POST", {"token": secret}).status_code == 200
    assert (
        call(
            c, "/api/auth/reset-password", "POST", {"token": secret, "password": "nova senha de teste longa"}
        ).status_code
        == 200
    )
    assert c.get("/api/studies").status_code == 401
    assert (
        call(c, "/api/auth/reset-password", "POST", {"token": secret, "password": PASSWORD}).status_code
        == 400
    )
    assert login(system, accounts["user"]["email"]).status_code == 401
    assert login(system, accounts["user"]["email"], "nova senha de teste longa").status_code == 200


def test_reset_expiration_and_delivery_failure(system, accounts):
    c = system["client"]
    system["mail"].fail = True
    assert (
        call(c, "/api/auth/forgot-password", "POST", {"email": accounts["user"]["email"]}).status_code == 200
    )
    db = system["app"].state.db
    with db.transaction() as conn:
        assert one(conn, "SELECT COUNT(*) AS count FROM resets")["count"] == 0
        execute(
            conn,
            "INSERT INTO resets(hash,user_id,expires_at) VALUES(?,?,?)",
            (digest("expired"), accounts["user"]["id"], now() - 1),
        )
    assert call(c, "/api/auth/reset/check", "POST", {"token": "expired"}).status_code == 400


def google_flow(system, email, subject="google-user", link=False, verified=True, nonce_ok=True):
    c = system["client"]
    response = c.get("/api/auth/google" + ("?link=1" if link else ""), follow_redirects=False)
    assert response.status_code == 303
    args = parse_qs(urlsplit(response.headers["location"]).query)
    assert args["code_challenge_method"] == ["S256"]
    system["google"].claims = {
        "sub": subject,
        "email": email,
        "email_verified": verified,
        "nonce": args["nonce"][0] if nonce_ok else "wrong-nonce",
        "name": "Pessoa Google",
    }
    return c.get(
        "/api/auth/google/callback",
        params={"state": args["state"][0], "code": "valid-code"},
        follow_redirects=False,
    ), args


def test_google_pending_and_nonce_cookie_replay_validation(system):
    response, args = google_flow(system, "google@example.test")
    assert response.headers["location"] == "/?auth_error=approval_pending"
    assert system["client"].get("/api/auth/session").json()["user"] is None
    assert (
        system["client"]
        .get(
            "/api/auth/google/callback",
            params={"state": args["state"][0], "code": "valid-code"},
            follow_redirects=False,
        )
        .headers["location"]
        == "/?auth_error=google_expired"
    )
    response, _ = google_flow(system, "nonce@example.test", nonce_ok=False)
    assert response.headers["location"] == "/?auth_error=google_failed"
    response, _ = google_flow(system, "unverified@example.test", verified=False)
    assert response.headers["location"] == "/?auth_error=google_failed"
    start = system["client"].get("/api/auth/google", follow_redirects=False)
    state = parse_qs(urlsplit(start.headers["location"]).query)["state"][0]
    system["client"].cookies.clear()
    response = system["client"].get(
        "/api/auth/google/callback", params={"state": state, "code": "valid-code"}, follow_redirects=False
    )
    assert response.headers["location"] == "/?auth_error=google_expired"


def test_google_conflict_and_authenticated_link(system, accounts):
    system["client"].cookies.clear()
    response, _ = google_flow(system, accounts["user"]["email"])
    assert response.headers["location"] == "/?auth_error=google_conflict"
    login(system, accounts["user"]["email"])
    response, _ = google_flow(system, accounts["user"]["email"], link=True)
    assert response.headers["location"] == "/"
    assert system["client"].get("/api/auth/session").json()["user"]["googleConnected"] is True
    call(system["client"], "/api/auth/logout", "POST", {})
    response, _ = google_flow(system, accounts["user"]["email"])
    assert response.headers["location"] == "/"


def test_sessions_persist_in_fresh_application(system, accounts):
    c = system["client"]
    login(system, accounts["user"]["email"])
    app = create_app(system["settings"], system["mail"], system["google"])
    with TestClient(app, base_url=ORIGIN) as restarted:
        restarted.cookies.update(c.cookies)
        assert restarted.get("/api/auth/session").json()["user"]["email"] == accounts["user"]["email"]


def test_login_rate_limit(system, accounts):
    for _ in range(12):
        assert login(system, "nonexistent@example.test", "wrong").status_code == 401
    assert login(system, "nonexistent@example.test", "wrong").status_code == 429


def test_secure_cookie_and_expired_session(system, accounts):
    app = create_app(
        replace(system["settings"], app_url="https://testserver"), system["mail"], system["google"]
    )
    with TestClient(app, base_url="https://testserver") as client:
        response = client.post(
            "/api/auth/login",
            json={"email": accounts["user"]["email"], "password": PASSWORD, "remember": True},
            headers={"Origin": "https://testserver", "X-Viabileasy-Request": "1"},
        )
        assert response.status_code == 200
        header = response.headers["set-cookie"]
        assert (
            "Secure" in header
            and "HttpOnly" in header
            and "SameSite=lax" in header
            and "Max-Age=2592000" in header
        )
        with app.state.db.transaction() as conn:
            execute(
                conn,
                "UPDATE sessions SET expires_at=? WHERE hash=?",
                (now() - 1, digest(client.cookies["viabileasy_session"])),
            )
        assert client.get("/api/studies").status_code == 401


def test_readiness_detects_missing_schema_version(system):
    with system["app"].state.db.transaction() as conn:
        execute(conn, "DELETE FROM schema_versions")
    assert system["client"].get("/api/ready").status_code == 503


def test_production_requires_persistent_database_https_and_email(tmp_path):
    from backend.config import Settings

    s = Settings(data_dir=tmp_path, environment="production")
    with pytest.raises(ValueError, match="HTTPS"):
        s.validate()
    s = replace(s, app_url="https://example.test")
    with pytest.raises(ValueError, match="SMTP"):
        s.validate()
    with pytest.raises(ValueError, match="PostgreSQL"):
        replace(s, smtp_host="smtp.example.test").validate()
