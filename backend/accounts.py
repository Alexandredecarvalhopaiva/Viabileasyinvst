import base64
import hashlib
import hmac
import logging
from urllib.parse import urlencode, urlsplit
from uuid import uuid4

import httpx
from fastapi import APIRouter, Depends, Request
from fastapi.responses import JSONResponse, RedirectResponse, Response
from google.auth.transport.requests import Request as GoogleRequest
from google.oauth2 import id_token
from sqlalchemy.exc import IntegrityError

from .db import execute, one
from .security import (
    APIError,
    active_user,
    body,
    cookie,
    digest,
    email_of,
    field,
    hash_password,
    issue_session,
    matches,
    now,
    password_of,
    photo_of,
    public_user,
    rate,
    session_hash,
    token,
)

router = APIRouter(prefix="/api", tags=["Contas"])
logger = logging.getLogger(__name__)


def auth_rate(request, label, maximum, duration):
    rate(
        request.app.state.db,
        label + ":" + (request.client.host if request.client else "unknown"),
        maximum,
        duration,
    )


def approval_error(user):
    if user["account_status"] != "approved":
        rejected = user["account_status"] == "rejected"
        raise APIError(
            403,
            "Seu cadastro não foi aprovado pelo superadministrador."
            if rejected
            else "Seu cadastro aguarda aprovação do superadministrador.",
            "ACCOUNT_REJECTED" if rejected else "ACCOUNT_PENDING",
        )


@router.get("/auth/session")
def session(request: Request):
    with request.app.state.db.engine.connect() as conn:
        user = active_user(conn, request, required=False)
        return {
            "user": public_user(conn, user) if user else None,
            "googleEnabled": request.app.state.settings.google_enabled,
        }


@router.post("/auth/register", status_code=201)
def register(request: Request, data: dict = Depends(body)):
    auth_rate(request, "register", 10, 3_600_000)
    email = email_of(data.get("email"))
    name = field(data.get("name"), 100, "nome", 2)
    encoded = hash_password(password_of(data.get("password")))
    user_id = str(uuid4())
    try:
        with request.app.state.db.transaction() as conn:
            execute(
                conn,
                """INSERT INTO users(id,email,name,password_hash,updated_at,created_at,role,account_status)
                VALUES(?,?,?,?,?,?,'user','pending')""",
                (user_id, email, name, encoded, now(), now()),
            )
            user = public_user(conn, one(conn, "SELECT * FROM users WHERE id=?", (user_id,)))
    except IntegrityError:
        raise APIError(
            409, "Não foi possível criar a conta com este e-mail. Tente entrar ou recuperar a senha."
        ) from None
    return {
        "user": user,
        "approvalStatus": "pending",
        "message": "Cadastro recebido. Aguarde a aprovação do superadministrador para acessar as ferramentas.",
    }


@router.post("/auth/login")
def login(request: Request, data: dict = Depends(body)):
    auth_rate(request, "login", 30, 3_600_000)
    email = email_of(data.get("email"))
    rate(request.app.state.db, "login-email:" + digest(email), 12, 900_000)
    password = data.get("password")
    if not isinstance(password, str) or len(password) > 128:
        raise APIError(400, "E-mail ou senha incorretos.")
    db = request.app.state.db
    with db.engine.connect() as conn:
        candidate = one(conn, "SELECT * FROM users WHERE email=?", (email,))
    encoded = candidate["password_hash"] if candidate else None
    if not matches(password, encoded):
        raise APIError(401, "E-mail ou senha incorretos.")
    with db.transaction() as conn:
        user = db.lock_user(conn, candidate["id"])
        if user["password_hash"] != encoded:
            raise APIError(401, "E-mail ou senha incorretos.")
        approval_error(user)
        response = JSONResponse({"user": public_user(conn, user)})
        issue_session(conn, request, response, user["id"], data.get("remember") is True)
    return response


@router.post("/auth/logout")
def logout(request: Request, data: dict = Depends(body)):
    with request.app.state.db.transaction() as conn:
        active_user(conn, request)
        execute(conn, "DELETE FROM sessions WHERE hash=?", (session_hash(request),))
    response = JSONResponse({"ok": True})
    cookie(request, response, "viabileasy_session", "", 0)
    return response


@router.post("/auth/forgot-password")
def forgot(request: Request, data: dict = Depends(body)):
    auth_rate(request, "forgot", 15, 3_600_000)
    email = email_of(data.get("email"))
    result = {
        "message": "Se houver uma conta com esse e-mail, você receberá um link para redefinir sua senha."
    }
    try:
        rate(request.app.state.db, "reset:" + digest(email), 3, 3_600_000)
    except APIError:
        return result
    secret = token()
    with request.app.state.db.transaction() as conn:
        user = one(conn, "SELECT * FROM users WHERE email=?", (email,))
        if not user:
            return result
        execute(
            conn,
            "INSERT INTO resets(hash,user_id,expires_at) VALUES(?,?,?)",
            (digest(secret), user["id"], now() + 1_800_000),
        )
    message = {
        "to": email,
        "subject": "Redefina sua senha · ViabilEasy",
        "text": f"Olá, {user['name']}.\n\nPara criar uma nova senha, abra:\n{request.app.state.settings.app_url}/#reset={secret}\n\nEste link expira em 30 minutos e só pode ser usado uma vez. Se você não pediu a alteração, ignore esta mensagem.\n\nEquipe ViabilEasy",
    }
    try:
        request.app.state.mailer.send(message)
    except Exception:
        with request.app.state.db.transaction() as conn:
            execute(conn, "DELETE FROM resets WHERE hash=?", (digest(secret),))
        logger.warning("Falha no envio do e-mail de recuperação; token revogado.")
    return result


def reset_record(conn, data):
    secret = data.get("token")
    row = (
        one(conn, "SELECT * FROM resets WHERE hash=? AND expires_at>?", (digest(secret), now()))
        if isinstance(secret, str)
        else None
    )
    if not row:
        raise APIError(400, "Este link expirou ou já foi utilizado. Solicite um novo.")
    return row


@router.post("/auth/reset/check")
def reset_check(request: Request, data: dict = Depends(body)):
    auth_rate(request, "reset-check", 30, 900_000)
    with request.app.state.db.engine.connect() as conn:
        reset_record(conn, data)
    return {"valid": True}


@router.post("/auth/reset-password")
def reset_password(request: Request, data: dict = Depends(body)):
    auth_rate(request, "reset-use", 20, 900_000)
    password = password_of(data.get("password"))
    db = request.app.state.db
    with db.engine.connect() as conn:
        pending = reset_record(conn, data)
    encoded = hash_password(password)
    with db.transaction() as conn:
        db.lock_user(conn, pending["user_id"])
        current = reset_record(conn, data)
        execute(
            conn,
            "UPDATE users SET password_hash=?,updated_at=? WHERE id=?",
            (encoded, now(), current["user_id"]),
        )
        for name in ("resets", "sessions", "oauth"):
            execute(conn, f"DELETE FROM {name} WHERE user_id=?", (current["user_id"],))
    response = JSONResponse({"message": "Senha atualizada. Entre com sua nova senha."})
    cookie(request, response, "viabileasy_session", "", 0)
    return response


@router.put("/profile")
def profile(request: Request, data: dict = Depends(body)):
    name = field(data.get("name"), 100, "nome", 2)
    with request.app.state.db.transaction() as conn:
        user = active_user(conn, request, lock=True)
        execute(conn, "UPDATE users SET name=?,updated_at=? WHERE id=?", (name, now(), user["id"]))
        return {"user": public_user(conn, one(conn, "SELECT * FROM users WHERE id=?", (user["id"],)))}


@router.put("/profile/photo")
def photo_update(request: Request, data: dict = Depends(body)):
    if "image" not in data:
        raise APIError(400, "Selecione uma imagem ou informe null para removê-la.")
    image, mime = photo_of(data["image"])
    with request.app.state.db.transaction() as conn:
        user = active_user(conn, request, lock=True)
        execute(
            conn,
            "UPDATE users SET photo=?,photo_type=?,google_photo=NULL,updated_at=? WHERE id=?",
            (image, mime, now(), user["id"]),
        )
        return {"user": public_user(conn, one(conn, "SELECT * FROM users WHERE id=?", (user["id"],)))}


@router.get("/profile/photo")
def photo(request: Request):
    with request.app.state.db.engine.connect() as conn:
        user = active_user(conn, request)
    if not user["photo"]:
        raise APIError(404, "Foto não encontrada.")
    return Response(
        bytes(user["photo"]),
        media_type=user["photo_type"],
        headers={
            "Cache-Control": "private, no-store",
            "Content-Security-Policy": "default-src 'none'; sandbox",
        },
    )


class GoogleIdentity:
    """Network adapter; only verified ID-token claims cross into account logic."""

    def __init__(self, settings):
        self.settings = settings

    def verify(self, code, verifier):
        s = self.settings
        with httpx.Client(timeout=15) as client:
            response = client.post(
                "https://oauth2.googleapis.com/token",
                data={
                    "code": code,
                    "client_id": s.google_client_id,
                    "client_secret": s.google_client_secret,
                    "redirect_uri": s.app_url + "/api/auth/google/callback",
                    "grant_type": "authorization_code",
                    "code_verifier": verifier,
                },
            )
            response.raise_for_status()
            encoded = response.json()["id_token"]
        return id_token.verify_oauth2_token(encoded, GoogleRequest(), s.google_client_id)


@router.get("/auth/google")
def google_start(request: Request):
    s = request.app.state.settings
    if not s.google_enabled:
        return RedirectResponse("/?auth_error=google_unavailable", 303)
    auth_rate(request, "google", 30, 900_000)
    state, verifier, nonce = token(), token(), token()
    link = request.query_params.get("link") == "1"
    with request.app.state.db.transaction() as conn:
        user = active_user(conn, request, required=link)
        execute(
            conn,
            "INSERT INTO oauth(hash,verifier,nonce,user_id,session_hash,expires_at) VALUES(?,?,?,?,?,?)",
            (
                digest(state),
                verifier,
                nonce,
                user["id"] if link else None,
                session_hash(request) if link else None,
                now() + 600_000,
            ),
        )
    params = {
        "client_id": s.google_client_id,
        "redirect_uri": s.app_url + "/api/auth/google/callback",
        "response_type": "code",
        "scope": "openid email profile",
        "state": state,
        "nonce": nonce,
        "prompt": "select_account",
        "code_challenge": base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest())
        .decode()
        .rstrip("="),
        "code_challenge_method": "S256",
    }
    response = RedirectResponse("https://accounts.google.com/o/oauth2/v2/auth?" + urlencode(params), 303)
    cookie(request, response, "viabileasy_oauth", state, 600, "/api/auth/google")
    return response


@router.get("/auth/google/callback")
def google_callback(request: Request):
    def redirect(error=None):
        response = RedirectResponse("/?auth_error=" + error if error else "/", 303)
        cookie(request, response, "viabileasy_oauth", "", 0, "/api/auth/google")
        return response

    state = request.query_params.get("state", "")
    db = request.app.state.db
    with db.transaction() as conn:
        # Atomic consumption prevents replay while network verification is running.
        pending = (
            one(conn, "DELETE FROM oauth WHERE hash=? AND expires_at>? RETURNING *", (digest(state), now()))
            if state
            else None
        )
    if not pending or not hmac.compare_digest(
        digest(state), digest(request.cookies.get("viabileasy_oauth", ""))
    ):
        return redirect("google_expired")
    if request.query_params.get("error"):
        return redirect("google_cancelled")
    try:
        claims = request.app.state.google.verify(request.query_params.get("code", ""), pending["verifier"])
        if (
            not claims.get("sub")
            or claims.get("email_verified") is not True
            or claims.get("nonce") != pending["nonce"]
        ):
            raise ValueError("Invalid identity")
        email = email_of(claims.get("email"))
        with db.transaction() as conn:
            user = one(conn, "SELECT * FROM users WHERE google_sub=?", (claims["sub"],))
            if pending["user_id"]:
                current = active_user(conn, request, required=False, lock=True)
                if (
                    not current
                    or current["id"] != pending["user_id"]
                    or session_hash(request) != pending["session_hash"]
                ):
                    return redirect("google_expired")
                if email != current["email"] or (user and user["id"] != current["id"]):
                    return redirect("google_email")
                execute(
                    conn,
                    "UPDATE users SET google_sub=?,updated_at=? WHERE id=?",
                    (claims["sub"], now(), current["id"]),
                )
                user = one(conn, "SELECT * FROM users WHERE id=?", (current["id"],))
            elif not user:
                if one(conn, "SELECT id FROM users WHERE email=?", (email,)):
                    return redirect("google_conflict")
                picture = urlsplit(claims.get("picture") or "")
                picture_url = (
                    picture.geturl()
                    if picture.scheme == "https"
                    and (picture.hostname or "").endswith(".googleusercontent.com")
                    and not picture.username
                    else None
                )
                user_id = str(uuid4())
                execute(
                    conn,
                    """INSERT INTO users(id,email,name,google_sub,google_photo,updated_at,created_at,role,account_status)
                    VALUES(?,?,?,?,?,?,?,'user','pending')""",
                    (
                        user_id,
                        email,
                        field(claims.get("name") or email.split("@")[0], 100, "nome", 2),
                        claims["sub"],
                        picture_url,
                        now(),
                        now(),
                    ),
                )
                user = one(conn, "SELECT * FROM users WHERE id=?", (user_id,))
            user = db.lock_user(conn, user["id"])
            if user["account_status"] != "approved":
                return redirect(
                    "approval_rejected" if user["account_status"] == "rejected" else "approval_pending"
                )
            response = redirect()
            issue_session(conn, request, response, user["id"], True)
            return response
    except Exception:
        logger.warning("Não foi possível concluir a autenticação Google.")
        return redirect("google_failed")
