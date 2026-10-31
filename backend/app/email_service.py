import smtplib
import ssl
from email.message import EmailMessage
from urllib.parse import quote

from .config import (
    FRONTEND_BASE_URL,
    SMTP_FROM,
    SMTP_HOST,
    SMTP_PASSWORD,
    SMTP_PORT,
    SMTP_USE_SSL,
    SMTP_USERNAME,
)


def password_reset_is_configured() -> bool:
    return bool(
        SMTP_HOST.strip()
        and SMTP_FROM.strip()
        and (bool(SMTP_USERNAME.strip()) == bool(SMTP_PASSWORD))
    )


def send_password_reset_email(recipient: str, token: str) -> None:
    if not password_reset_is_configured():
        raise RuntimeError("Password reset email is not configured.")

    reset_url = f"{FRONTEND_BASE_URL}/reset-password?token={quote(token, safe='')}"
    message = EmailMessage()
    message["Subject"] = "Reset your EduShield password"
    message["From"] = SMTP_FROM
    message["To"] = recipient
    message.set_content(
        "A password reset was requested for your EduShield account.\n\n"
        f"Use this link within 30 minutes:\n{reset_url}\n\n"
        "If you did not request this change, you can ignore this message."
    )

    context = ssl.create_default_context()
    if SMTP_USE_SSL:
        with smtplib.SMTP_SSL(
            SMTP_HOST, SMTP_PORT, timeout=15, context=context
        ) as server:
            if SMTP_USERNAME:
                server.login(SMTP_USERNAME, SMTP_PASSWORD)
            server.send_message(message)
        return

    with smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=15) as server:
        server.ehlo()
        server.starttls(context=context)
        server.ehlo()
        if SMTP_USERNAME:
            server.login(SMTP_USERNAME, SMTP_PASSWORD)
        server.send_message(message)
