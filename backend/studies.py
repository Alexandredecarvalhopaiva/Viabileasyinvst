import json
import math
import re
import unicodedata
from datetime import date
from uuid import uuid4

from fastapi import APIRouter, Depends, Request

from .db import all_rows, execute, one
from .security import APIError, active_user, body, compact, digest, finite, now, usage

router = APIRouter(prefix="/api", tags=["Estudos e usos"])


def study_metadata(encoded="{}"):
    return {
        "schemaVersion": 1,
        "stage": "triage",
        "tags": [],
        "note": "",
        "revision": 0,
        "updatedAt": None,
        **json.loads(encoded),
    }


def validate_metadata(data):
    revision, stage, tags, note = (
        data.get("expectedRevision"),
        data.get("stage"),
        data.get("tags"),
        data.get("note", ""),
    )
    if (
        type(revision) is not int
        or not 0 <= revision < 9007199254740991
        or stage not in ("triage", "in_study", "waiting_information", "archived")
        or not isinstance(tags, list)
        or len(tags) > 10
        or not isinstance(note, str)
        or len(note.strip()) > 1000
    ):
        raise APIError(
            400, "Confira a etapa, até 10 etiquetas e a nota de até 1.000 caracteres.", "INVALID_METADATA"
        )
    cleaned, seen = [], set()
    for tag in tags:
        if not isinstance(tag, str) or not 1 <= len(tag.strip()) <= 32:
            raise APIError(400, "Cada etiqueta precisa ter entre 1 e 32 caracteres.", "INVALID_METADATA")
        tag = tag.strip()
        key = re.sub("[\u0300-\u036f]", "", unicodedata.normalize("NFD", tag)).lower()
        if key not in seen:
            seen.add(key)
            cleaned.append(tag)
    return {"schemaVersion": 1, "stage": stage, "tags": cleaned, "note": note.strip()}


def study_id(value):
    if not re.fullmatch(r"[a-zA-Z0-9_-]{1,80}", value):
        raise APIError(400, "Identificação do estudo inválida.")
    return value


def study_of(identifier, data):
    study_id(identifier)
    lot, scenario = data.get("lot"), data.get("scenario")
    if not isinstance(lot, dict) or lot.get("id") != identifier:
        raise APIError(400, "Identificação do estudo inválida.")
    if (
        not isinstance(lot.get("name"), str)
        or not lot["name"].strip()
        or len(lot["name"]) > 120
        or not finite(lot.get("area"))
        or not 0 < lot["area"] <= 1e6
    ):
        raise APIError(400, "Terreno inválido.")
    if not all(finite(lot.get(key)) and 0 < lot[key] <= 20_000 for key in ("width", "depth")):
        raise APIError(400, "Dimensões inválidas.")
    geometry = lot.get("geometry")
    if geometry is not None:
        vertices = geometry.get("vertices") if isinstance(geometry, dict) else None
        if (
            not isinstance(vertices, list)
            or not 3 <= len(vertices) <= 120
            or not all(isinstance(p, list) and len(p) == 2 and all(finite(v) for v in p) for p in vertices)
        ):
            raise APIError(400, "Geometria inválida.")
        for key in ("geographic", "metricCoordinates"):
            points = geometry.get(key)
            if points is not None and (
                not isinstance(points, list)
                or not 3 <= len(points) <= 121
                or not all(isinstance(p, list) and len(p) == 2 and all(finite(v) for v in p) for p in points)
            ):
                raise APIError(400, "Coordenadas da geometria inválidas.")
        if geometry.get("crs") is not None and not isinstance(geometry["crs"], str):
            raise APIError(400, "Referencial da geometria inválido.")
    for key in ("lat", "lng"):
        if lot.get(key) is not None and (
            not finite(lot[key]) or abs(lot[key]) > (90 if key == "lat" else 180)
        ):
            raise APIError(400, "Localização inválida.")
    if not isinstance(scenario, dict):
        raise APIError(400, "Cenário inválido.")
    cleaned = {}
    for key in ("floors", "to", "efficiency", "unitArea", "price", "cost", "landPrice", "indirect", "profit"):
        value = scenario.get(key)
        if not finite(value) or not 0 <= value <= 1e12:
            raise APIError(400, "Cenário inválido.")
        cleaned[key] = value
    if (
        cleaned["floors"] % 1
        or not 1 <= cleaned["floors"] <= 80
        or cleaned["unitArea"] <= 0
        or not 0 < cleaned["efficiency"] <= 100
        or cleaned["to"] > 100
        or cleaned["profit"] > 100
        or cleaned["unitArea"] > 1e6
        or cleaned["price"] > 1e9
        or cleaned["cost"] > 1e9
    ):
        raise APIError(400, "Cenário inválido.")
    if scenario.get("use") not in ("H1", "H3", "Comercial", "Flats", "Misto"):
        raise APIError(400, "Produto inválido.")
    cleaned["use"] = scenario["use"]
    variant = scenario.get("regimeVariant", "general")
    if variant not in ("general", "note-b"):
        raise APIError(400, "Regime de cenário inválido.")
    cleaned["regimeVariant"] = variant
    if "balconyProjectionMeters" in scenario:
        projection = scenario["balconyProjectionMeters"]
        if not finite(projection) or not 0 <= projection <= 0.5:
            raise APIError(400, "Balanço de varanda inválido.")
        cleaned["balconyProjectionMeters"] = projection
    if "finance" in scenario:
        finance = scenario["finance"]
        if not isinstance(finance, dict):
            raise APIError(400, "Premissas financeiras inválidas.")
        result = {}
        for key in ("elevatorCost", "generatorCost", "projectsFloor", "registrationCost", "outorgaCost"):
            if key in finance:
                if not finite(finance[key]) or not 0 <= finance[key] <= 1e9:
                    raise APIError(400, "Orçamento inválido.")
                result[key] = finance[key]
        for key in ("constructionMonths", "salesStartMonth", "salesMonths"):
            if key in finance:
                v = finance[key]
                if not finite(v) or v % 1 or not (0 if key == "salesStartMonth" else 1) <= v <= 120:
                    raise APIError(400, "Cronograma financeiro inválido.")
                result[key] = v
        if "discount" in finance:
            discount = finance["discount"]
            if (
                not isinstance(discount, dict)
                or not finite(discount.get("annualRate"))
                or not 0 <= discount["annualRate"] <= 1
                or not re.fullmatch(r"\d{4}-\d{2}-\d{2}", str(discount.get("date", "")))
                or not isinstance(discount.get("source"), str)
                or not 0 < len(discount["source"]) <= 250
            ):
                raise APIError(400, "Referência de TMA inválida.")
            try:
                date.fromisoformat(discount["date"])
            except ValueError:
                raise APIError(400, "Data da referência de TMA inválida.") from None
            result["discount"] = {k: discount[k] for k in ("annualRate", "date", "source")}
        cleaned["finance"] = result
    payload = {
        "lot": lot,
        "scenario": cleaned,
        **{key: data.get(key) for key in ("polygon", "draft", "context")},
    }
    encoded = compact(payload)
    if len(encoded.encode()) > 150_000:
        raise APIError(413, "Este estudo excede o tamanho permitido.")
    return payload


def analysis_identity(lot):
    def rounded(value, precision=7):
        if not finite(value):
            return None
        number = math.floor(value * 10**precision + 0.5) / 10**precision
        return int(number) if number.is_integer() else number

    g = lot.get("geometry")
    coordinates = None
    if g is not None:
        coordinates = next(
            (g[key] for key in ("geographic", "metricCoordinates", "vertices") if g.get(key) is not None),
            None,
        )
    return compact(
        {
            "area": rounded(lot.get("area"), 2),
            "width": None if g is not None else rounded(lot.get("width"), 3),
            "depth": None if g is not None else rounded(lot.get("depth"), 3),
            "lat": rounded(lot.get("lat")),
            "lng": rounded(lot.get("lng")),
            "coordinates": [
                [rounded(v, 7 if g.get("geographic") is not None else 4) for v in p] for p in coordinates
            ]
            if coordinates is not None
            else None,
            "crs": ("EPSG:4326" if g.get("geographic") is not None else g.get("crs") or "local")
            if g is not None
            else None,
        }
    )


def serialize_study(row):
    return {
        **json.loads(row["payload"]),
        "metadata": study_metadata(row["metadata"]),
        "updatedAt": row["updated_at"],
        "lastOpenedAt": row["last_opened_at"],
    }


@router.get("/usage")
def get_usage(request: Request):
    with request.app.state.db.engine.connect() as conn:
        return {"usage": usage(conn, active_user(conn, request))}


@router.get("/studies")
def list_studies(request: Request):
    with request.app.state.db.engine.connect() as conn:
        user = active_user(conn, request)
        rows = all_rows(
            conn,
            """SELECT payload,metadata,updated_at,last_opened_at FROM studies WHERE user_id=?
            ORDER BY CASE WHEN updated_at>COALESCE(last_opened_at,0) THEN updated_at ELSE COALESCE(last_opened_at,0) END DESC,updated_at DESC,id ASC""",
            (user["id"],),
        )
        return {"studies": [serialize_study(row) for row in rows]}


@router.get("/studies/{identifier}")
def get_study(identifier: str, request: Request):
    study_id(identifier)
    with request.app.state.db.engine.connect() as conn:
        user = active_user(conn, request)
        row = one(conn, "SELECT * FROM studies WHERE user_id=? AND id=?", (user["id"], identifier))
        if not row:
            raise APIError(404, "Estudo não encontrado na sua conta.")
        return {"study": serialize_study(row)}


@router.post("/studies/{identifier}/open")
def open_study(identifier: str, request: Request, data: dict = Depends(body)):
    study_id(identifier)
    with request.app.state.db.transaction() as conn:
        user = active_user(conn, request, lock=True)
        row = one(
            conn,
            "UPDATE studies SET last_opened_at=? WHERE user_id=? AND id=? RETURNING updated_at,last_opened_at",
            (now(), user["id"], identifier),
        )
        if not row:
            raise APIError(404, "Estudo não encontrado na sua conta.")
        return {"updatedAt": row["updated_at"], "lastOpenedAt": row["last_opened_at"]}


@router.get("/studies/{identifier}/metadata")
def get_metadata(identifier: str, request: Request):
    study_id(identifier)
    with request.app.state.db.engine.connect() as conn:
        user = active_user(conn, request)
        row = one(conn, "SELECT metadata FROM studies WHERE user_id=? AND id=?", (user["id"], identifier))
        if not row:
            raise APIError(404, "Estudo não encontrado na sua conta.")
        return {"metadata": study_metadata(row["metadata"])}


@router.put("/studies/{identifier}/metadata")
def save_metadata(identifier: str, request: Request, data: dict = Depends(body)):
    study_id(identifier)
    metadata = validate_metadata(data)
    with request.app.state.db.transaction() as conn:
        # Same owner lock as scenario saves, including the first write of a legacy study.
        user = active_user(conn, request, lock=True)
        row = one(conn, "SELECT metadata FROM studies WHERE user_id=? AND id=?", (user["id"], identifier))
        if not row:
            raise APIError(404, "Estudo não encontrado na sua conta.")
        current = study_metadata(row["metadata"])
        if data["expectedRevision"] != current["revision"]:
            raise APIError(
                409,
                "Este estudo foi organizado em outra sessão. Carregue a revisão atual.",
                "METADATA_CONFLICT",
            )
        metadata.update(revision=current["revision"] + 1, updatedAt=now())
        execute(
            conn,
            "UPDATE studies SET metadata=? WHERE user_id=? AND id=?",
            (compact(metadata), user["id"], identifier),
        )
        return {"metadata": metadata}


@router.put("/studies/{identifier}")
def save_study(identifier: str, request: Request, data: dict = Depends(body)):
    payload = study_of(identifier, data)
    identity = analysis_identity(payload["lot"])
    key = "study:" + identifier + ":" + digest(identity)
    db = request.app.state.db
    with db.transaction() as conn:
        # Lock the owner for the full save/debit transaction, including on PostgreSQL.
        user = active_user(conn, request, lock=True)
        existing = one(
            conn,
            "SELECT payload,metadata,last_opened_at FROM studies WHERE user_id=? AND id=?",
            (user["id"], identifier),
        )
        unchanged = existing and analysis_identity(json.loads(existing["payload"])["lot"]) == identity
        charged = False
        if user["role"] != "super_admin" and not unchanged:
            previous = one(
                conn,
                "SELECT id FROM credit_ledger WHERE user_id=? AND kind='use' AND operation_key=?",
                (user["id"], key),
            )
            if not previous:
                wallet = one(
                    conn,
                    "UPDATE credit_wallets SET balance=balance-1 WHERE user_id=? AND balance>0 RETURNING balance",
                    (user["id"],),
                )
                if not wallet:
                    raise APIError(
                        409,
                        "Seus usos acabaram. Solicite uma nova liberação para iniciar outra análise.",
                        "NO_CREDITS",
                    )
                execute(
                    conn,
                    """INSERT INTO credit_ledger(id,user_id,actor_id,kind,operation_key,delta,balance_after,note,created_at)
                    VALUES(?,?,?,'use',?,-1,?,?,?)""",
                    (str(uuid4()), user["id"], user["id"], key, wallet["balance"], "Orçamento gerado", now()),
                )
                charged = True
        if (
            not existing
            and one(conn, "SELECT COUNT(*) AS count FROM studies WHERE user_id=?", (user["id"],))["count"]
            >= 500
        ):
            raise APIError(409, "Sua conta atingiu o limite de 500 estudos.")
        updated = now()
        execute(
            conn,
            """INSERT INTO studies(user_id,id,payload,updated_at) VALUES(?,?,?,?)
            ON CONFLICT(user_id,id) DO UPDATE SET payload=excluded.payload,updated_at=excluded.updated_at""",
            (user["id"], identifier, compact(payload), updated),
        )
        return {
            "study": {
                **payload,
                "metadata": study_metadata(existing["metadata"] if existing else "{}"),
                "updatedAt": updated,
                "lastOpenedAt": existing["last_opened_at"] if existing else None,
            },
            "usage": usage(conn, user),
            "charged": charged,
        }


@router.delete("/studies/{identifier}")
def delete_study(identifier: str, request: Request):
    study_id(identifier)
    with request.app.state.db.transaction() as conn:
        user = active_user(conn, request, lock=True)
        deleted = execute(conn, "DELETE FROM studies WHERE user_id=? AND id=?", (user["id"], identifier))
        if not deleted.rowcount:
            raise APIError(404, "Estudo não encontrado na sua conta.")
        execute(
            conn,
            "DELETE FROM documents WHERE user_id=? AND scope='lot' AND lot_id=?",
            (user["id"], identifier),
        )
    return {"ok": True}
