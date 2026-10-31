-- EduShield AI MySQL schema
-- Requires MySQL 8.0.16+ for enforced CHECK constraints.
-- The backend runtime also creates these tables on startup when they are absent.

CREATE DATABASE IF NOT EXISTS edushield
    CHARACTER SET utf8mb4
    COLLATE utf8mb4_0900_ai_ci;

USE edushield;

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
) ENGINE=InnoDB;

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
) ENGINE=InnoDB;

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
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS dataset_metadata (
    `key` VARCHAR(191) NOT NULL,
    `value` TEXT NOT NULL,
    PRIMARY KEY (`key`)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS login_attempts (
    attempt_key CHAR(64) NOT NULL,
    attempts INT NOT NULL,
    window_started BIGINT NOT NULL,
    locked_until BIGINT NOT NULL DEFAULT 0,
    PRIMARY KEY (attempt_key)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS password_reset_tokens (
    token_hash CHAR(64) NOT NULL,
    user_id BIGINT UNSIGNED NOT NULL,
    expires_at DATETIME(3) NOT NULL,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (token_hash),
    KEY idx_password_reset_user_created (user_id, created_at),
    CONSTRAINT fk_password_reset_user
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB;

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
) ENGINE=InnoDB;

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
) ENGINE=InnoDB;

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
) ENGINE=InnoDB;

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
) ENGINE=InnoDB;

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
) ENGINE=InnoDB;

-- Student IDs are intentionally not foreign-key constrained: records are
-- refreshed from the synthetic dataset and may change independently.
