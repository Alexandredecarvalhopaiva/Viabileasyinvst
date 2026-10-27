import asyncio
import logging
from contextlib import asynccontextmanager, suppress

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.concurrency import run_in_threadpool
from starlette.exceptions import HTTPException
from starlette.staticfiles import StaticFiles

from . import accounts, admin, documents, studies
from .config import ROOT, Settings
from .db import Database, execute, one
from .mail import Mailer
from .security import APIError, now, rate

logger = logging.getLogger(__name__)


def error_response(error):
    return JSONResponse(
        {"error": error.message, **({"code": error.code} if error.code else {})}, status_code=error.status
    )


class RequestLimits:
    """Bound streamed bodies before parsing, including requests without Content-Length."""

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            return await self.app(scope, receive, send)
        path, method = scope["path"], scope["method"]
        if not path.startswith("/api/") or method in ("GET", "HEAD", "OPTIONS"):
            return await self.app(scope, receive, send)
        maximum = 15 * 1024 * 1024 if path == "/api/documents" and method == "POST" else 800_000
        messages, size = [], 0
        while True:
            message = await receive()
            if message["type"] == "http.disconnect":
                return
            size += len(message.get("body", b""))
            if size > maximum:
                response = error_response(APIError(413, "O arquivo ou os dados excedem o limite permitido."))
                return await response(scope, receive, send)
            messages.append(message)
            if not message.get("more_body"):
                break

        async def replay():
            return messages.pop(0) if messages else await receive()

        await self.app(scope, replay, send)


def create_app(
    settings=None, mailer=None, google=None, additional_routers=(), allow_same_origin_frames=False
):
    settings = settings or Settings.from_env()
    settings.validate()
    db = Database(settings)

    @asynccontextmanager
    async def lifespan(app):
        db.initialize()

        def cleanup():
            with db.transaction() as conn:
                for name in ("sessions", "resets", "oauth", "limits"):
                    execute(conn, f"DELETE FROM {name} WHERE expires_at<?", (now(),))

        async def periodic_cleanup():
            while True:
                await asyncio.sleep(600)
                try:
                    await run_in_threadpool(cleanup)
                except Exception:
                    logger.warning("Limpeza de registros expirados será repetida no próximo intervalo.")

        cleanup()
        task = asyncio.create_task(periodic_cleanup())
        try:
            yield
        finally:
            task.cancel()
            with suppress(asyncio.CancelledError):
                await task
            db.engine.dispose()

    app = FastAPI(
        title="ViabilEasy",
        version="0.15.0",
        lifespan=lifespan,
        docs_url="/api/docs",
        redoc_url=None,
        openapi_url="/api/openapi.json",
    )
    app.state.settings, app.state.db = settings, db
    app.state.mailer = mailer or Mailer(settings)
    app.state.google = google or accounts.GoogleIdentity(settings)
    app.add_middleware(RequestLimits)

    @app.middleware("http")
    async def headers_and_origin(request, call_next):
        try:
            if request.url.path.startswith("/api/") and request.method not in ("GET", "HEAD", "OPTIONS"):
                if (
                    request.headers.get("origin") != settings.app_url
                    or request.headers.get("x-viabileasy-request") != "1"
                ):
                    raise APIError(403, "Requisição não autorizada. Recarregue a página e tente novamente.")
                await run_in_threadpool(
                    rate, db, "write:" + (request.client.host if request.client else "unknown"), 180, 900_000
                )
            response = await call_next(request)
        except APIError as error:
            response = error_response(error)
        except Exception as error:
            logger.error("Falha interna (%s)", type(error).__name__)
            response = error_response(APIError(500, "Não foi possível concluir agora. Tente novamente."))
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "SAMEORIGIN" if allow_same_origin_frames else "DENY"
        response.headers["Referrer-Policy"] = "same-origin"
        response.headers["Cache-Control"] = "no-store"
        if settings.production:
            response.headers["Strict-Transport-Security"] = "max-age=31536000"
        return response

    @app.exception_handler(APIError)
    async def api_error(request, error):
        return error_response(error)

    @app.exception_handler(RequestValidationError)
    async def validation_error(request, error):
        return error_response(APIError(400, "Confira os campos enviados."))

    @app.exception_handler(HTTPException)
    async def http_error(request, error):
        return error_response(
            APIError(
                error.status_code,
                "Recurso não encontrado." if error.status_code == 404 else "Requisição não permitida.",
            )
        )

    @app.exception_handler(Exception)
    async def unexpected(request, error):
        # Never return SQL, credentials or provider responses to the browser.
        logger.error("Falha interna em %s (%s)", request.url.path, type(error).__name__)
        return error_response(APIError(500, "Não foi possível concluir agora. Tente novamente."))

    @app.get("/api/health", tags=["Operação"])
    def health():
        return {"status": "ok", "backend": "python", "version": "0.15.0"}

    @app.get("/api/ready", tags=["Operação"])
    def ready():
        try:
            with db.engine.connect() as conn:
                if not one(conn, "SELECT version FROM schema_versions WHERE version=1"):
                    return JSONResponse({"status": "unavailable"}, 503)
            return {"status": "ready"}
        except Exception:
            return JSONResponse({"status": "unavailable"}, 503)

    for router in (accounts.router, studies.router, documents.router, admin.router, *additional_routers):
        app.include_router(router)

    # The frontend's JSON contract is documented even though parsing/limits are shared dependencies.
    for route in app.routes:
        if getattr(route, "methods", set()) & {"POST", "PUT"} and route.path.startswith("/api/"):
            route.openapi_extra = {
                "requestBody": {
                    "required": True,
                    "content": {"application/json": {"schema": {"type": "object"}}},
                }
            }

    @app.api_route(
        "/api/{unknown:path}",
        methods=["GET", "POST", "PUT", "DELETE", "PATCH", "HEAD", "OPTIONS"],
        include_in_schema=False,
    )
    def missing_api(unknown: str, request: Request):
        raise APIError(404, "Recurso não encontrado.")

    app.mount("/", StaticFiles(directory=ROOT / "dist", html=True), name="frontend")
    return app


app = create_app()
