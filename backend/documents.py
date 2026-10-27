import base64
import binascii
import hashlib
import json
import re
from urllib.parse import quote, urlsplit
from uuid import uuid4

from fastapi import APIRouter, Depends, Request
from fastapi.responses import Response
from sqlalchemy.exc import IntegrityError

from .db import all_rows, execute, one
from .security import APIError, active_user, body, field, now

router = APIRouter(prefix="/api/documents", tags=["Documentos"])
MAX_FILE = 10 * 1024 * 1024
FIELDS = '''d.id,d.user_id AS "ownerId",u.name AS "ownerName",d.scope,d.lot_id AS "lotId",d.lot_name AS "lotName",
    d.title,d.issuer,d.reference,d.category,d.source_url AS "sourceURL",d.notes,d.filename,d.size,d.sha256,d.created_at AS "createdAt"'''


def metadata(row):
    return {**row, "url": f"/api/documents/{row['id']}/file", "status": "registered"}


def access(user):
    return (
        ("1=1", ())
        if user["role"] == "super_admin"
        else ("(d.scope='library' OR d.user_id=?)", (user["id"],))
    )


@router.get("")
def list_documents(request: Request, lotId: str = "", page: str = "0"):
    if not re.fullmatch(r"\d{1,5}", page):
        raise APIError(400, "Página inválida.")
    with request.app.state.db.engine.connect() as conn:
        user = active_user(conn, request)
        where, params = access(user)
        if lotId:
            if not re.fullmatch(r"[a-zA-Z0-9_-]{1,80}", lotId):
                raise APIError(400, "Terreno inválido.")
            where += " AND (d.scope='library' OR (d.user_id=? AND d.lot_id=?))"
            params += (user["id"], lotId)
        total = one(conn, "SELECT COUNT(*) AS count FROM documents d WHERE " + where, params)["count"]
        rows = all_rows(
            conn,
            f"SELECT {FIELDS} FROM documents d JOIN users u ON u.id=d.user_id WHERE {where} ORDER BY d.created_at DESC,d.id LIMIT 25 OFFSET ?",
            (*params, int(page) * 25),
        )
        return {
            "documents": [metadata(row) for row in rows],
            "total": total,
            "page": int(page),
            "pageSize": 25,
        }


@router.post("", status_code=201)
def add_document(request: Request, data: dict = Depends(body)):
    scope = data.get("scope")
    if scope not in ("library", "lot"):
        raise APIError(400, "Selecione o destino do documento.")
    values = {
        key: field(data.get(key, ""), maximum, label, minimum)
        for key, maximum, label, minimum in (
            ("title", 160, "título", 1),
            ("issuer", 160, "órgão emissor", 1),
            ("reference", 250, "número e data", 0),
            ("notes", 1500, "trechos relevantes", 0),
            ("filename", 180, "arquivo", 1),
            ("sourceURL", 1500, "link da fonte", 0),
        )
    }
    values["filename"] = re.split(r"[\\/]", values["filename"])[-1]
    if not values["filename"].lower().endswith(".pdf") or data.get("category") not in (
        "legislacao",
        "certidao",
        "planta",
        "matricula",
        "outro",
    ):
        raise APIError(400, "Selecione a categoria e um arquivo PDF.")
    if values["sourceURL"]:
        try:
            url = urlsplit(values["sourceURL"])
            if url.scheme not in ("http", "https") or not url.hostname or url.username or url.password:
                raise ValueError()
        except ValueError:
            raise APIError(400, "Informe um link http ou https válido para a fonte.") from None
    encoded = data.get("pdf")
    if not isinstance(encoded, str) or len(encoded) > ((MAX_FILE + 2) // 3) * 4:
        raise APIError(413, "Use um PDF de até 10 MB.")
    try:
        raw = base64.b64decode(encoded, validate=True)
    except (ValueError, binascii.Error):
        raise APIError(400, "O arquivo PDF está inválido.") from None
    if len(raw) > MAX_FILE:
        raise APIError(413, "Use um PDF de até 10 MB.")
    if not raw.startswith(b"%PDF-") or b"%%EOF" not in raw[-2048:]:
        raise APIError(400, "O arquivo não possui a estrutura esperada de um PDF.")
    sha, identifier = hashlib.sha256(raw).hexdigest(), str(uuid4())
    try:
        with request.app.state.db.transaction() as conn:
            user = active_user(conn, request, lock=True)
            if scope == "library" and user["role"] != "super_admin":
                raise APIError(403, "Somente o superadministrador pode cadastrar legislação geral.")
            lot_id, lot_name = None, None
            if scope == "lot":
                lot_id = field(data.get("lotId"), 80, "terreno", 1)
                study = one(
                    conn, "SELECT payload FROM studies WHERE user_id=? AND id=?", (user["id"], lot_id)
                )
                if not study:
                    raise APIError(404, "Salve o estudo na sua conta antes de anexar documentos ao terreno.")
                lot_name = json.loads(study["payload"])["lot"]["name"]
            quota = one(
                conn,
                "SELECT COUNT(*) AS count,COALESCE(SUM(size),0) AS size FROM documents WHERE user_id=?",
                (user["id"],),
            )
            if quota["count"] >= 100 or quota["size"] + len(raw) > 100 * 1024 * 1024:
                raise APIError(409, "Sua conta atingiu o limite de 100 documentos ou 100 MB.")
            execute(
                conn,
                """INSERT INTO documents(id,user_id,scope,lot_id,lot_name,title,issuer,reference,category,source_url,notes,filename,size,sha256,pdf,created_at)
                VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                (
                    identifier,
                    user["id"],
                    scope,
                    lot_id,
                    lot_name,
                    values["title"],
                    values["issuer"],
                    values["reference"],
                    data["category"],
                    values["sourceURL"],
                    values["notes"],
                    values["filename"],
                    len(raw),
                    sha,
                    raw,
                    now(),
                ),
            )
            return {
                "document": metadata(
                    one(
                        conn,
                        f"SELECT {FIELDS} FROM documents d JOIN users u ON u.id=d.user_id WHERE d.id=?",
                        (identifier,),
                    )
                )
            }
    except IntegrityError:
        raise APIError(409, "Este PDF já está cadastrado neste destino.") from None


@router.get("/{identifier}/file")
def download(identifier: str, request: Request):
    with request.app.state.db.engine.connect() as conn:
        user = active_user(conn, request)
        where, params = access(user)
        row = one(
            conn, f"SELECT d.pdf,d.filename FROM documents d WHERE d.id=? AND {where}", (identifier, *params)
        )
        if not row:
            raise APIError(404, "Documento não encontrado ou sem acesso.")
    return Response(
        bytes(row["pdf"]),
        media_type="application/pdf",
        headers={
            "Cache-Control": "private, no-store",
            "Content-Security-Policy": "default-src 'none'; sandbox",
            "Content-Disposition": "attachment; filename=\"documento.pdf\"; filename*=UTF-8''"
            + quote(row["filename"], safe=""),
        },
    )


@router.delete("/{identifier}")
def delete_document(identifier: str, request: Request):
    with request.app.state.db.transaction() as conn:
        user = active_user(conn, request, lock=True)
        params = (identifier,) if user["role"] == "super_admin" else (identifier, user["id"])
        where = "id=?" if user["role"] == "super_admin" else "id=? AND user_id=?"
        if not execute(conn, "DELETE FROM documents WHERE " + where, params).rowcount:
            raise APIError(404, "Documento não encontrado ou sem acesso.")
    return {"ok": True}
