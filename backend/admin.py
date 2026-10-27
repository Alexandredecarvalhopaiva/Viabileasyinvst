import json
from uuid import uuid4

from fastapi import APIRouter, Depends, Request

from .db import all_rows, execute, one
from .security import APIError, admin_user, body, field, now, operation_key, usage

router = APIRouter(prefix="/api/admin", tags=["Administração"])


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
                ("pendingUsers", "SELECT COUNT(*) AS count FROM users WHERE account_status='pending'", ()),
            )
        }
        pending = all_rows(
            conn,
            "SELECT id,email,name,role,created_at AS \"createdAt\" FROM users WHERE account_status='pending' ORDER BY created_at,id LIMIT 100",
        )
        users = all_rows(
            conn,
            """SELECT u.id,u.email,u.name,u.role,u.account_status AS "accountStatus",u.reviewed_at AS "reviewedAt",
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
        admin = admin_user(conn, request)
        if identifier == admin["id"]:
            raise APIError(400, "Você não pode validar o próprio cadastro.")
        target = db.lock_user(conn, identifier)
        if not target:
            raise APIError(404, "Cadastro não encontrado.")
        if target["account_status"] != "pending":
            raise APIError(409, "Este cadastro já foi analisado. Atualize a lista.")
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
        admin = admin_user(conn, request)
        user = db.lock_user(conn, identifier)
        if not user:
            raise APIError(404, "Conta não encontrada.")
        if user["account_status"] != "approved":
            raise APIError(403, "A conta precisa estar aprovada para utilizar créditos.")
        if user["role"] == "super_admin":
            raise APIError(400, "O superadministrador já possui uso sem limite.")
        previous = one(
            conn,
            "SELECT delta FROM credit_ledger WHERE user_id=? AND kind='grant' AND operation_key=?",
            (identifier, key),
        )
        if previous:
            if previous["delta"] != amount:
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
