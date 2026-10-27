import base64
import hashlib
import hmac
import json
import math
import re
import secrets
import time

from fastapi import Request

from .db import execute, one


class APIError(Exception):
    def __init__(self, status, message, code=None):
        self.status, self.message, self.code = status, message, code


def now():
    return time.time_ns() // 1_000_000


def token():
    return secrets.token_urlsafe(32)


def digest(value):
    return hashlib.sha256(value.encode()).hexdigest()


def compact(value):
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"), allow_nan=False)


def field(value, maximum, label, minimum=0):
    if not isinstance(value, str) or not minimum <= len(value.strip()) <= maximum:
        raise APIError(400, f"Confira o campo {label}.")
    return value.strip()


def email_of(value):
    result = field(value, 254, "e-mail", 3).lower()
    if not re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", result):
        raise APIError(400, "Informe um e-mail válido.")
    return result


def password_of(value):
    if not isinstance(value, str) or not 12 <= len(value) <= 128:
        raise APIError(400, "Use uma senha com 12 a 128 caracteres.")
    return value


def hash_password(password):
    salt = secrets.token_hex(16)
    return (
        salt
        + ":"
        + hashlib.scrypt(
            password.encode(), salt=salt.encode(), n=32768, r=8, p=1, dklen=64, maxmem=64 * 1024 * 1024
        ).hex()
    )


def matches(password, encoded):
    # Node used the hex salt *as a UTF-8 string*, rather than decoded hex bytes.
    salt, expected = (encoded or ("0" * 32 + ":" + "0" * 128)).split(":", 1)
    derived = hashlib.scrypt(
        password.encode(), salt=salt.encode(), n=32768, r=8, p=1, dklen=64, maxmem=64 * 1024 * 1024
    )
    return hmac.compare_digest(derived, bytes.fromhex(expected)) and bool(encoded)


def rate(db, key, maximum, duration):
    timestamp = now()
    with db.transaction() as conn:
        row = one(
            conn,
            """INSERT INTO limits(key,count,expires_at) VALUES(?,1,?)
            ON CONFLICT(key) DO UPDATE SET
            count=CASE WHEN limits.expires_at>? THEN limits.count+1 ELSE 1 END,
            expires_at=CASE WHEN limits.expires_at>? THEN limits.expires_at ELSE excluded.expires_at END
            RETURNING count""",
            (key, timestamp + duration, timestamp, timestamp),
        )
    if row["count"] > maximum:
        raise APIError(429, "Muitas tentativas. Aguarde alguns minutos antes de tentar novamente.")


def session_hash(request):
    return digest(request.cookies.get("viabileasy_session", ""))


def active_user(conn, request, required=True, lock=False):
    user = one(
        conn,
        """SELECT users.* FROM sessions JOIN users ON users.id=sessions.user_id
        WHERE sessions.hash=? AND sessions.expires_at>? AND users.account_status='approved'""",
        (session_hash(request), now()),
    )
    if user and lock:
        user = request.app.state.db.lock_user(conn, user["id"])
        if user["account_status"] != "approved":
            user = None
    if required and not user:
        raise APIError(401, "Sua sessão terminou. Entre novamente para continuar.")
    return user


def admin_user(conn, request, lock=False):
    user = active_user(conn, request, lock=lock)
    if user["role"] != "super_admin":
        raise APIError(403, "Este recurso exige acesso de superadministrador.")
    return user


def usage(conn, user):
    balance = one(conn, "SELECT balance FROM credit_wallets WHERE user_id=?", (user["id"],))
    used = one(
        conn, "SELECT COUNT(*) AS count FROM credit_ledger WHERE user_id=? AND kind='use'", (user["id"],)
    )
    return {
        "unlimited": user["role"] == "super_admin",
        "balance": balance["balance"] if balance else 0,
        "used": used["count"],
    }


def public_user(conn, user):
    return {
        "id": user["id"],
        "email": user["email"],
        "name": user["name"],
        "role": user["role"],
        "accountStatus": user["account_status"],
        "usage": usage(conn, user)
        if user["account_status"] == "approved"
        else {"unlimited": False, "balance": 0, "used": 0},
        "googleConnected": bool(user["google_sub"]),
        "hasPassword": bool(user["password_hash"]),
        "avatar": f"/api/profile/photo?v={user['updated_at']}" if user["photo"] else user["google_photo"],
    }


def cookie(request, response, name, value, max_age=None, path="/"):
    response.set_cookie(
        name,
        value,
        max_age=max_age,
        path=path,
        httponly=True,
        secure=request.app.state.settings.secure,
        samesite="lax",
    )


def issue_session(conn, request, response, user_id, remember=False):
    secret = token()
    ttl = 30 * 86400 if remember else 12 * 3600
    execute(conn, "DELETE FROM sessions WHERE hash=?", (session_hash(request),))
    execute(
        conn,
        "INSERT INTO sessions(hash,user_id,expires_at) VALUES(?,?,?)",
        (digest(secret), user_id, now() + ttl * 1000),
    )
    cookie(request, response, "viabileasy_session", secret, ttl if remember else None)


async def body(request: Request):
    if not re.match(r"^application/json(?:;|$)", request.headers.get("content-type", ""), re.I):
        raise APIError(415, "Envie os dados em JSON.")
    try:
        data = json.loads(await request.body(), parse_constant=lambda _: (_ for _ in ()).throw(ValueError()))
    except (ValueError, UnicodeError, RecursionError):
        raise APIError(400, "Os dados enviados são inválidos.") from None
    if not isinstance(data, dict):
        raise APIError(400, "Os dados enviados são inválidos.")
    return data


def finite(value):
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)


def operation_key(value):
    if not isinstance(value, str) or not re.fullmatch(r"[a-zA-Z0-9:_-]{1,180}", value):
        raise APIError(400, "Identificação da operação inválida.")
    return value


def photo_of(value):
    if value is None:
        return None, None
    match = (
        re.fullmatch(r"data:image/(png|jpeg|webp);base64,([A-Za-z0-9+/]+=*)", value)
        if isinstance(value, str)
        else None
    )
    if not match:
        raise APIError(400, "Selecione uma imagem PNG, JPEG ou WebP.")
    try:
        raw = base64.b64decode(match[2], validate=True)
        if not 12 <= len(raw) <= 450_000:
            raise ValueError()
        # Decode the image instead of accepting a spoofed file signature.
        from io import BytesIO

        from PIL import Image

        with Image.open(BytesIO(raw)) as image:
            if (
                image.format != {"png": "PNG", "jpeg": "JPEG", "webp": "WEBP"}[match[1]]
                or image.width * image.height > 4_000_000
            ):
                raise ValueError()
            image.verify()
    except Exception:
        raise APIError(400, "Use uma imagem válida de até 450 KB após o ajuste.") from None
    return raw, "image/" + match[1]
