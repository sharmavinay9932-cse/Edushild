import csv
import hashlib
import io
from contextlib import contextmanager
from pathlib import Path

import mysql.connector
from mysql.connector.cursor import MySQLCursorDict

from .config import (
    DATASET_PATH,
    MYSQL_CREATE_DATABASE,
    MYSQL_DATABASE,
    MYSQL_HOST,
    MYSQL_PASSWORD,
    MYSQL_PORT,
    MYSQL_USER,
)

EXPECTED_COLUMNS = {
    "Dataset ID",
    "Attendance",
    "Internal marks",
    "Previous GPA",
    "Backlogs",
    "Financial conditions",
    "Risk category",
    "Dropout label",
}
RISK_LEVELS = {"Low", "Medium", "High"}
FINANCIAL_CONDITIONS = {"Stable", "Moderate", "Severe"}

TABLE_DDL = (
    """
    CREATE TABLE IF NOT EXISTS users (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        email VARCHAR(254) NOT NULL,
        display_name VARCHAR(255) NOT NULL,
        role VARCHAR(16) NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        student_id VARCHAR(64) NULL,
        active TINYINT NOT NULL DEFAULT 1,
        token_version INT NOT NULL DEFAULT 0,
        created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        PRIMARY KEY (id),
        UNIQUE KEY uq_users_email (email),
        CONSTRAINT chk_users_role CHECK (role IN ('admin', 'teacher', 'student', 'ngo')),
        CONSTRAINT chk_users_active CHECK (active IN (0, 1))
    ) ENGINE=InnoDB
    """,
    """
    CREATE TABLE IF NOT EXISTS student_records (
        student_id VARCHAR(64) NOT NULL,
        attendance DOUBLE NOT NULL,
        internal_marks DOUBLE NOT NULL,
        previous_gpa DOUBLE NOT NULL,
        active_backlogs INT NOT NULL,
        financial_conditions VARCHAR(16) NOT NULL DEFAULT 'Moderate',
        dropout TINYINT NOT NULL,
        risk_level VARCHAR(16) NOT NULL,
        PRIMARY KEY (student_id),
        KEY idx_student_records_risk (risk_level),
        CONSTRAINT chk_student_records_attendance CHECK (attendance BETWEEN 0 AND 100),
        CONSTRAINT chk_student_records_internal_marks CHECK (internal_marks BETWEEN 0 AND 100),
        CONSTRAINT chk_student_records_previous_gpa CHECK (previous_gpa BETWEEN 0 AND 10),
        CONSTRAINT chk_student_records_backlogs CHECK (active_backlogs >= 0),
        CONSTRAINT chk_student_records_financial_conditions
            CHECK (financial_conditions IN ('Stable', 'Moderate', 'Severe')),
        CONSTRAINT chk_student_records_dropout CHECK (dropout IN (0, 1)),
        CONSTRAINT chk_student_records_risk CHECK (risk_level IN ('Low', 'Medium', 'High'))
    ) ENGINE=InnoDB
    """,
    """
    CREATE TABLE IF NOT EXISTS interventions (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        student_id VARCHAR(64) NOT NULL,
        title VARCHAR(255) NOT NULL,
        notes TEXT NOT NULL,
        status VARCHAR(16) NOT NULL,
        due_date DATE NULL,
        created_by BIGINT UNSIGNED NULL,
        created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
            ON UPDATE CURRENT_TIMESTAMP(3),
        PRIMARY KEY (id),
        KEY idx_interventions_student_id (student_id),
        KEY idx_interventions_status (status),
        KEY idx_interventions_created_at (created_at DESC),
        CONSTRAINT chk_interventions_status
            CHECK (status IN ('planned', 'in_progress', 'completed')),
        CONSTRAINT fk_interventions_created_by
            FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE SET NULL
    ) ENGINE=InnoDB
    """,
    """
    CREATE TABLE IF NOT EXISTS dataset_metadata (
        `key` VARCHAR(191) NOT NULL,
        `value` TEXT NOT NULL,
        PRIMARY KEY (`key`)
    ) ENGINE=InnoDB
    """,
    """
    CREATE TABLE IF NOT EXISTS login_attempts (
        attempt_key CHAR(64) NOT NULL,
        attempts INT NOT NULL,
        window_started BIGINT NOT NULL,
        locked_until BIGINT NOT NULL DEFAULT 0,
        PRIMARY KEY (attempt_key)
    ) ENGINE=InnoDB
    """,
    """
    CREATE TABLE IF NOT EXISTS password_reset_tokens (
        token_hash CHAR(64) NOT NULL,
        user_id BIGINT UNSIGNED NOT NULL,
        expires_at DATETIME(3) NOT NULL,
        created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        PRIMARY KEY (token_hash),
        KEY idx_password_reset_user_created (user_id, created_at),
        CONSTRAINT fk_password_reset_user
            FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
    ) ENGINE=InnoDB
    """,
    """
    CREATE TABLE IF NOT EXISTS ngo_student_assignments (
        user_id BIGINT UNSIGNED NOT NULL,
        student_id VARCHAR(64) NOT NULL,
        assigned_by BIGINT UNSIGNED NULL,
        assigned_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        PRIMARY KEY (user_id, student_id),
        KEY idx_ngo_student_assignments_student (student_id),
        CONSTRAINT fk_ngo_student_assignments_user
            FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
        CONSTRAINT fk_ngo_student_assignments_assigned_by
            FOREIGN KEY (assigned_by) REFERENCES users (id) ON DELETE SET NULL
    ) ENGINE=InnoDB
    """,
    """
    CREATE TABLE IF NOT EXISTS ngo_education_expenses (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        ngo_user_id BIGINT UNSIGNED NOT NULL,
        student_id VARCHAR(64) NULL,
        category VARCHAR(32) NOT NULL,
        description VARCHAR(255) NOT NULL,
        amount DECIMAL(10, 2) NOT NULL,
        expense_date DATE NOT NULL,
        created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        PRIMARY KEY (id),
        KEY idx_ngo_expenses_owner_date (ngo_user_id, expense_date, id),
        CONSTRAINT chk_ngo_expenses_category CHECK (
            category IN (
                'tuition', 'books', 'transport', 'school_supplies',
                'exam_fees', 'accommodation', 'meals', 'other'
            )
        ),
        CONSTRAINT chk_ngo_expenses_amount CHECK (amount > 0),
        CONSTRAINT fk_ngo_expenses_user
            FOREIGN KEY (ngo_user_id) REFERENCES users (id) ON DELETE CASCADE
    ) ENGINE=InnoDB
    """,
    """
    CREATE TABLE IF NOT EXISTS student_support_requests (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        student_user_id BIGINT UNSIGNED NOT NULL,
        student_id VARCHAR(64) NULL,
        category VARCHAR(32) NOT NULL,
        amount DECIMAL(10, 2) NOT NULL,
        details TEXT NOT NULL,
        status VARCHAR(16) NOT NULL DEFAULT 'submitted',
        submitted_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
            ON UPDATE CURRENT_TIMESTAMP(3),
        PRIMARY KEY (id),
        KEY idx_support_requests_user_submitted (student_user_id, submitted_at),
        KEY idx_support_requests_status_submitted (status, submitted_at),
        CONSTRAINT chk_support_requests_category CHECK (
            category IN (
                'tuition', 'books', 'transport', 'school_supplies',
                'exam_fees', 'accommodation', 'meals', 'other'
            )
        ),
        CONSTRAINT chk_support_requests_amount CHECK (amount > 0),
        CONSTRAINT chk_support_requests_status CHECK (
            status IN (
                'submitted', 'under_review', 'referred', 'approved',
                'accepted', 'declined', 'completed'
            )
        ),
        CONSTRAINT fk_support_requests_user
            FOREIGN KEY (student_user_id) REFERENCES users (id) ON DELETE CASCADE
    ) ENGINE=InnoDB
    """,
    """
    CREATE TABLE IF NOT EXISTS ngo_support_request_offers (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        request_id BIGINT UNSIGNED NOT NULL,
        ngo_user_id BIGINT UNSIGNED NOT NULL,
        status VARCHAR(16) NOT NULL DEFAULT 'offered',
        created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        responded_at DATETIME(3) NULL,
        PRIMARY KEY (id),
        UNIQUE KEY uq_support_offer_request_ngo (request_id, ngo_user_id),
        KEY idx_support_offer_ngo_status (ngo_user_id, status, request_id),
        CONSTRAINT chk_support_offer_status
            CHECK (status IN ('offered', 'accepted', 'cancelled')),
        CONSTRAINT fk_support_offer_request
            FOREIGN KEY (request_id) REFERENCES student_support_requests (id) ON DELETE CASCADE,
        CONSTRAINT fk_support_offer_ngo
            FOREIGN KEY (ngo_user_id) REFERENCES users (id) ON DELETE CASCADE
    ) ENGINE=InnoDB
    """,
    """
    CREATE TABLE IF NOT EXISTS teacher_student_details (
        student_user_id BIGINT UNSIGNED NOT NULL,
        attendance DOUBLE NOT NULL,
        internal_marks DOUBLE NOT NULL,
        previous_gpa DOUBLE NOT NULL,
        active_backlogs INT NOT NULL,
        financial_conditions VARCHAR(16) NOT NULL,
        created_by BIGINT UNSIGNED NULL,
        created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
            ON UPDATE CURRENT_TIMESTAMP(3),
        PRIMARY KEY (student_user_id),
        KEY idx_teacher_student_details_created_by (created_by),
        CONSTRAINT chk_teacher_student_details_attendance
            CHECK (attendance BETWEEN 0 AND 100),
        CONSTRAINT chk_teacher_student_details_internal_marks
            CHECK (internal_marks BETWEEN 0 AND 100),
        CONSTRAINT chk_teacher_student_details_previous_gpa
            CHECK (previous_gpa BETWEEN 0 AND 10),
        CONSTRAINT chk_teacher_student_details_backlogs
            CHECK (active_backlogs >= 0),
        CONSTRAINT chk_teacher_student_details_financial_conditions
            CHECK (financial_conditions IN ('Stable', 'Moderate', 'Severe')),
        CONSTRAINT fk_teacher_student_details_student
            FOREIGN KEY (student_user_id) REFERENCES users (id) ON DELETE CASCADE,
        CONSTRAINT fk_teacher_student_details_teacher
            FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE SET NULL
    ) ENGINE=InnoDB
    """,
)


class DatabaseConnection:
    def __init__(self, raw_connection):
        self._connection = raw_connection
        self._cursors: list[MySQLCursorDict] = []

    def execute(self, query: str, params=()) -> MySQLCursorDict:
        cursor = self._connection.cursor(dictionary=True)
        self._cursors.append(cursor)
        cursor.execute(query, params)
        return cursor

    def executemany(self, query: str, params) -> MySQLCursorDict:
        cursor = self._connection.cursor(dictionary=True)
        self._cursors.append(cursor)
        cursor.executemany(query, params)
        return cursor

    def commit(self) -> None:
        self._connection.commit()

    def rollback(self) -> None:
        self._connection.rollback()

    def close(self) -> None:
        for cursor in self._cursors:
            cursor.close()
        self._connection.close()


def _connect(*, database: str | None = MYSQL_DATABASE):
    settings = {
        "host": MYSQL_HOST,
        "port": MYSQL_PORT,
        "user": MYSQL_USER,
        "password": MYSQL_PASSWORD,
        "charset": "utf8mb4",
        "connection_timeout": 10,
    }
    if database:
        settings["database"] = database
    return mysql.connector.connect(**settings)


@contextmanager
def connection():
    raw_connection = _connect()
    conn = DatabaseConnection(raw_connection)
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def initialize_database() -> None:
    if MYSQL_CREATE_DATABASE:
        raw_connection = _connect(database=None)
        try:
            cursor = raw_connection.cursor()
            cursor.execute(
                f"CREATE DATABASE IF NOT EXISTS `{MYSQL_DATABASE}` "
                "CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci"
            )
            raw_connection.commit()
            cursor.close()
        finally:
            raw_connection.close()

    with connection() as conn:
        for statement in TABLE_DDL:
            conn.execute(statement)

        columns = conn.execute(
            "SELECT COLUMN_NAME FROM information_schema.COLUMNS "
            "WHERE TABLE_SCHEMA = %s AND TABLE_NAME = 'users'",
            (MYSQL_DATABASE,),
        ).fetchall()
        user_columns = {row["COLUMN_NAME"] for row in columns}
        if "token_version" not in user_columns:
            conn.execute(
                "ALTER TABLE users ADD COLUMN token_version INT NOT NULL DEFAULT 0"
            )

        role_constraint = conn.execute(
            "SELECT CHECK_CLAUSE FROM information_schema.CHECK_CONSTRAINTS "
            "WHERE CONSTRAINT_SCHEMA = %s AND CONSTRAINT_NAME = 'chk_users_role'",
            (MYSQL_DATABASE,),
        ).fetchone()
        if role_constraint is None:
            conn.execute(
                "ALTER TABLE users ADD CONSTRAINT chk_users_role "
                "CHECK (role IN ('admin', 'teacher', 'student', 'ngo'))"
            )
        elif "'ngo'" not in role_constraint["CHECK_CLAUSE"].lower():
            conn.execute("ALTER TABLE users DROP CHECK chk_users_role")
            conn.execute(
                "ALTER TABLE users ADD CONSTRAINT chk_users_role "
                "CHECK (role IN ('admin', 'teacher', 'student', 'ngo'))"
            )

        support_status_constraint = conn.execute(
            "SELECT CHECK_CLAUSE FROM information_schema.CHECK_CONSTRAINTS "
            "WHERE CONSTRAINT_SCHEMA = %s AND CONSTRAINT_NAME = 'chk_support_requests_status'",
            (MYSQL_DATABASE,),
        ).fetchone()
        if support_status_constraint is not None and "'accepted'" not in support_status_constraint["CHECK_CLAUSE"].lower():
            conn.execute("ALTER TABLE student_support_requests DROP CHECK chk_support_requests_status")
            conn.execute(
                "ALTER TABLE student_support_requests ADD CONSTRAINT chk_support_requests_status "
                "CHECK (status IN ('submitted', 'under_review', 'referred', 'approved', "
                "'accepted', 'declined', 'completed'))"
            )

        student_columns = conn.execute(
            "SELECT COLUMN_NAME FROM information_schema.COLUMNS "
            "WHERE TABLE_SCHEMA = %s AND TABLE_NAME = 'student_records'",
            (MYSQL_DATABASE,),
        ).fetchall()
        student_column_names = {row["COLUMN_NAME"] for row in student_columns}
        if "financial_conditions" not in student_column_names:
            conn.execute(
                "ALTER TABLE student_records ADD COLUMN financial_conditions "
                "VARCHAR(16) NOT NULL DEFAULT 'Moderate' AFTER active_backlogs"
            )

        legacy_checks = conn.execute(
            "SELECT CONSTRAINT_NAME FROM information_schema.CHECK_CONSTRAINTS "
            "WHERE CONSTRAINT_SCHEMA = %s AND CONSTRAINT_NAME IN "
            "('chk_student_records_assignment', 'chk_student_records_lms_logins')",
            (MYSQL_DATABASE,),
        ).fetchall()
        for check in legacy_checks:
            conn.execute(
                f"ALTER TABLE student_records DROP CHECK `{check['CONSTRAINT_NAME']}`"
            )

        if "assignment_submission" in student_column_names:
            conn.execute("ALTER TABLE student_records DROP COLUMN assignment_submission")
        if "lms_logins" in student_column_names:
            conn.execute("ALTER TABLE student_records DROP COLUMN lms_logins")

        financial_check = conn.execute(
            "SELECT CONSTRAINT_NAME FROM information_schema.CHECK_CONSTRAINTS "
            "WHERE CONSTRAINT_SCHEMA = %s "
            "AND CONSTRAINT_NAME = 'chk_student_records_financial_conditions'",
            (MYSQL_DATABASE,),
        ).fetchone()
        if financial_check is None:
            conn.execute(
                "ALTER TABLE student_records ADD CONSTRAINT "
                "chk_student_records_financial_conditions CHECK "
                "(financial_conditions IN ('Stable', 'Moderate', 'Severe'))"
            )

    import_dataset()


def _parse_dataset(path: Path) -> tuple[str, list[tuple]]:
    raw = path.read_bytes()
    digest = hashlib.sha256(raw).hexdigest()
    try:
        text = raw.decode("utf-8-sig")
    except UnicodeDecodeError as error:
        raise RuntimeError("The configured dataset must be a UTF-8 CSV file.") from error

    reader = csv.DictReader(io.StringIO(text, newline=""))
    if not reader.fieldnames or not EXPECTED_COLUMNS.issubset(reader.fieldnames):
        raise RuntimeError("The configured dataset is missing required student columns.")

    records = []
    seen_ids = set()
    for line_number, row in enumerate(reader, start=2):
        try:
            student_id = row["Dataset ID"].strip()
            attendance = float(row["Attendance"])
            internal_marks = float(row["Internal marks"])
            previous_gpa = float(row["Previous GPA"])
            active_backlogs = int(row["Backlogs"])
            financial_conditions = row["Financial conditions"].strip()
            dropout = int(row["Dropout label"])
            risk_level = row["Risk category"].strip()
            if (
                not student_id
                or student_id in seen_ids
                or not 0 <= attendance <= 100
                or not 0 <= internal_marks <= 100
                or not 0 <= previous_gpa <= 10
                or active_backlogs < 0
                or financial_conditions not in FINANCIAL_CONDITIONS
                or dropout not in (0, 1)
                or risk_level not in RISK_LEVELS
            ):
                raise ValueError
        except (AttributeError, KeyError, TypeError, ValueError) as error:
            raise RuntimeError(f"Invalid dataset record on line {line_number}.") from error

        seen_ids.add(student_id)
        records.append(
            (
                student_id,
                attendance,
                internal_marks,
                previous_gpa,
                active_backlogs,
                financial_conditions,
                dropout,
                risk_level,
            )
        )
    if not records:
        raise RuntimeError("The configured student dataset contains no records.")
    return digest, records


def import_dataset() -> None:
    digest, records = _parse_dataset(Path(DATASET_PATH))
    with connection() as conn:
        existing = conn.execute(
            "SELECT `value` FROM dataset_metadata WHERE `key` = %s",
            ("sha256",),
        ).fetchone()
        if existing and existing["value"] == digest:
            return

        conn.execute("DELETE FROM student_records")
        conn.executemany(
            """
            INSERT INTO student_records (
                student_id, attendance, internal_marks, previous_gpa, active_backlogs,
                financial_conditions, dropout, risk_level
            ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
            """,
            records,
        )
        conn.execute(
            """
            INSERT INTO dataset_metadata (`key`, `value`) VALUES (%s, %s)
            ON DUPLICATE KEY UPDATE `value` = VALUES(`value`)
            """,
            ("sha256", digest),
        )
