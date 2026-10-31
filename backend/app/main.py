import hashlib
import logging
import secrets
import smtplib
import time
from contextlib import asynccontextmanager
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from typing import Annotated, Literal

import mysql.connector
from fastapi import Depends, FastAPI, HTTPException, Query, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator

from .config import (
    ACCESS_TOKEN_MINUTES,
    CORS_ORIGINS,
    DATASET_PATH,
    MYSQL_DATABASE,
    MYSQL_HOST,
    MYSQL_PORT,
    validate_settings,
)
from .database import connection, initialize_database
from .email_service import password_reset_is_configured, send_password_reset_email
from .prediction import PredictionUnavailableError, get_dropout_predictor
from .security import create_access_token, decode_access_token, hash_password, verify_password

Role = Literal["admin", "teacher", "student", "ngo"]
InterventionStatus = Literal["planned", "in_progress", "completed"]
bearer_scheme = HTTPBearer(auto_error=False)
RISK_COLORS = {"Low": "#64867a", "Medium": "#c49a5e", "High": "#bd7062"}
_DUMMY_PASSWORD_HASH = hash_password("not-a-valid-user-password")
LOGGER = logging.getLogger(__name__)

SUPPORT_REQUEST_SELECT = """
    SELECT request.id, request.student_id, account.display_name AS student_name,
        account.email AS student_email, request.category, request.amount, request.details,
        request.status, request.submitted_at, request.updated_at,
        NULL AS offer_status,
        (SELECT ngo.display_name
         FROM ngo_support_request_offers accepted_offer
         JOIN users ngo ON ngo.id = accepted_offer.ngo_user_id
         WHERE accepted_offer.request_id = request.id
           AND accepted_offer.status = 'accepted'
         LIMIT 1) AS accepted_ngo_name,
        (SELECT COUNT(*) FROM ngo_support_request_offers available_offer
         WHERE available_offer.request_id = request.id
           AND available_offer.status = 'offered') AS available_ngo_count
    FROM student_support_requests request
    JOIN users account ON account.id = request.student_user_id
"""
SUPPORT_REQUEST_OFFER_SELECT = SUPPORT_REQUEST_SELECT.replace(
    "NULL AS offer_status",
    "offer.status AS offer_status",
)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=256)
    role: Role


class PasswordResetRequest(BaseModel):
    email: EmailStr


class PasswordResetConfirm(BaseModel):
    token: str = Field(min_length=32, max_length=128, pattern=r"^[A-Za-z0-9_-]+$")
    password: str = Field(min_length=12, max_length=256)


class ManualPredictionRequest(BaseModel):
    attendance: float = Field(ge=0, le=100)
    internalMarks: float = Field(ge=0, le=100)
    previousGpa: float = Field(ge=0, le=10)
    backlogs: int = Field(ge=0, le=50)
    financialConditions: Literal["Stable", "Moderate", "Severe"]

    def model_features(self) -> dict[str, object]:
        return {
            "Attendance": self.attendance,
            "Internal marks": self.internalMarks,
            "Previous GPA": self.previousGpa,
            "Backlogs": self.backlogs,
            "Financial conditions": self.financialConditions,
        }


class UserCreate(BaseModel):
    email: EmailStr
    password: str = Field(min_length=12, max_length=256)
    displayName: str = Field(min_length=1, max_length=120)
    role: Role
    studentId: str | None = Field(default=None, max_length=80)

    @field_validator("displayName")
    @classmethod
    def normalize_display_name(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Display name cannot be blank.")
        return value


class TeacherStudentDetailsCreate(BaseModel):
    email: EmailStr
    displayName: str = Field(min_length=1, max_length=120)
    attendance: float = Field(ge=0, le=100)
    internalMarks: float = Field(ge=0, le=100)
    previousGpa: float = Field(ge=0, le=10)
    backlogs: int = Field(ge=0, le=50)
    financialConditions: Literal["Stable", "Moderate", "Severe"]

    @field_validator("displayName")
    @classmethod
    def normalize_display_name(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Display name cannot be blank.")
        return value


class NGOAssignmentUpdate(BaseModel):
    studentIds: list[str] = Field(max_length=2500)

    @field_validator("studentIds")
    @classmethod
    def validate_student_ids(cls, values: list[str]) -> list[str]:
        normalized = [value.strip() for value in values]
        if any(not value or len(value) > 64 for value in normalized):
            raise ValueError("Student IDs must contain between 1 and 64 characters.")
        if len(set(normalized)) != len(normalized):
            raise ValueError("Student IDs must not contain duplicates.")
        return normalized


class UserStatusUpdate(BaseModel):
    active: bool


class UserPasswordReset(BaseModel):
    password: str = Field(min_length=12, max_length=256)


class InterventionCreate(BaseModel):
    studentId: str = Field(min_length=1, max_length=80)
    title: str = Field(min_length=1, max_length=160)
    notes: str = Field(default="", max_length=4000)
    status: InterventionStatus = "planned"
    dueDate: date | None = None

    @field_validator("studentId", "title")
    @classmethod
    def strip_required_text(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("This field cannot be blank.")
        return value


class InterventionUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: str | None = Field(default=None, min_length=1, max_length=160)
    notes: str | None = Field(default=None, max_length=4000)
    status: InterventionStatus | None = None
    dueDate: date | None = None

    @field_validator("title")
    @classmethod
    def strip_title(cls, value: str | None) -> str | None:
        if value is None:
            return None
        value = value.strip()
        if not value:
            raise ValueError("Title cannot be blank.")
        return value


ExpenseCategory = Literal[
    "tuition",
    "books",
    "transport",
    "school_supplies",
    "exam_fees",
    "accommodation",
    "meals",
    "other",
]


class NGOEducationExpenseCreate(BaseModel):
    category: ExpenseCategory
    description: str = Field(min_length=1, max_length=255)
    amount: Decimal = Field(gt=0, max_digits=10, decimal_places=2)
    expenseDate: date
    studentId: str | None = Field(default=None, min_length=1, max_length=64)

    @field_validator("description")
    @classmethod
    def normalize_description(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Description cannot be blank.")
        return value

    @field_validator("studentId")
    @classmethod
    def normalize_student_id(cls, value: str | None) -> str | None:
        if value is None:
            return None
        value = value.strip()
        if not value:
            raise ValueError("Student ID cannot be blank.")
        return value

    @field_validator("expenseDate")
    @classmethod
    def reject_future_expense_date(cls, value: date) -> date:
        if value > date.today():
            raise ValueError("Expense date cannot be in the future.")
        return value


SupportRequestCategory = Literal[
    "tuition",
    "books",
    "transport",
    "school_supplies",
    "exam_fees",
    "accommodation",
    "meals",
    "other",
]
SupportRequestStatus = Literal[
    "submitted",
    "under_review",
    "referred",
    "approved",
    "accepted",
    "declined",
    "completed",
]


class StudentSupportRequestCreate(BaseModel):
    category: SupportRequestCategory
    amount: Decimal = Field(gt=0, max_digits=10, decimal_places=2)
    details: str = Field(min_length=1, max_length=4000)

    @field_validator("details")
    @classmethod
    def normalize_details(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Request details cannot be blank.")
        return value


class StudentSupportRequestUpdate(BaseModel):
    status: Literal["submitted", "under_review", "approved", "declined"]


def _user_response(row) -> dict:
    return {
        "id": str(row["id"]),
        "email": row["email"],
        "displayName": row["display_name"],
        "role": row["role"],
        "studentId": row["student_id"],
        "active": bool(row["active"]),
        "createdAt": row["created_at"],
    }


def _support_signals(student: dict) -> list[str]:
    signals = []
    if student["attendance"] < 60:
        signals.append("Attendance below 60%")
    if student["internalMarks"] < 40:
        signals.append("Internal marks below 40%")
    if student["previousGpa"] < 5:
        signals.append("Previous GPA below 5")
    if student["activeBacklogs"] >= 2:
        signals.append("Two or more active backlogs")
    if student["financialConditions"] == "Severe":
        signals.append("Severe financial conditions recorded")
    return signals


def _student_response(row) -> dict:
    student = {
        "id": row["student_id"],
        "attendance": row["attendance"],
        "internalMarks": row["internal_marks"],
        "previousGpa": row["previous_gpa"],
        "activeBacklogs": row["active_backlogs"],
        "financialConditions": row["financial_conditions"],
        "dropout": bool(row["dropout"]),
        "riskLevel": row["risk_level"],
    }
    return {**student, "signals": _support_signals(student)}


def _intervention_response(row) -> dict:
    return {
        "id": row["id"],
        "studentId": row["student_id"],
        "title": row["title"],
        "notes": row["notes"],
        "status": row["status"],
        "dueDate": row["due_date"],
        "createdBy": str(row["created_by"]) if row["created_by"] is not None else None,
        "createdAt": row["created_at"],
        "updatedAt": row["updated_at"],
    }


def _ngo_expense_response(row) -> dict:
    return {
        "id": str(row["id"]),
        "studentId": row["student_id"],
        "category": row["category"],
        "description": row["description"],
        "amount": str(row["amount"]),
        "expenseDate": row["expense_date"],
        "createdAt": row["created_at"],
    }


def _support_request_response(row) -> dict:
    return {
        "id": str(row["id"]),
        "studentId": row["student_id"],
        "studentName": row["student_name"],
        "studentEmail": row["student_email"],
        "category": row["category"],
        "amount": str(row["amount"]),
        "details": row["details"],
        "status": row["status"],
        "submittedAt": row["submitted_at"],
        "updatedAt": row["updated_at"],
        "acceptedBy": row.get("accepted_ngo_name"),
        "availableNGOCount": row.get("available_ngo_count", 0),
        "offerStatus": row.get("offer_status"),
    }


def _get_support_request(conn, request_id: int, student_user_id: int | None = None):
    query = SUPPORT_REQUEST_SELECT + " WHERE request.id = %s"
    values = [request_id]
    if student_user_id is not None:
        query += " AND request.student_user_id = %s"
        values.append(student_user_id)
    return conn.execute(query, values).fetchone()


def _teacher_student_details_response(row) -> dict:
    return {
        "studentAccountId": str(row["student_user_id"]),
        "studentName": row["student_name"],
        "studentEmail": row["student_email"],
        "attendance": row["attendance"],
        "internalMarks": row["internal_marks"],
        "previousGpa": row["previous_gpa"],
        "activeBacklogs": row["active_backlogs"],
        "financialConditions": row["financial_conditions"],
        "createdBy": row["teacher_name"],
        "createdAt": row["created_at"],
    }


def _get_student(conn, student_id: str):
    row = conn.execute(
        "SELECT * FROM student_records WHERE student_id = %s", (student_id,)
    ).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="Student record not found.")
    return row


def _require_assigned_student(conn, student_id: str, user: dict) -> None:
    if user["role"] != "ngo":
        return
    assignment = conn.execute(
        "SELECT 1 FROM ngo_student_assignments "
        "WHERE user_id = %s AND student_id = %s",
        (int(user["id"]), student_id),
    ).fetchone()
    if assignment is None:
        raise HTTPException(status_code=404, detail="Student record not found.")


def _get_intervention(conn, intervention_id: int):
    row = conn.execute(
        "SELECT * FROM interventions WHERE id = %s", (intervention_id,)
    ).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="Intervention not found.")
    return row


def _current_user(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer_scheme)],
) -> dict:
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Sign in to access this resource.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    token_data = decode_access_token(credentials.credentials)
    if token_data is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Your session is invalid or expired. Sign in again.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    user_id, token_version = token_data
    with connection() as conn:
        row = conn.execute(
            "SELECT id, email, display_name, role, student_id, active, created_at, token_version "
            "FROM users WHERE id = %s",
            (user_id,),
        ).fetchone()
    if row is None or not row["active"] or row["token_version"] != token_version:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="This account is unavailable. Sign in again.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return _user_response(row)


def _login_attempt_key(email: str, client_ip: str) -> str:
    return hashlib.sha256(f"{email}\0{client_ip}".encode("utf-8")).hexdigest()


def _require_roles(*roles: str):
    def dependency(user: Annotated[dict, Depends(_current_user)]) -> dict:
        if user["role"] not in roles:
            raise HTTPException(status_code=403, detail="Your account cannot access this resource.")
        return user

    return dependency


@asynccontextmanager
async def lifespan(_: FastAPI):
    validate_settings()
    initialize_database()
    yield


app = FastAPI(
    title="EduShield API",
    version="1.0.0",
    description="Role-protected API for EduShield's dataset-backed student support workspace.",
    lifespan=lifespan,
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=False,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
    allow_headers=["Authorization", "Content-Type"],
)


@app.get("/api/health")
def health():
    with connection() as conn:
        count = conn.execute("SELECT COUNT(*) AS count FROM student_records").fetchone()["count"]
    return {"status": "ok", "datasetRecords": count}


@app.post("/api/auth/login")
def login(credentials: LoginRequest, http_request: Request):
    now = int(time.time())
    email = str(credentials.email).strip().lower()
    attempt_key = _login_attempt_key(email, http_request.client.host if http_request.client else "unknown")
    blocked_until = 0
    invalid_credentials = False
    row = None
    with connection() as conn:
        attempt = conn.execute(
            "SELECT attempts, window_started, locked_until FROM login_attempts WHERE attempt_key = %s",
            (attempt_key,),
        ).fetchone()
        if attempt and attempt["locked_until"] > now:
            blocked_until = attempt["locked_until"]
        else:
            if attempt and now - attempt["window_started"] >= 900:
                conn.execute("DELETE FROM login_attempts WHERE attempt_key = %s", (attempt_key,))
                attempt = None
            row = conn.execute(
                "SELECT id, email, display_name, role, password_hash, active, token_version "
                "FROM users WHERE email = %s",
                (email,),
            ).fetchone()
            password_valid = verify_password(
                credentials.password,
                row["password_hash"] if row else _DUMMY_PASSWORD_HASH,
            )
            if (
                row is None
                or not row["active"]
                or row["role"] != credentials.role
                or not password_valid
            ):
                attempts = attempt["attempts"] + 1 if attempt else 1
                window_started = attempt["window_started"] if attempt else now
                locked_until = now + 900 if attempts >= 8 else 0
                conn.execute(
                    "INSERT INTO login_attempts "
                    "(attempt_key, attempts, window_started, locked_until) VALUES (%s, %s, %s, %s) "
                    "ON DUPLICATE KEY UPDATE attempts = VALUES(attempts), "
                    "window_started = VALUES(window_started), locked_until = VALUES(locked_until)",
                    (attempt_key, attempts, window_started, locked_until),
                )
                invalid_credentials = True
            else:
                conn.execute("DELETE FROM login_attempts WHERE attempt_key = %s", (attempt_key,))

    if blocked_until:
        raise HTTPException(
            status_code=429,
            detail="Too many sign-in attempts. Wait 15 minutes and try again.",
            headers={"Retry-After": str(blocked_until - now)},
        )
    if invalid_credentials:
        raise HTTPException(status_code=401, detail="Invalid email, password, or account type.")

    return {
        "accessToken": create_access_token(row["id"], row["token_version"]),
        "tokenType": "bearer",
        "expiresIn": ACCESS_TOKEN_MINUTES * 60,
        "user": {
            "id": str(row["id"]),
            "displayName": row["display_name"],
            "role": row["role"],
        },
    }


@app.post("/api/auth/password-reset", status_code=status.HTTP_202_ACCEPTED)
def request_password_reset(request: PasswordResetRequest, http_request: Request):
    if not password_reset_is_configured():
        raise HTTPException(
            status_code=503,
            detail="Password reset email is not configured. Contact the administrator.",
        )

    email = str(request.email).strip().lower()
    client_ip = http_request.client.host if http_request.client else "unknown"
    attempt_key = hashlib.sha256(
        f"password-reset\0{email}\0{client_ip}".encode("utf-8")
    ).hexdigest()
    now = int(time.time())
    token = secrets.token_urlsafe(32)
    token_hash = hashlib.sha256(token.encode("ascii")).hexdigest()
    user_id = None
    with connection() as conn:
        attempt = conn.execute(
            "SELECT attempts, window_started, locked_until FROM login_attempts "
            "WHERE attempt_key = %s",
            (attempt_key,),
        ).fetchone()
        if attempt and attempt["locked_until"] > now:
            return {"message": "If an active account uses that email, a reset link will be sent."}
        if attempt and now - attempt["window_started"] >= 900:
            conn.execute("DELETE FROM login_attempts WHERE attempt_key = %s", (attempt_key,))
            attempt = None

        attempts = attempt["attempts"] + 1 if attempt else 1
        window_started = attempt["window_started"] if attempt else now
        locked_until = now + 900 if attempts >= 5 else 0
        conn.execute(
            "INSERT INTO login_attempts "
            "(attempt_key, attempts, window_started, locked_until) VALUES (%s, %s, %s, %s) "
            "ON DUPLICATE KEY UPDATE attempts = VALUES(attempts), "
            "window_started = VALUES(window_started), locked_until = VALUES(locked_until)",
            (attempt_key, attempts, window_started, locked_until),
        )

        account = conn.execute(
            "SELECT id FROM users WHERE email = %s AND active = 1",
            (email,),
        ).fetchone()
        if account and attempts < 5:
            recent_cutoff = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(hours=1)
            recent_requests = conn.execute(
                "SELECT COUNT(*) AS count FROM password_reset_tokens "
                "WHERE user_id = %s AND created_at >= %s",
                (account["id"], recent_cutoff),
            ).fetchone()["count"]
            if recent_requests < 3:
                user_id = account["id"]
                conn.execute(
                    "DELETE FROM password_reset_tokens WHERE user_id = %s",
                    (user_id,),
                )
                created_at = datetime.now(timezone.utc).replace(tzinfo=None)
                expires_at = created_at + timedelta(minutes=30)
                conn.execute(
                    "INSERT INTO password_reset_tokens (token_hash, user_id, expires_at, created_at) "
                    "VALUES (%s, %s, %s, %s)",
                    (token_hash, user_id, expires_at, created_at),
                )

    if user_id is not None:
        try:
            send_password_reset_email(email, token)
        except (OSError, RuntimeError, smtplib.SMTPException, ValueError) as error:
            with connection() as conn:
                conn.execute(
                    "DELETE FROM password_reset_tokens WHERE token_hash = %s",
                    (token_hash,),
                )
            LOGGER.exception("Could not send a password reset email.")
            raise HTTPException(
                status_code=503,
                detail="The password reset email could not be sent. Try again later.",
            ) from error

    return {"message": "If an active account uses that email, a reset link will be sent."}


@app.post("/api/auth/password-reset/confirm", status_code=status.HTTP_204_NO_CONTENT)
def confirm_password_reset(request: PasswordResetConfirm):
    token_hash = hashlib.sha256(request.token.encode("ascii")).hexdigest()
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    valid_token = False
    with connection() as conn:
        token_row = conn.execute(
            "SELECT user_id, expires_at FROM password_reset_tokens "
            "WHERE token_hash = %s FOR UPDATE",
            (token_hash,),
        ).fetchone()
        if token_row and token_row["expires_at"] > now:
            conn.execute(
                "UPDATE users SET password_hash = %s, token_version = token_version + 1 "
                "WHERE id = %s",
                (hash_password(request.password), token_row["user_id"]),
            )
            conn.execute(
                "DELETE FROM password_reset_tokens WHERE user_id = %s",
                (token_row["user_id"],),
            )
            valid_token = True
        elif token_row:
            conn.execute(
                "DELETE FROM password_reset_tokens WHERE token_hash = %s",
                (token_hash,),
            )

    if not valid_token:
        raise HTTPException(status_code=400, detail="This reset link is invalid or has expired.")


@app.get("/api/auth/me")
def get_current_account(user: Annotated[dict, Depends(_current_user)]):
    return user


@app.get("/api/users")
def list_users(user: Annotated[dict, Depends(_require_roles("admin"))]):
    with connection() as conn:
        rows = conn.execute(
            "SELECT id, email, display_name, role, student_id, active, created_at "
            "FROM users ORDER BY id"
        ).fetchall()
    return [_user_response(row) for row in rows]


@app.post("/api/users", status_code=status.HTTP_201_CREATED)
def create_user(
    request: UserCreate,
    user: Annotated[dict, Depends(_require_roles("admin"))],
):
    if request.role == "student":
        if request.studentId is not None:
            with connection() as conn:
                _get_student(conn, request.studentId)
    elif request.studentId is not None:
        raise HTTPException(status_code=422, detail="Only student accounts can be linked to a student record.")

    try:
        with connection() as conn:
            cursor = conn.execute(
                "INSERT INTO users (email, display_name, role, password_hash, student_id) "
                "VALUES (%s, %s, %s, %s, %s)",
                (
                    str(request.email).strip().lower(),
                    request.displayName,
                    request.role,
                    hash_password(request.password),
                    request.studentId if request.role == "student" else None,
                ),
            )
            row = conn.execute(
                "SELECT id, email, display_name, role, student_id, active, created_at "
                "FROM users WHERE id = %s",
                (cursor.lastrowid,),
            ).fetchone()
    except mysql.connector.IntegrityError as error:
        if error.errno == 1062:
            raise HTTPException(status_code=409, detail="An account already uses this email address.") from error
        raise
    return _user_response(row)


@app.post("/api/teacher/students", status_code=status.HTTP_201_CREATED)
def create_teacher_student(
    request: TeacherStudentDetailsCreate,
    teacher: Annotated[dict, Depends(_require_roles("teacher"))],
):
    temporary_password = secrets.token_urlsafe(16)
    normalized_email = str(request.email).strip().lower()
    try:
        with connection() as conn:
            account_cursor = conn.execute(
                "INSERT INTO users (email, display_name, role, password_hash) "
                "VALUES (%s, %s, 'student', %s)",
                (
                    normalized_email,
                    request.displayName,
                    hash_password(temporary_password),
                ),
            )
            student_user_id = account_cursor.lastrowid
            conn.execute(
                "INSERT INTO teacher_student_details "
                "(student_user_id, attendance, internal_marks, previous_gpa, "
                "active_backlogs, financial_conditions, created_by) "
                "VALUES (%s, %s, %s, %s, %s, %s, %s)",
                (
                    student_user_id,
                    request.attendance,
                    request.internalMarks,
                    request.previousGpa,
                    request.backlogs,
                    request.financialConditions,
                    int(teacher["id"]),
                ),
            )
            row = conn.execute(
                "SELECT details.student_user_id, account.display_name AS student_name, "
                "account.email AS student_email, details.attendance, details.internal_marks, "
                "details.previous_gpa, details.active_backlogs, details.financial_conditions, "
                "creator.display_name AS teacher_name, details.created_at "
                "FROM teacher_student_details details "
                "JOIN users account ON account.id = details.student_user_id "
                "LEFT JOIN users creator ON creator.id = details.created_by "
                "WHERE details.student_user_id = %s",
                (student_user_id,),
            ).fetchone()
    except mysql.connector.IntegrityError as error:
        if error.errno == 1062:
            raise HTTPException(
                status_code=409,
                detail="An account already uses this student email address.",
            ) from error
        raise
    return {
        "student": _teacher_student_details_response(row),
        "temporaryPassword": temporary_password,
    }


@app.get("/api/staff/student-details")
def list_teacher_student_details(
    _: Annotated[dict, Depends(_require_roles("admin", "teacher"))],
):
    with connection() as conn:
        rows = conn.execute(
            "SELECT details.student_user_id, account.display_name AS student_name, "
            "account.email AS student_email, details.attendance, details.internal_marks, "
            "details.previous_gpa, details.active_backlogs, details.financial_conditions, "
            "creator.display_name AS teacher_name, details.created_at "
            "FROM teacher_student_details details "
            "JOIN users account ON account.id = details.student_user_id "
            "LEFT JOIN users creator ON creator.id = details.created_by "
            "ORDER BY details.created_at DESC, details.student_user_id DESC"
        ).fetchall()
    return [_teacher_student_details_response(row) for row in rows]


@app.get("/api/users/{user_id}/assigned-students")
def get_assigned_students(
    user_id: int,
    _: Annotated[dict, Depends(_require_roles("admin"))],
):
    with connection() as conn:
        target = conn.execute(
            "SELECT id, role FROM users WHERE id = %s", (user_id,)
        ).fetchone()
        if target is None:
            raise HTTPException(status_code=404, detail="Account not found.")
        if target["role"] != "ngo":
            raise HTTPException(status_code=409, detail="Assignments are only available for NGO accounts.")
        rows = conn.execute(
            "SELECT student_id FROM ngo_student_assignments "
            "WHERE user_id = %s ORDER BY student_id",
            (user_id,),
        ).fetchall()
    return {"studentIds": [row["student_id"] for row in rows]}


@app.put("/api/users/{user_id}/assigned-students")
def update_assigned_students(
    user_id: int,
    request: NGOAssignmentUpdate,
    user: Annotated[dict, Depends(_require_roles("admin"))],
):
    with connection() as conn:
        target = conn.execute(
            "SELECT id, role FROM users WHERE id = %s FOR UPDATE",
            (user_id,),
        ).fetchone()
        if target is None:
            raise HTTPException(status_code=404, detail="Account not found.")
        if target["role"] != "ngo":
            raise HTTPException(status_code=409, detail="Assignments are only available for NGO accounts.")
        if request.studentIds:
            placeholders = ", ".join(["%s"] * len(request.studentIds))
            found = conn.execute(
                f"SELECT student_id FROM student_records WHERE student_id IN ({placeholders})",
                request.studentIds,
            ).fetchall()
            found_ids = {row["student_id"] for row in found}
            if found_ids != set(request.studentIds):
                raise HTTPException(status_code=422, detail="One or more student IDs do not exist.")

        conn.execute("DELETE FROM ngo_student_assignments WHERE user_id = %s", (user_id,))
        if request.studentIds:
            conn.executemany(
                "INSERT INTO ngo_student_assignments (user_id, student_id, assigned_by) "
                "VALUES (%s, %s, %s)",
                [(user_id, student_id, int(user["id"])) for student_id in request.studentIds],
            )
    return {"studentIds": request.studentIds}


@app.patch("/api/users/{user_id}/status")
def update_user_status(
    user_id: int,
    request: UserStatusUpdate,
    user: Annotated[dict, Depends(_require_roles("admin"))],
):
    with connection() as conn:
        target = conn.execute(
            "SELECT id, role, active FROM users WHERE id = %s", (user_id,)
        ).fetchone()
        if target is None:
            raise HTTPException(status_code=404, detail="Account not found.")
        if not request.active and str(user_id) == user["id"]:
            raise HTTPException(status_code=409, detail="You cannot disable your own account.")
        if not request.active and target["role"] == "admin" and target["active"]:
            active_admins = conn.execute(
                "SELECT COUNT(*) AS count FROM users WHERE role = 'admin' AND active = 1"
            ).fetchone()["count"]
            if active_admins <= 1:
                raise HTTPException(status_code=409, detail="At least one active administrator must remain.")
        conn.execute(
            "UPDATE users SET active = %s, token_version = token_version + 1 "
            "WHERE id = %s AND active != %s",
            (int(request.active), user_id, int(request.active)),
        )
        updated = conn.execute(
            "SELECT id, email, display_name, role, student_id, active, created_at "
            "FROM users WHERE id = %s",
            (user_id,),
        ).fetchone()
    return _user_response(updated)


@app.patch("/api/users/{user_id}/password", status_code=status.HTTP_204_NO_CONTENT)
def reset_user_password(
    user_id: int,
    request: UserPasswordReset,
    _: Annotated[dict, Depends(_require_roles("admin"))],
):
    with connection() as conn:
        result = conn.execute(
            "UPDATE users SET password_hash = %s, token_version = token_version + 1 WHERE id = %s",
            (hash_password(request.password), user_id),
        )
        if result.rowcount == 0:
            raise HTTPException(status_code=404, detail="Account not found.")


@app.get("/api/ngo/expenses")
def list_ngo_education_expenses(
    user: Annotated[dict, Depends(_require_roles("ngo"))],
):
    month_start = date.today().replace(day=1)
    user_id = int(user["id"])
    with connection() as conn:
        rows = conn.execute(
            "SELECT id, student_id, category, description, amount, expense_date, created_at "
            "FROM ngo_education_expenses WHERE ngo_user_id = %s "
            "ORDER BY expense_date DESC, id DESC",
            (user_id,),
        ).fetchall()
        totals = conn.execute(
            "SELECT COUNT(*) AS expense_count, COALESCE(SUM(amount), 0) AS total_amount, "
            "COALESCE(SUM(CASE WHEN expense_date >= %s THEN amount ELSE 0 END), 0) "
            "AS month_amount FROM ngo_education_expenses WHERE ngo_user_id = %s",
            (month_start, user_id),
        ).fetchone()
    return {
        "expenses": [_ngo_expense_response(row) for row in rows],
        "expenseCount": totals["expense_count"],
        "totalAmount": str(totals["total_amount"]),
        "monthAmount": str(totals["month_amount"]),
    }


@app.post("/api/ngo/expenses", status_code=status.HTTP_201_CREATED)
def create_ngo_education_expense(
    request: NGOEducationExpenseCreate,
    user: Annotated[dict, Depends(_require_roles("ngo"))],
):
    user_id = int(user["id"])
    with connection() as conn:
        if request.studentId is not None:
            _require_assigned_student(conn, request.studentId, user)
            _get_student(conn, request.studentId)
        cursor = conn.execute(
            "INSERT INTO ngo_education_expenses "
            "(ngo_user_id, student_id, category, description, amount, expense_date) "
            "VALUES (%s, %s, %s, %s, %s, %s)",
            (
                user_id,
                request.studentId,
                request.category,
                request.description,
                request.amount,
                request.expenseDate,
            ),
        )
        row = conn.execute(
            "SELECT id, student_id, category, description, amount, expense_date, created_at "
            "FROM ngo_education_expenses WHERE id = %s AND ngo_user_id = %s",
            (cursor.lastrowid, user_id),
        ).fetchone()
    return _ngo_expense_response(row)


@app.delete("/api/ngo/expenses/{expense_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_ngo_education_expense(
    expense_id: int,
    user: Annotated[dict, Depends(_require_roles("ngo"))],
):
    with connection() as conn:
        result = conn.execute(
            "DELETE FROM ngo_education_expenses WHERE id = %s AND ngo_user_id = %s",
            (expense_id, int(user["id"])),
        )
        if result.rowcount == 0:
            raise HTTPException(status_code=404, detail="Education expense not found.")


@app.get("/api/students")
def list_students(
    user: Annotated[dict, Depends(_require_roles("admin", "teacher", "ngo"))],
    search: str | None = Query(default=None, max_length=80),
    risk_level: Literal["Low", "Medium", "High"] | None = None,
    limit: int = Query(default=2500, ge=1, le=2500),
    offset: int = Query(default=0, ge=0),
):
    conditions = []
    values = []
    if search:
        conditions.append("student_id LIKE %s")
        values.append(f"%{search.strip()}%")
    if risk_level:
        conditions.append("risk_level = %s")
        values.append(risk_level)
    if user["role"] == "ngo":
        conditions.append(
            "EXISTS (SELECT 1 FROM ngo_student_assignments assigned "
            "WHERE assigned.user_id = %s "
            "AND assigned.student_id = student_records.student_id)"
        )
        values.append(int(user["id"]))
    where_clause = f"WHERE {' AND '.join(conditions)}" if conditions else ""
    with connection() as conn:
        rows = conn.execute(
            f"SELECT * FROM student_records {where_clause} ORDER BY student_id LIMIT %s OFFSET %s",
            (*values, limit, offset),
        ).fetchall()
    return [_student_response(row) for row in rows]


@app.get("/api/students/{student_id}")
def get_student(
    student_id: str,
    user: Annotated[dict, Depends(_require_roles("admin", "teacher", "ngo"))],
):
    with connection() as conn:
        _require_assigned_student(conn, student_id, user)
        return _student_response(_get_student(conn, student_id))


@app.get("/api/students/{student_id}/dropout-prediction")
def predict_student_dropout(
    student_id: str,
    user: Annotated[dict, Depends(_require_roles("admin", "teacher", "ngo"))],
):
    with connection() as conn:
        _require_assigned_student(conn, student_id, user)
        _get_student(conn, student_id)
    try:
        return get_dropout_predictor().predict(student_id)
    except PredictionUnavailableError as error:
        raise HTTPException(status_code=503, detail=str(error)) from error


@app.post("/api/predictions/manual")
def predict_manual_dropout(
    request: ManualPredictionRequest,
    _: Annotated[dict, Depends(_require_roles("admin", "teacher"))],
):
    try:
        return get_dropout_predictor().predict_features(request.model_features())
    except PredictionUnavailableError as error:
        raise HTTPException(status_code=503, detail=str(error)) from error


@app.get("/api/student/me")
def get_my_student_record(user: Annotated[dict, Depends(_require_roles("student"))]):
    if not user["studentId"]:
        return {"student": None, "message": "No student record is linked to this account."}
    with connection() as conn:
        row = conn.execute(
            "SELECT * FROM student_records WHERE student_id = %s", (user["studentId"],)
        ).fetchone()
    if row is None:
        return {"student": None, "message": "No student record is linked to this account."}
    return {"student": _student_response(row), "message": None}


@app.get("/api/student/me/academic-details")
def get_my_teacher_entered_details(
    user: Annotated[dict, Depends(_require_roles("student"))],
):
    with connection() as conn:
        row = conn.execute(
            "SELECT details.student_user_id, account.display_name AS student_name, "
            "account.email AS student_email, details.attendance, details.internal_marks, "
            "details.previous_gpa, details.active_backlogs, details.financial_conditions, "
            "creator.display_name AS teacher_name, details.created_at "
            "FROM teacher_student_details details "
            "JOIN users account ON account.id = details.student_user_id "
            "LEFT JOIN users creator ON creator.id = details.created_by "
            "WHERE details.student_user_id = %s AND account.active = 1",
            (int(user["id"]),),
        ).fetchone()
    return {
        "student": _teacher_student_details_response(row) if row else None,
    }


@app.get("/api/student/support-requests")
def list_my_support_requests(
    user: Annotated[dict, Depends(_require_roles("student"))],
):
    with connection() as conn:
        rows = conn.execute(
            SUPPORT_REQUEST_SELECT
            + " WHERE request.student_user_id = %s "
            "ORDER BY request.submitted_at DESC, request.id DESC",
            (int(user["id"]),),
        ).fetchall()
    return [_support_request_response(row) for row in rows]


@app.post("/api/student/support-requests", status_code=status.HTTP_201_CREATED)
def create_student_support_request(
    request: StudentSupportRequestCreate,
    user: Annotated[dict, Depends(_require_roles("student"))],
):
    with connection() as conn:
        cursor = conn.execute(
            "INSERT INTO student_support_requests "
            "(student_user_id, student_id, category, amount, details) "
            "VALUES (%s, %s, %s, %s, %s)",
            (
                int(user["id"]),
                user["studentId"],
                request.category,
                request.amount,
                request.details,
            ),
        )
        row = _get_support_request(conn, cursor.lastrowid, int(user["id"]))
    return _support_request_response(row)


@app.get("/api/admin/support-requests")
def list_admin_support_requests(
    _: Annotated[dict, Depends(_require_roles("admin"))],
):
    with connection() as conn:
        rows = conn.execute(
            SUPPORT_REQUEST_SELECT
            + " ORDER BY request.submitted_at DESC, request.id DESC"
        ).fetchall()
    return [_support_request_response(row) for row in rows]


@app.patch("/api/admin/support-requests/{request_id}")
def update_admin_support_request(
    request_id: int,
    request: StudentSupportRequestUpdate,
    _: Annotated[dict, Depends(_require_roles("admin"))],
):
    with connection() as conn:
        current = conn.execute(
            "SELECT status FROM student_support_requests WHERE id = %s FOR UPDATE",
            (request_id,),
        ).fetchone()
        if current is None:
            raise HTTPException(status_code=404, detail="Support request not found.")

        current_status = current["status"]
        next_status = request.status
        if next_status == "approved":
            if current_status not in {"submitted", "under_review"}:
                if current_status == "approved":
                    return _support_request_response(
                        _get_support_request(conn, request_id)
                    )
                raise HTTPException(
                    status_code=409,
                    detail="Only requests awaiting administrator review can be approved.",
                )

            ngos = conn.execute(
                "SELECT id FROM users WHERE role = 'ngo' AND active = 1 ORDER BY id"
            ).fetchall()
            if not ngos:
                raise HTTPException(
                    status_code=409,
                    detail="No active NGO accounts are available to receive this request.",
                )
            conn.executemany(
                "INSERT IGNORE INTO ngo_support_request_offers "
                "(request_id, ngo_user_id) VALUES (%s, %s)",
                [(request_id, int(ngo["id"])) for ngo in ngos],
            )
        elif next_status == "declined":
            if current_status not in {"submitted", "under_review", "approved"}:
                raise HTTPException(
                    status_code=409,
                    detail="This request can no longer be declined by an administrator.",
                )
            conn.execute(
                "UPDATE ngo_support_request_offers SET status = 'cancelled', "
                "responded_at = CURRENT_TIMESTAMP(3) "
                "WHERE request_id = %s AND status = 'offered'",
                (request_id,),
            )
        elif next_status == "under_review":
            if current_status not in {"submitted", "under_review"}:
                raise HTTPException(
                    status_code=409,
                    detail="Only newly submitted requests can be moved into review.",
                )
        elif next_status == "submitted":
            if current_status not in {"submitted", "under_review"}:
                raise HTTPException(
                    status_code=409,
                    detail="This request cannot be returned to submitted status.",
                )

        conn.execute(
            "UPDATE student_support_requests SET status = %s, "
            "updated_at = CURRENT_TIMESTAMP(3) WHERE id = %s",
            (next_status, request_id),
        )
        row = _get_support_request(conn, request_id)
    return _support_request_response(row)


@app.get("/api/ngo/support-requests")
def list_ngo_support_request_offers(
    user: Annotated[dict, Depends(_require_roles("ngo"))],
):
    with connection() as conn:
        rows = conn.execute(
            SUPPORT_REQUEST_OFFER_SELECT
            + " JOIN ngo_support_request_offers offer "
            "ON offer.request_id = request.id "
            "WHERE offer.ngo_user_id = %s "
            "ORDER BY offer.created_at DESC, request.id DESC",
            (int(user["id"]),),
        ).fetchall()
    result = []
    for row in rows:
        item = _support_request_response(row)
        item["offerStatus"] = row["offer_status"]
        result.append(item)
    return result


@app.post("/api/ngo/support-requests/{request_id}/accept")
def accept_ngo_support_request(
    request_id: int,
    user: Annotated[dict, Depends(_require_roles("ngo"))],
):
    ngo_user_id = int(user["id"])
    with connection() as conn:
        request_row = conn.execute(
            "SELECT status FROM student_support_requests WHERE id = %s FOR UPDATE",
            (request_id,),
        ).fetchone()
        if request_row is None:
            raise HTTPException(status_code=404, detail="Support request not found.")
        offer = conn.execute(
            "SELECT status FROM ngo_support_request_offers "
            "WHERE request_id = %s AND ngo_user_id = %s",
            (request_id, ngo_user_id),
        ).fetchone()
        if offer is None:
            raise HTTPException(
                status_code=404,
                detail="This support request was not offered to your organization.",
            )
        if request_row["status"] == "accepted" and offer["status"] == "accepted":
            accepted_request = _get_support_request(conn, request_id)
            accepted_request["offer_status"] = offer["status"]
            return _support_request_response(accepted_request)
        if request_row["status"] != "approved" or offer["status"] != "offered":
            raise HTTPException(
                status_code=409,
                detail="Another NGO has accepted this request, or the offer is no longer available.",
            )

        conn.execute(
            "UPDATE ngo_support_request_offers SET status = 'accepted', "
            "responded_at = CURRENT_TIMESTAMP(3) "
            "WHERE request_id = %s AND ngo_user_id = %s AND status = 'offered'",
            (request_id, ngo_user_id),
        )
        conn.execute(
            "UPDATE ngo_support_request_offers SET status = 'cancelled', "
            "responded_at = CURRENT_TIMESTAMP(3) "
            "WHERE request_id = %s AND ngo_user_id != %s AND status = 'offered'",
            (request_id, ngo_user_id),
        )
        conn.execute(
            "UPDATE student_support_requests SET status = 'accepted', "
            "updated_at = CURRENT_TIMESTAMP(3) WHERE id = %s",
            (request_id,),
        )
        accepted_request = _get_support_request(conn, request_id)
        accepted_request["offer_status"] = "accepted"
    return _support_request_response(accepted_request)


@app.get("/api/risk-analysis")
def risk_analysis(_: Annotated[dict, Depends(_require_roles("admin", "teacher"))]):
    with connection() as conn:
        rows = conn.execute(
            "SELECT * FROM student_records ORDER BY student_id"
        ).fetchall()
    records = []
    for row in rows:
        student = _student_response(row)
        records.append(
            {
                "studentId": student["id"],
                "riskLevel": student["riskLevel"],
                "dropout": student["dropout"],
                "factors": student["signals"],
            }
        )
    return records


@app.get("/api/analytics/summary")
def analytics_summary(_: Annotated[dict, Depends(_require_roles("admin", "teacher"))]):
    attendance_bands = [
        {"name": "Below 50%", "min": 0, "max": 50, "students": 0},
        {"name": "50-69%", "min": 50, "max": 70, "students": 0},
        {"name": "70-84%", "min": 70, "max": 85, "students": 0},
        {"name": "85% and above", "min": 85, "max": 101, "students": 0},
    ]
    with connection() as conn:
        records = conn.execute(
            "SELECT attendance, dropout, risk_level FROM student_records"
        ).fetchall()
    risk_counts = {level: 0 for level in ("Low", "Medium", "High")}
    total_attendance = 0.0
    dropout_count = 0
    for record in records:
        risk_counts[record["risk_level"]] += 1
        total_attendance += record["attendance"]
        dropout_count += record["dropout"]
        for band in attendance_bands:
            if band["min"] <= record["attendance"] < band["max"]:
                band["students"] += 1
                break

    student_count = len(records)
    average_attendance = total_attendance / student_count if student_count else 0
    high_risk_count = risk_counts["High"]
    return {
        "source": DATASET_PATH.name,
        "studentCount": student_count,
        "dropoutCount": dropout_count,
        "averageAttendance": average_attendance,
        "dropoutRate": dropout_count / student_count * 100 if student_count else 0,
        "dashboardMetrics": [
            {"label": "Students in dataset", "value": f"{student_count:,}"},
            {"label": "High-risk category", "value": f"{high_risk_count:,}"},
            {"label": "Dataset dropout labels", "value": f"{dropout_count:,}"},
            {"label": "Average attendance", "value": f"{average_attendance:.1f}%"},
        ],
        "attendanceDistribution": [
            {"name": band["name"], "students": band["students"]}
            for band in attendance_bands
        ],
        "riskDistribution": [
            {"name": f"{level} risk", "value": risk_counts[level], "color": RISK_COLORS[level]}
            for level in ("Low", "Medium", "High")
        ],
    }


@app.get("/api/interventions")
def list_interventions(_: Annotated[dict, Depends(_require_roles("admin", "teacher"))]):
    with connection() as conn:
        rows = conn.execute(
            "SELECT * FROM interventions ORDER BY created_at DESC, id DESC"
        ).fetchall()
    return [_intervention_response(row) for row in rows]


@app.post("/api/interventions", status_code=status.HTTP_201_CREATED)
def create_intervention(
    request: InterventionCreate,
    user: Annotated[dict, Depends(_require_roles("admin", "teacher"))],
):
    with connection() as conn:
        _get_student(conn, request.studentId)
        cursor = conn.execute(
            "INSERT INTO interventions "
            "(student_id, title, notes, status, due_date, created_by) "
            "VALUES (%s, %s, %s, %s, %s, %s)",
            (
                request.studentId,
                request.title,
                request.notes,
                request.status,
                request.dueDate.isoformat() if request.dueDate else None,
                int(user["id"]),
            ),
        )
        row = _get_intervention(conn, cursor.lastrowid)
    return _intervention_response(row)


@app.patch("/api/interventions/{intervention_id}")
def update_intervention(
    intervention_id: int,
    request: InterventionUpdate,
    _: Annotated[dict, Depends(_require_roles("admin", "teacher"))],
):
    changes = request.model_dump(exclude_unset=True)
    if not changes:
        raise HTTPException(status_code=422, detail="Provide at least one intervention field to update.")
    column_names = {"title": "title", "notes": "notes", "status": "status", "dueDate": "due_date"}
    assignments = []
    values = []
    for field, value in changes.items():
        assignments.append(f"{column_names[field]} = %s")
        values.append(value.isoformat() if isinstance(value, date) else value)
    assignments.append("updated_at = CURRENT_TIMESTAMP(3)")
    values.append(intervention_id)

    with connection() as conn:
        _get_intervention(conn, intervention_id)
        conn.execute(
            f"UPDATE interventions SET {', '.join(assignments)} WHERE id = %s",
            values,
        )
        row = _get_intervention(conn, intervention_id)
    return _intervention_response(row)


@app.delete("/api/interventions/{intervention_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_intervention(
    intervention_id: int,
    _: Annotated[dict, Depends(_require_roles("admin", "teacher"))],
):
    with connection() as conn:
        _get_intervention(conn, intervention_id)
        conn.execute("DELETE FROM interventions WHERE id = %s", (intervention_id,))


# ---------------------------------------------------------------------------
# DBMS / Database Info endpoint
# ---------------------------------------------------------------------------

@app.get("/api/admin/database")
def get_database_info(_: Annotated[dict, Depends(_require_roles("admin"))]):
    """Return live MySQL schema metadata, row counts, indexes, and statistics."""
    with connection() as conn:
        tables_raw = conn.execute(
            "SELECT TABLE_NAME AS name FROM information_schema.TABLES "
            "WHERE TABLE_SCHEMA = %s AND TABLE_TYPE = 'BASE TABLE' ORDER BY TABLE_NAME",
            (MYSQL_DATABASE,),
        ).fetchall()

        tables = []
        for t in tables_raw:
            name = t["name"]

            cols = conn.execute(
                "SELECT ORDINAL_POSITION, COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, "
                "COLUMN_DEFAULT, COLUMN_KEY FROM information_schema.COLUMNS "
                "WHERE TABLE_SCHEMA = %s AND TABLE_NAME = %s ORDER BY ORDINAL_POSITION",
                (MYSQL_DATABASE, name),
            ).fetchall()
            columns = [
                {
                    "cid": c["ORDINAL_POSITION"] - 1,
                    "name": c["COLUMN_NAME"],
                    "type": c["COLUMN_TYPE"] or "ANY",
                    "notNull": c["IS_NULLABLE"] == "NO",
                    "defaultValue": c["COLUMN_DEFAULT"],
                    "primaryKey": c["COLUMN_KEY"] == "PRI",
                }
                for c in cols
            ]

            index_rows = conn.execute(
                "SELECT INDEX_NAME, NON_UNIQUE, COLUMN_NAME "
                "FROM information_schema.STATISTICS "
                "WHERE TABLE_SCHEMA = %s AND TABLE_NAME = %s "
                "ORDER BY INDEX_NAME, SEQ_IN_INDEX",
                (MYSQL_DATABASE, name),
            ).fetchall()
            indexes_by_name = {}
            for index_row in index_rows:
                index = indexes_by_name.setdefault(
                    index_row["INDEX_NAME"],
                    {"name": index_row["INDEX_NAME"], "unique": not bool(index_row["NON_UNIQUE"]), "columns": []},
                )
                if index_row["COLUMN_NAME"]:
                    index["columns"].append(index_row["COLUMN_NAME"])
            indexes = list(indexes_by_name.values())

            fks_raw = conn.execute(
                "SELECT kcu.COLUMN_NAME AS `from`, kcu.REFERENCED_TABLE_NAME AS ref_table, "
                "kcu.REFERENCED_COLUMN_NAME AS ref_column, rc.DELETE_RULE AS on_delete "
                "FROM information_schema.KEY_COLUMN_USAGE kcu "
                "JOIN information_schema.REFERENTIAL_CONSTRAINTS rc "
                "ON rc.CONSTRAINT_SCHEMA = kcu.CONSTRAINT_SCHEMA "
                "AND rc.TABLE_NAME = kcu.TABLE_NAME "
                "AND rc.CONSTRAINT_NAME = kcu.CONSTRAINT_NAME "
                "WHERE kcu.CONSTRAINT_SCHEMA = %s AND kcu.TABLE_NAME = %s "
                "AND kcu.REFERENCED_TABLE_NAME IS NOT NULL",
                (MYSQL_DATABASE, name),
            ).fetchall()
            foreign_keys = [
                {
                    "from": fk["from"],
                    "refTable": fk["ref_table"],
                    "refColumn": fk["ref_column"],
                    "onDelete": fk["on_delete"],
                }
                for fk in fks_raw
            ]

            row_count = conn.execute(
                f"SELECT COUNT(*) AS n FROM `{name}`"
            ).fetchone()["n"]
            ddl_row = conn.execute(f"SHOW CREATE TABLE `{name}`").fetchone()
            ddl = ddl_row["Create Table"] if ddl_row else ""

            tables.append({
                "name": name,
                "rowCount": row_count,
                "columns": columns,
                "indexes": indexes,
                "foreignKeys": foreign_keys,
                "ddl": ddl,
            })

        size_row = conn.execute(
            "SELECT COALESCE(SUM(DATA_LENGTH + INDEX_LENGTH), 0) AS size_bytes "
            "FROM information_schema.TABLES WHERE TABLE_SCHEMA = %s",
            (MYSQL_DATABASE,),
        ).fetchone()
        db_size_bytes = size_row["size_bytes"]

        risk_rows = conn.execute(
            "SELECT risk_level, COUNT(*) AS cnt FROM student_records GROUP BY risk_level"
        ).fetchall()
        risk_counts = {row["risk_level"]: row["cnt"] for row in risk_rows}

        dropout_count = conn.execute(
            "SELECT COUNT(*) AS n FROM student_records WHERE dropout = 1"
        ).fetchone()["n"]

        avg_row = conn.execute("SELECT AVG(attendance) AS a FROM student_records").fetchone()
        avg_attendance = avg_row["a"] if avg_row else None

        status_rows = conn.execute(
            "SELECT status, COUNT(*) AS cnt FROM interventions GROUP BY status"
        ).fetchall()
        intervention_by_status = {row["status"]: row["cnt"] for row in status_rows}

        total_students = sum(risk_counts.values())

    return {
        "engine": "MySQL",
        "file": f"{MYSQL_DATABASE}@{MYSQL_HOST}:{MYSQL_PORT}",
        "schemaFile": "backend/schema.mysql.sql",
        "sizeBytes": db_size_bytes,
        "sizeMb": round(db_size_bytes / (1024 * 1024), 2),
        "tableCount": len(tables),
        "tables": tables,
        "statistics": {
            "totalStudents": total_students,
            "dropoutStudents": dropout_count,
            "dropoutRate": round(dropout_count / total_students * 100, 1) if total_students else 0,
            "avgAttendance": round(avg_attendance, 1) if avg_attendance else 0,
            "riskDistribution": risk_counts,
            "interventionsByStatus": intervention_by_status,
            "totalUsers": next(
                (t["rowCount"] for t in tables if t["name"] == "users"), 0
            ),
            "totalInterventions": next(
                (t["rowCount"] for t in tables if t["name"] == "interventions"), 0
            ),
        },
    }
