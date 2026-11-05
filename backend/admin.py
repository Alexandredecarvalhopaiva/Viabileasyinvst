import json
from uuid import uuid4

from fastapi import APIRouter, Depends, Request
from sqlalchemy.exc import IntegrityError

from .db import all_rows, execute, one
from .security import (
    APIError,
    admin_user,
    body,
    digest,
    email_of,
    field,
    now,
    operation_key,
    public_user,
    token,
    usage,
)

router = APIRouter(prefix="/api/admin", tags=["Administração"])


def account_event(conn, user_id, actor_id, action, key, note):
    previous = one(conn, "SELECT * FROM account_events WHERE user_id=? AND operation_key=?", (user_id, key))
    if previous:
        if previous["actor_id"] != actor_id or previous["action"] != action or previous["note"] != note:
            raise APIError(409, "Esta identificação já foi usada para outra operação.")
        return False
    execute(
        conn,
        "INSERT INTO account_events(id,user_id,actor_id,action,operation_key,note,created_at) VALUES(?,?,?,?,?,?,?)",
        (str(uuid4()), user_id, actor_id, action, key, note, now()),
    )
    return True


def access_link(conn, request, user_id):
    secret = token()
    expires = now() + 1_800_000
    execute(conn, "DELETE FROM resets WHERE user_id=?", (user_id,))
    execute(
        conn, "INSERT INTO resets(hash,user_id,expires_at) VALUES(?,?,?)", (digest(secret), user_id, expires)
    )
    return {
        "accessLink": request.app.state.settings.app_url + "/#reset=" + secret,
        "expiresAt": expires,
        "delivery": "manual",
    }


@router.post("/users", status_code=201)
def create_account(request: Request, data: dict = Depends(body)):
    email = email_of(data.get("email"))
    name = field(data.get("name"), 100, "nome", 2)
    key = operation_key(data.get("requestKey"))
    db = request.app.state.db
    try:
        with db.transaction() as conn:
            admin = admin_user(conn, request, lock=True)
            existing = one(conn, "SELECT * FROM users WHERE creation_key=?", (key,))
            if existing:
                event = one(
                    conn,
                    "SELECT actor_id FROM account_events WHERE user_id=? AND action='created'",
                    (existing["id"],),
                )
                if existing["email"] != email or existing["name"] != name or event["actor_id"] != admin["id"]:
                    raise APIError(409, "Esta identificação já foi usada para outro cadastro.")
                return {"user": public_user(conn, existing), "duplicate": True}
            identifier = str(uuid4())
            execute(
                conn,
                "INSERT INTO users(id,email,name,created_at,updated_at,role,account_status,creation_key) VALUES(?,?,?,?,?,'user','pending',?)",
                (identifier, email, name, now(), now(), key),
            )
            account_event(conn, identifier, admin["id"], "created", key, "Cadastro administrado")
            return {
                "user": public_user(conn, db.lock_user(conn, identifier)),
                **access_link(conn, request, identifier),
            }
    except IntegrityError:
        raise APIError(
            409, "Já existe uma conta com este e-mail ou identificação. Atualize a lista."
        ) from None


@router.post("/users/{identifier}/access-link")
def reissue_link(identifier: str, request: Request, data: dict = Depends(body)):
    note = field(data.get("note"), 250, "motivo", 3)
    key = operation_key(data.get("requestKey"))
    db = request.app.state.db
    with db.transaction() as conn:
        admin = admin_user(conn, request, lock=True)
        target = db.lock_user(conn, identifier)
        if not target or target["role"] != "user":
            raise APIError(400, "Selecione uma conta de usuário comum.")
        if target["disabled_at"] or target["account_status"] == "rejected":
            raise APIError(403, "O acesso desta conta está bloqueado ou recusado.")
        if not account_event(conn, identifier, admin["id"], "access-link", key, note):
            return {"duplicate": True}
        return access_link(conn, request, identifier)


@router.post("/users/{identifier}/status")
def change_status(identifier: str, request: Request, data: dict = Depends(body)):
    blocked = data.get("blocked")
    if not isinstance(blocked, bool):
        raise APIError(400, "Informe se a conta deve ser bloqueada.")
    note = field(data.get("note"), 250, "motivo", 3)
    key = operation_key(data.get("requestKey"))
    db = request.app.state.db
    with db.transaction() as conn:
        admin = admin_user(conn, request, lock=True)
        target = db.lock_user(conn, identifier)
        if not target or target["role"] != "user":
            raise APIError(400, "Selecione uma conta de usuário comum.")
        if account_event(conn, identifier, admin["id"], "blocked" if blocked else "restored", key, note):
            execute(
                conn,
                "UPDATE users SET disabled_at=?,updated_at=? WHERE id=?",
                (now() if blocked else None, now(), identifier),
            )
            for table in ("sessions", "resets", "oauth"):
                execute(conn, f"DELETE FROM {table} WHERE user_id=?", (identifier,))
        return {"user": public_user(conn, db.lock_user(conn, identifier))}


@router.get("/overview")
def overview(request: Request):
    with request.app.state.db.transaction() as conn:
        admin_user(conn, request)
        totals = {
            key: one(conn, sql, params)["count"]
            for key, sql, params in (
                ("users", "SELECT COUNT(*) AS count FROM users", ()),
                ("superAdmins", "SELECT COUNT(*) AS count FROM users WHERE role='super_admin'", ()),
                ("studies", "SELECT COUNT(*) AS count FROM studies", ()),
                ("activeSessions", "SELECT COUNT(*) AS count FROM sessions WHERE expires_at>?", (now(),)),
                (
                    "pendingUsers",
                    "SELECT COUNT(*) AS count FROM users WHERE account_status='pending' AND disabled_at IS NULL",
                    (),
                ),
            )
        }
        pending = all_rows(
            conn,
            "SELECT id,email,name,role,created_at AS \"createdAt\" FROM users WHERE account_status='pending' AND disabled_at IS NULL ORDER BY created_at,id LIMIT 100",
        )
        users = all_rows(
            conn,
            """SELECT u.id,u.email,u.name,u.role,CASE WHEN u.disabled_at IS NOT NULL THEN 'blocked' ELSE u.account_status END AS "accountStatus",u.reviewed_at AS "reviewedAt",
            CASE WHEN u.password_hash IS NOT NULL THEN true ELSE false END AS "hasPassword",CASE WHEN u.email_verified_at IS NOT NULL THEN true ELSE false END AS "emailVerified",
            r.name AS "reviewerName",u.created_at AS "createdAt",
            (SELECT COUNT(*) FROM studies s WHERE s.user_id=u.id) AS "studyCount",COALESCE(w.balance,0) AS "creditBalance",
            (SELECT COUNT(*) FROM credit_ledger l WHERE l.user_id=u.id AND l.kind='use') AS "usedCredits"
            FROM users u LEFT JOIN users r ON r.id=u.reviewed_by LEFT JOIN credit_wallets w ON w.user_id=u.id
            ORDER BY u.created_at DESC,u.id LIMIT 100""",
        )
        recent = all_rows(
            conn,
            """SELECT s.id,s.payload,s.updated_at AS "updatedAt",u.name AS "ownerName",u.email AS "ownerEmail"
            FROM studies s JOIN users u ON u.id=s.user_id ORDER BY s.updated_at DESC,s.user_id,s.id LIMIT 20""",
        )
        for row in recent:
            row["name"] = json.loads(row.pop("payload"))["lot"]["name"]
        return {"totals": totals, "users": users, "pendingUsers": pending, "recentStudies": recent}


@router.post("/users/{identifier}/review")
def review(identifier: str, request: Request, data: dict = Depends(body)):
    decision = data.get("decision")
    if decision not in ("approved", "rejected"):
        raise APIError(400, "Escolha aprovar ou recusar o cadastro.")
    db = request.app.state.db
    with db.transaction() as conn:
        admin = admin_user(conn, request, lock=True)
        if identifier == admin["id"]:
            raise APIError(400, "Você não pode validar o próprio cadastro.")
        target = db.lock_user(conn, identifier)
        if not target:
            raise APIError(404, "Cadastro não encontrado.")
        if target["disabled_at"]:
            raise APIError(403, "O acesso desta conta está bloqueado.")
        note = field(data.get("note", "Revisão administrativa"), 250, "motivo", 3)
        if data.get("requestKey"):
            if not account_event(
                conn, identifier, admin["id"], decision, operation_key(data["requestKey"]), note
            ):
                return {"user": public_user(conn, target), "duplicate": True}
        if target["account_status"] != "pending":
            raise APIError(409, "Este cadastro já foi analisado. Atualize a lista.")
        if not data.get("requestKey"):
            account_event(conn, identifier, admin["id"], decision, str(uuid4()), note)
        execute(
            conn,
            "UPDATE users SET account_status=?,reviewed_by=?,reviewed_at=?,updated_at=? WHERE id=?",
            (decision, admin["id"], now(), now(), identifier),
        )
        execute(conn, "DELETE FROM sessions WHERE user_id=?", (identifier,))
        return {
            "user": one(
                conn,
                'SELECT id,name,email,role,account_status AS "accountStatus",reviewed_at AS "reviewedAt",reviewed_by AS "reviewedBy" FROM users WHERE id=?',
                (identifier,),
            )
        }


@router.post("/users/{identifier}/credits")
def grant(identifier: str, request: Request, data: dict = Depends(body)):
    amount = data.get("amount")
    key = operation_key(data.get("requestKey"))
    note = field(data.get("note", ""), 250, "identificação da liberação")
    if not isinstance(amount, int) or isinstance(amount, bool) or not 1 <= amount <= 1000:
        raise APIError(400, "Informe de 1 a 1.000 créditos.")
    db = request.app.state.db
    with db.transaction() as conn:
        admin = admin_user(conn, request, lock=True)
        user = db.lock_user(conn, identifier)
        if not user:
            raise APIError(404, "Conta não encontrada.")
        if user["account_status"] != "approved" or user["disabled_at"]:
            raise APIError(403, "A conta precisa estar aprovada para utilizar créditos.")
        if user["role"] == "super_admin":
            raise APIError(400, "O superadministrador já possui uso sem limite.")
        previous = one(
            conn,
            "SELECT delta,actor_id,note FROM credit_ledger WHERE user_id=? AND kind='grant' AND operation_key=?",
            (identifier, key),
        )
        note = note or (previous["note"] if previous else "Liberação administrativa")
        if previous:
            if previous["delta"] != amount or previous["actor_id"] != admin["id"] or previous["note"] != note:
                raise APIError(409, "Esta operação já foi utilizada para outra quantidade de créditos.")
            return {"usage": {**usage(conn, user), "duplicate": True}}
        if usage(conn, user)["balance"] + amount > 1_000_000:
            raise APIError(409, "O saldo máximo desta conta foi atingido.")
        row = one(
            conn,
            """INSERT INTO credit_wallets(user_id,balance) VALUES(?,?)
            ON CONFLICT(user_id) DO UPDATE SET balance=credit_wallets.balance+excluded.balance RETURNING balance""",
            (identifier, amount),
        )
        execute(
            conn,
            """INSERT INTO credit_ledger(id,user_id,actor_id,kind,operation_key,delta,balance_after,note,created_at)
            VALUES(?,?,?,'grant',?,?,?,?,?)""",
            (str(uuid4()), identifier, admin["id"], key, amount, row["balance"], note, now()),
        )
        return {"usage": {**usage(conn, user), "duplicate": False}}


def assign_role(db, email, role):
    """Local operator only; never exposed as an HTTP endpoint."""
    if role not in ("user", "super_admin"):
        raise ValueError("Perfil inválido. Use user ou super_admin.")
    with db.transaction() as conn:
        if not db.sqlite:
            execute(conn, "SELECT pg_advisory_xact_lock(846142020)")
        user = one(conn, "SELECT * FROM users WHERE email=?", (email.strip().lower(),))
        if not user:
            raise ValueError("Conta não encontrada. Cadastre o acesso antes de atribuir um perfil.")
        execute(conn, "UPDATE users SET role=?,updated_at=? WHERE id=?", (role, now(), user["id"]))
        if role == "super_admin" and not one(
            conn, "SELECT id FROM users WHERE role='super_admin' AND account_status='approved' LIMIT 1"
        ):
            execute(
                conn,
                "UPDATE users SET account_status='approved',reviewed_at=?,reviewed_by=id WHERE id=? AND account_status='pending'",
                (now(), user["id"]),
            )
        return one(
            conn,
            'SELECT id,email,name,role,account_status AS "accountStatus" FROM users WHERE id=?',
            (user["id"],),
        )
