import json
import smtplib
import ssl
from email.message import EmailMessage
from email.utils import parseaddr
from uuid import uuid4

import httpx

from .security import now


class Mailer:
    def __init__(self, settings, transport=None):
        self.settings = settings
        self.transport = transport

    def send(self, message):
        s = self.settings
        if s.brevo_api_key:
            name, email = parseaddr(s.mail_from)
            with httpx.Client(timeout=15, transport=self.transport) as client:
                response = client.post(
                    "https://api.brevo.com/v3/smtp/email",
                    headers={"api-key": s.brevo_api_key},
                    json={
                        "sender": {"name": name or "ViabilEasy", "email": email},
                        "to": [{"email": message["to"]}],
                        "subject": message["subject"],
                        "textContent": message["text"],
                    },
                )
                if not response.is_success:
                    raise RuntimeError("O provedor de e-mail recusou a mensagem.")
        elif s.resend_api_key:
            with httpx.Client(timeout=15, transport=self.transport) as client:
                response = client.post(
                    "https://api.resend.com/emails",
                    headers={"Authorization": "Bearer " + s.resend_api_key},
                    json={
                        "from": s.mail_from,
                        "to": [message["to"]],
                        "subject": message["subject"],
                        "text": message["text"],
                    },
                )
                if not response.is_success:
                    raise RuntimeError("O provedor de e-mail recusou a mensagem.")
        elif s.smtp_host:
            email = EmailMessage()
            email["From"], email["To"], email["Subject"] = s.mail_from, message["to"], message["subject"]
            email.set_content(message["text"])
            smtp_class = smtplib.SMTP_SSL if s.smtp_secure else smtplib.SMTP
            kwargs = {"context": ssl.create_default_context()} if s.smtp_secure else {}
            with smtp_class(s.smtp_host, s.smtp_port, timeout=15, **kwargs) as smtp:
                if not s.smtp_secure:
                    smtp.starttls(context=ssl.create_default_context())
                if s.smtp_user:
                    smtp.login(s.smtp_user, s.smtp_pass)
                smtp.send_message(email)
        else:
            if s.production:
                raise RuntimeError("Envio de e-mail não configurado.")
            folder = s.data_dir / "mail"
            folder.mkdir(mode=0o700, parents=True, exist_ok=True)
            path = folder / f"{now()}-{uuid4()}.json"
            # Open with restrictive permissions before writing reset links.
            import os

            fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
            with os.fdopen(fd, "w") as output:
                json.dump(message, output, ensure_ascii=False)
