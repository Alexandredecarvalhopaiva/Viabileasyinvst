import os
from dataclasses import dataclass
from email.utils import parseaddr
from pathlib import Path
from urllib.parse import urlsplit

from dotenv import load_dotenv
from sqlalchemy.engine import make_url
from sqlalchemy.exc import ArgumentError

ROOT = Path(__file__).resolve().parent.parent


@dataclass(frozen=True)
class Settings:
    app_url: str = "http://127.0.0.1:4173"
    database_url: str = ""
    data_dir: Path = ROOT / ".data"
    environment: str = "development"
    google_client_id: str = ""
    google_client_secret: str = ""
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_secure: bool = False
    smtp_user: str = ""
    smtp_pass: str = ""
    mail_from: str = "ViabilEasy <contato@example.test>"
    resend_api_key: str = ""
    brevo_api_key: str = ""

    @classmethod
    def from_env(cls):
        load_dotenv(ROOT / ".env", override=False)
        return cls(
            app_url=(os.getenv("APP_URL") or os.getenv("RENDER_EXTERNAL_URL") or cls.app_url).rstrip("/"),
            database_url=os.getenv("DATABASE_URL", ""),
            data_dir=Path(os.getenv("DATA_DIR", str(ROOT / ".data"))).resolve(),
            environment=os.getenv("APP_ENV", os.getenv("NODE_ENV", "development")),
            google_client_id=os.getenv("GOOGLE_CLIENT_ID", ""),
            google_client_secret=os.getenv("GOOGLE_CLIENT_SECRET", ""),
            smtp_host=os.getenv("SMTP_HOST", ""),
            smtp_port=int(os.getenv("SMTP_PORT", "587")),
            smtp_secure=os.getenv("SMTP_SECURE", "false").lower() == "true",
            smtp_user=os.getenv("SMTP_USER", ""),
            smtp_pass=os.getenv("SMTP_PASS", ""),
            mail_from=os.getenv("MAIL_FROM", cls.mail_from),
            resend_api_key=os.getenv("RESEND_API_KEY", ""),
            brevo_api_key=os.getenv("BREVO_API_KEY", ""),
        )

    @property
    def production(self):
        return self.environment == "production"

    @property
    def secure(self):
        return urlsplit(self.app_url).scheme == "https"

    @property
    def google_enabled(self):
        return bool(self.google_client_id and self.google_client_secret)

    def validation_errors(self):
        errors = []
        try:
            url = urlsplit(self.app_url)
            valid_port = url.port is None or 1 <= url.port <= 65535
        except ValueError:
            url = urlsplit("")
            valid_port = False
        if (
            url.scheme not in ("http", "https")
            or not url.hostname
            or url.path not in ("", "/")
            or url.query
            or url.fragment
            or url.username
            or url.password
            or not valid_port
        ):
            errors.append("APP_URL precisa ser uma origem HTTP/HTTPS válida, sem caminho.")
        if self.production:
            if url.scheme != "https":
                errors.append("Produção exige APP_URL HTTPS.")
            if not (self.smtp_host or self.resend_api_key or self.brevo_api_key):
                errors.append(
                    "Produção exige BREVO_API_KEY, RESEND_API_KEY ou SMTP para recuperação de senha."
                )
            if not self.database_url.startswith(("postgresql://", "postgres://", "postgresql+psycopg://")):
                errors.append("Produção exige DATABASE_URL PostgreSQL persistente.")
            else:
                try:
                    database = make_url(self.database_url)
                    if not database.host or not database.database or not database.username:
                        raise ValueError()
                    if database.port is not None and not 1 <= database.port <= 65535:
                        raise ValueError()
                    if database.host not in ("localhost", "127.0.0.1", "::1") and database.query.get(
                        "sslmode"
                    ) not in ("require", "verify-ca", "verify-full"):
                        errors.append(
                            "PostgreSQL externo exige sslmode=require, verify-ca ou verify-full em DATABASE_URL."
                        )
                except (ValueError, ArgumentError):
                    errors.append("DATABASE_URL PostgreSQL inválida; confira host, banco e usuário.")
            _, sender = parseaddr(self.mail_from)
            if (
                not sender
                or "@" not in sender
                or "\r" in self.mail_from
                or "\n" in self.mail_from
                or "example." in self.mail_from
                or "seu-dominio" in self.mail_from
            ):
                errors.append("Configure MAIL_FROM com um remetente validado no provedor.")
        if bool(self.google_client_id) != bool(self.google_client_secret):
            errors.append("Configure GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET juntos.")
        return errors

    def validate(self):
        errors = self.validation_errors()
        if errors:
            raise ValueError(" ".join(errors))
