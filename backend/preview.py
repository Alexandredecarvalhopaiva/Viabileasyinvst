"""Isolated browser QA, explicitly launched with `python -m backend.preview`.

No production settings, OAuth credentials, mail delivery or existing data are read.
"""

import os
from pathlib import Path
from tempfile import TemporaryDirectory

import uvicorn
from fastapi import APIRouter, Request
from fastapi.responses import FileResponse, HTMLResponse

from .config import ROOT, Settings
from .db import execute
from .main import create_app
from .security import APIError, hash_password, now


def preview_app(folder, port):
    router = APIRouter()
    reports = []

    @router.get("/__audit", response_class=HTMLResponse)
    def audit():
        return (ROOT / "backend/audit.html").read_text()

    @router.get("/__audit-client.js")
    def client_script():
        return FileResponse(ROOT / "scripts/ui-audit-client.js", media_type="application/javascript")

    @router.get("/__audit-results")
    def results():
        return reports

    @router.post("/__audit-results")
    async def save(request: Request):
        if request.headers.get("origin") != f"http://127.0.0.1:{port}":
            raise APIError(403, "Origem inválida.")
        data = await request.body()
        if len(data) > 1_000_000:
            raise APIError(413, "Relatório muito grande.")
        reports.append(await request.json())
        return {"ok": True}

    app = create_app(
        Settings(app_url=f"http://127.0.0.1:{port}", data_dir=Path(folder)),
        additional_routers=(router,),
        allow_same_origin_frames=True,
    )
    app.state.db.initialize()
    with app.state.db.transaction() as conn:
        execute(
            conn,
            """INSERT INTO users(id,email,name,password_hash,updated_at,created_at,role,account_status)
            VALUES(?,?,?,?,?,?,'super_admin','approved')""",
            (
                "ui-audit",
                "ui-audit@example.test",
                "Auditoria UI",
                hash_password("ViabilEasy auditoria 2026!"),
                now(),
                now(),
            ),
        )
    return app


if __name__ == "__main__":
    port = int(os.getenv("AUDIT_PORT", "4181"))
    with TemporaryDirectory(prefix="viabileasy-ui-python-") as folder:
        print(f"Auditoria isolada em http://127.0.0.1:{port}/__audit")
        uvicorn.run(preview_app(folder, port), host="127.0.0.1", port=port, access_log=False)
