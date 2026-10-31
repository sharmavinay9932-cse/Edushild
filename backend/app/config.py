import os
import re
from pathlib import Path

from dotenv import load_dotenv

BACKEND_DIR = Path(__file__).resolve().parents[1]
PROJECT_ROOT = BACKEND_DIR.parent
load_dotenv(BACKEND_DIR / ".env")

MYSQL_HOST = os.getenv("EDUSHIELD_MYSQL_HOST", "127.0.0.1")
MYSQL_PORT = int(os.getenv("EDUSHIELD_MYSQL_PORT", "3306"))
MYSQL_USER = os.getenv("EDUSHIELD_MYSQL_USER", "root")
MYSQL_PASSWORD = os.getenv("EDUSHIELD_MYSQL_PASSWORD", "")
MYSQL_DATABASE = os.getenv("EDUSHIELD_MYSQL_DATABASE", "edushield")
MYSQL_CREATE_DATABASE = os.getenv("EDUSHIELD_MYSQL_CREATE_DATABASE", "false").lower() == "true"
FRONTEND_BASE_URL = os.getenv("EDUSHIELD_FRONTEND_URL", "http://localhost:5173").rstrip("/")
SMTP_HOST = os.getenv("EDUSHIELD_SMTP_HOST", "")
SMTP_PORT = int(os.getenv("EDUSHIELD_SMTP_PORT", "587"))
SMTP_USERNAME = os.getenv("EDUSHIELD_SMTP_USERNAME", "")
SMTP_PASSWORD = os.getenv("EDUSHIELD_SMTP_PASSWORD", "")
SMTP_FROM = os.getenv("EDUSHIELD_SMTP_FROM", "")
SMTP_USE_SSL = os.getenv("EDUSHIELD_SMTP_USE_SSL", "false").lower() == "true"

DATASET_PATH = Path(
    os.getenv(
        "EDUSHIELD_DATASET_PATH",
        str(PROJECT_ROOT / "datasets" / "edushield_ai_student_dataset_2500.csv"),
    )
).expanduser()
if not DATASET_PATH.is_absolute():
    DATASET_PATH = (BACKEND_DIR / DATASET_PATH).resolve()

MODEL_PATH = Path(
    os.getenv("EDUSHIELD_MODEL_PATH", str(PROJECT_ROOT / "models" / "dropout_model.joblib"))
).expanduser()
if not MODEL_PATH.is_absolute():
    MODEL_PATH = (BACKEND_DIR / MODEL_PATH).resolve()

JWT_SECRET = os.getenv("EDUSHIELD_JWT_SECRET", "")
ACCESS_TOKEN_MINUTES = int(os.getenv("EDUSHIELD_ACCESS_TOKEN_MINUTES", "60"))
CORS_ORIGINS = [
    origin.strip()
    for origin in os.getenv(
        "EDUSHIELD_CORS_ORIGINS",
        "http://localhost:5173,http://127.0.0.1:5173",
    ).split(",")
    if origin.strip()
]


def validate_settings() -> None:
    if len(JWT_SECRET.encode("utf-8")) < 32 or JWT_SECRET.startswith("replace-with-"):
        raise RuntimeError("Set EDUSHIELD_JWT_SECRET to at least 32 random characters.")
    if ACCESS_TOKEN_MINUTES < 1:
        raise RuntimeError("EDUSHIELD_ACCESS_TOKEN_MINUTES must be a positive integer.")
    if not CORS_ORIGINS:
        raise RuntimeError("Configure at least one trusted EDUSHIELD_CORS_ORIGINS value.")
    if not DATASET_PATH.is_file():
        raise RuntimeError(f"The configured student dataset was not found: {DATASET_PATH}")
    if not MYSQL_HOST.strip() or not MYSQL_USER.strip():
        raise RuntimeError("Configure EDUSHIELD_MYSQL_HOST and EDUSHIELD_MYSQL_USER.")
    if not 1 <= MYSQL_PORT <= 65535:
        raise RuntimeError("EDUSHIELD_MYSQL_PORT must be between 1 and 65535.")
    if not re.fullmatch(r"[A-Za-z0-9_]+", MYSQL_DATABASE):
        raise RuntimeError("EDUSHIELD_MYSQL_DATABASE may contain only letters, digits, and underscores.")
    if not 1 <= SMTP_PORT <= 65535:
        raise RuntimeError("EDUSHIELD_SMTP_PORT must be between 1 and 65535.")
    if not FRONTEND_BASE_URL.startswith(("http://", "https://")):
        raise RuntimeError("EDUSHIELD_FRONTEND_URL must use HTTP or HTTPS.")
