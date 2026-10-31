import os
import re
import unittest
from datetime import date
from pathlib import Path
from uuid import uuid4
from unittest.mock import patch

import mysql.connector

ROOT = Path(__file__).resolve().parents[2]
TEST_DATABASE = f"edushield_test_{uuid4().hex}"
os.environ["EDUSHIELD_JWT_SECRET"] = "test-key-not-for-production-32-characters-minimum"
os.environ["EDUSHIELD_MYSQL_DATABASE"] = TEST_DATABASE
os.environ["EDUSHIELD_MYSQL_CREATE_DATABASE"] = "true"
os.environ["EDUSHIELD_SMTP_HOST"] = "smtp.test"
os.environ["EDUSHIELD_SMTP_FROM"] = "noreply@example.test"
os.environ["EDUSHIELD_SMTP_USERNAME"] = "test-user"
os.environ["EDUSHIELD_SMTP_PASSWORD"] = "test-password"
os.environ["EDUSHIELD_DATASET_PATH"] = str(
    ROOT / "datasets" / "edushield_ai_student_dataset_2500.csv"
)
os.environ["EDUSHIELD_MODEL_PATH"] = str(ROOT / "models" / "dropout_model.joblib")

from fastapi.testclient import TestClient

from app.config import MYSQL_HOST, MYSQL_PASSWORD, MYSQL_PORT, MYSQL_USER
from app.database import connection, initialize_database
from app.email_service import send_password_reset_email
from app.main import app
from app.security import hash_password


def drop_test_database():
    if not re.fullmatch(r"edushield_test_[a-f0-9]{32}", TEST_DATABASE):
        raise RuntimeError("Refusing to remove a database outside the generated test schema.")
    raw_connection = mysql.connector.connect(
        host=MYSQL_HOST,
        port=MYSQL_PORT,
        user=MYSQL_USER,
        password=MYSQL_PASSWORD,
        connection_timeout=10,
    )
    try:
        cursor = raw_connection.cursor()
        cursor.execute(f"DROP DATABASE IF EXISTS `{TEST_DATABASE}`")
        cursor.close()
    finally:
        raw_connection.close()


class EduShieldApiTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        probe = mysql.connector.connect(
            host=MYSQL_HOST,
            port=MYSQL_PORT,
            user=MYSQL_USER,
            password=MYSQL_PASSWORD,
            connection_timeout=10,
        )
        probe.close()
        cls.client_context = TestClient(app)
        try:
            cls.client = cls.client_context.__enter__()
        except Exception:
            drop_test_database()
            raise
        with connection() as conn:
            conn.execute(
                "INSERT INTO users (email, display_name, role, password_hash) "
                "VALUES (%s, %s, 'admin', %s)",
                ("admin@college.edu", "Test Admin", hash_password("test-password-123")),
            )
            conn.execute(
                "INSERT INTO users (email, display_name, role, password_hash, student_id) "
                "VALUES (%s, %s, 'student', %s, %s)",
                ("student@college.edu", "Test Student", hash_password("test-password-123"), "STU0001"),
            )

    @classmethod
    def tearDownClass(cls):
        try:
            cls.client_context.__exit__(None, None, None)
        finally:
            drop_test_database()

    def login(self, email, role, password="test-password-123"):
        response = self.client.post(
            "/api/auth/login",
            json={"email": email, "password": password, "role": role},
        )
        self.assertEqual(response.status_code, 200, response.text)
        return response.json()["accessToken"]

    def test_dataset_health_and_analytics(self):
        health = self.client.get("/api/health")
        self.assertEqual(health.status_code, 200)
        self.assertEqual(health.json()["datasetRecords"], 2500)

        token = self.login("admin@college.edu", "admin")
        response = self.client.get(
            "/api/analytics/summary", headers={"Authorization": f"Bearer {token}"}
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["studentCount"], 2500)
        self.assertEqual(
            response.json()["source"], "edushield_ai_student_dataset_2500.csv"
        )
        self.assertEqual(
            [item["value"] for item in response.json()["riskDistribution"]],
            [493, 1085, 922],
        )
        student = self.client.get(
            "/api/students/STU0001",
            headers={"Authorization": f"Bearer {token}"},
        )
        self.assertEqual(student.status_code, 200, student.text)
        self.assertEqual(student.json()["financialConditions"], "Moderate")
        self.assertNotIn("assignmentSubmission", student.json())
        self.assertNotIn("lmsLogins", student.json())

    def test_database_migrates_legacy_student_columns(self):
        with connection() as conn:
            conn.execute(
                "ALTER TABLE student_records DROP CHECK "
                "chk_student_records_financial_conditions"
            )
            conn.execute(
                "ALTER TABLE student_records DROP COLUMN financial_conditions"
            )
            conn.execute(
                "ALTER TABLE student_records ADD COLUMN assignment_submission "
                "DOUBLE NOT NULL DEFAULT 0"
            )
            conn.execute(
                "ALTER TABLE student_records ADD COLUMN lms_logins "
                "INT NOT NULL DEFAULT 0"
            )
            conn.execute(
                "ALTER TABLE student_records ADD CONSTRAINT "
                "chk_student_records_assignment "
                "CHECK (assignment_submission BETWEEN 0 AND 100)"
            )
            conn.execute(
                "ALTER TABLE student_records ADD CONSTRAINT "
                "chk_student_records_lms_logins CHECK (lms_logins >= 0)"
            )
            conn.execute(
                "DELETE FROM dataset_metadata WHERE `key` = %s", ("sha256",)
            )

        initialize_database()

        with connection() as conn:
            columns = conn.execute(
                "SELECT COLUMN_NAME FROM information_schema.COLUMNS "
                "WHERE TABLE_SCHEMA = %s AND TABLE_NAME = 'student_records'",
                (TEST_DATABASE,),
            ).fetchall()
            column_names = {row["COLUMN_NAME"] for row in columns}
            row = conn.execute(
                "SELECT financial_conditions FROM student_records "
                "WHERE student_id = %s",
                ("STU0001",),
            ).fetchone()
        self.assertIn("financial_conditions", column_names)
        self.assertNotIn("assignment_submission", column_names)
        self.assertNotIn("lms_logins", column_names)
        self.assertEqual(row["financial_conditions"], "Moderate")

    def test_admin_database_metadata_uses_mysql_schema(self):
        token = self.login("admin@college.edu", "admin")
        response = self.client.get(
            "/api/admin/database", headers={"Authorization": f"Bearer {token}"}
        )
        self.assertEqual(response.status_code, 200, response.text)
        database = response.json()
        self.assertEqual(database["engine"], "MySQL")
        self.assertEqual(database["schemaFile"], "backend/schema.mysql.sql")
        self.assertEqual(
            {table["name"] for table in database["tables"]},
            {
                "dataset_metadata",
                "interventions",
                "login_attempts",
                "ngo_education_expenses",
                "ngo_student_assignments",
                "ngo_support_request_offers",
                "password_reset_tokens",
                "student_records",
                "student_support_requests",
                "teacher_student_details",
                "users",
            },
        )
        self.assertTrue(all(table["ddl"] for table in database["tables"]))

    def test_student_support_requests_are_private_and_admin_managed(self):
        admin_token = self.login("admin@college.edu", "admin")
        student_token = self.login("student@college.edu", "student", "test-password-123")
        admin_headers = {"Authorization": f"Bearer {admin_token}"}
        student_headers = {"Authorization": f"Bearer {student_token}"}

        submitted = self.client.post(
            "/api/student/support-requests",
            headers=student_headers,
            json={
                "category": "books",
                "amount": "1250.50",
                "details": "I need help buying required semester textbooks.",
            },
        )
        self.assertEqual(submitted.status_code, 201, submitted.text)
        request = submitted.json()
        self.assertEqual(request["studentId"], "STU0001")
        self.assertEqual(request["amount"], "1250.50")
        self.assertEqual(request["status"], "submitted")

        student_requests = self.client.get(
            "/api/student/support-requests", headers=student_headers
        )
        self.assertEqual(student_requests.status_code, 200, student_requests.text)
        self.assertIn(
            request["id"],
            [item["id"] for item in student_requests.json()],
        )
        self.assertEqual(
            self.client.get(
                "/api/admin/support-requests", headers=student_headers
            ).status_code,
            403,
        )
        self.assertEqual(
            self.client.get(
                "/api/student/support-requests", headers=admin_headers
            ).status_code,
            403,
        )
        another_student = self.client.post(
            "/api/users",
            headers=admin_headers,
            json={
                "email": "another-student@college.edu",
                "password": "another-student-password-123",
                "displayName": "Another Student",
                "role": "student",
                "studentId": "STU0002",
            },
        )
        self.assertEqual(another_student.status_code, 201, another_student.text)
        another_student_token = self.login(
            "another-student@college.edu", "student", "another-student-password-123"
        )
        self.assertEqual(
            self.client.get(
                "/api/student/support-requests",
                headers={"Authorization": f"Bearer {another_student_token}"},
            ).json(),
            [],
        )

        admin_requests = self.client.get(
            "/api/admin/support-requests", headers=admin_headers
        )
        self.assertEqual(admin_requests.status_code, 200, admin_requests.text)
        self.assertEqual(admin_requests.json()[0]["studentEmail"], "student@college.edu")
        updated = self.client.patch(
            f"/api/admin/support-requests/{request['id']}",
            headers=admin_headers,
            json={"status": "under_review"},
        )
        self.assertEqual(updated.status_code, 200, updated.text)
        self.assertEqual(updated.json()["status"], "under_review")
        self.assertEqual(
            self.client.get(
                "/api/student/support-requests", headers=student_headers
            ).json()[0]["status"],
            "under_review",
        )
        self.assertEqual(
            self.client.post(
                "/api/student/support-requests",
                headers=student_headers,
                json={
                    "category": "books",
                    "amount": "0",
                    "details": "Invalid amount",
                },
            ).status_code,
            422,
        )
        self.assertEqual(
            self.client.patch(
                f"/api/admin/support-requests/{request['id']}",
                headers=admin_headers,
                json={"status": "unknown"},
            ).status_code,
            422,
        )

    def test_approved_support_request_is_awarded_to_first_accepting_ngo(self):
        admin_token = self.login("admin@college.edu", "admin")
        admin_headers = {"Authorization": f"Bearer {admin_token}"}
        ngo_accounts = [
            ("support-ngo-one@college.edu", "Support NGO One"),
            ("support-ngo-two@college.edu", "Support NGO Two"),
        ]
        ngo_headers = []
        for email, display_name in ngo_accounts:
            created = self.client.post(
                "/api/users",
                headers=admin_headers,
                json={
                    "email": email,
                    "password": "ngo-test-password-123",
                    "displayName": display_name,
                    "role": "ngo",
                },
            )
            self.assertEqual(created.status_code, 201, created.text)
            token = self.login(email, "ngo", "ngo-test-password-123")
            ngo_headers.append({"Authorization": f"Bearer {token}"})

        student_token = self.login("student@college.edu", "student", "test-password-123")
        student_headers = {"Authorization": f"Bearer {student_token}"}
        submitted = self.client.post(
            "/api/student/support-requests",
            headers=student_headers,
            json={
                "category": "tuition",
                "amount": "7500.00",
                "details": "Help with semester tuition.",
            },
        )
        self.assertEqual(submitted.status_code, 201, submitted.text)
        request = submitted.json()
        request_id = request["id"]

        for headers in ngo_headers:
            self.assertEqual(
                self.client.get("/api/ngo/support-requests", headers=headers).json(),
                [],
            )

        approved = self.client.patch(
            f"/api/admin/support-requests/{request_id}",
            headers=admin_headers,
            json={"status": "approved"},
        )
        self.assertEqual(approved.status_code, 200, approved.text)
        self.assertEqual(approved.json()["status"], "approved")
        self.assertGreaterEqual(approved.json()["availableNGOCount"], 2)

        for headers in ngo_headers:
            offers = self.client.get("/api/ngo/support-requests", headers=headers)
            self.assertEqual(offers.status_code, 200, offers.text)
            self.assertEqual(len(offers.json()), 1)
            self.assertEqual(offers.json()[0]["id"], request_id)
            self.assertEqual(offers.json()[0]["offerStatus"], "offered")
            self.assertEqual(offers.json()[0]["studentEmail"], "student@college.edu")

        accepted = self.client.post(
            f"/api/ngo/support-requests/{request_id}/accept",
            headers=ngo_headers[0],
        )
        self.assertEqual(accepted.status_code, 200, accepted.text)
        self.assertEqual(accepted.json()["status"], "accepted")
        self.assertEqual(accepted.json()["acceptedBy"], "Support NGO One")

        losing_ngo_offers = self.client.get(
            "/api/ngo/support-requests", headers=ngo_headers[1]
        )
        self.assertEqual(losing_ngo_offers.status_code, 200, losing_ngo_offers.text)
        self.assertEqual(losing_ngo_offers.json()[0]["offerStatus"], "cancelled")
        rejected_acceptance = self.client.post(
            f"/api/ngo/support-requests/{request_id}/accept",
            headers=ngo_headers[1],
        )
        self.assertEqual(rejected_acceptance.status_code, 409)

        student_request = self.client.get(
            "/api/student/support-requests", headers=student_headers
        ).json()[0]
        self.assertEqual(student_request["status"], "accepted")
        self.assertEqual(student_request["acceptedBy"], "Support NGO One")

    def test_teacher_creates_student_with_private_portal_details(self):
        admin_token = self.login("admin@college.edu", "admin")
        admin_headers = {"Authorization": f"Bearer {admin_token}"}
        teacher_created = self.client.post(
            "/api/users",
            headers=admin_headers,
            json={
                "email": "details-teacher@college.edu",
                "password": "teacher-test-password-123",
                "displayName": "Details Teacher",
                "role": "teacher",
            },
        )
        self.assertEqual(teacher_created.status_code, 201, teacher_created.text)
        teacher_token = self.login(
            "details-teacher@college.edu", "teacher", "teacher-test-password-123"
        )
        teacher_headers = {"Authorization": f"Bearer {teacher_token}"}

        created = self.client.post(
            "/api/teacher/students",
            headers=teacher_headers,
            json={
                "email": "entered-student@college.edu",
                "displayName": "Entered Student",
                "attendance": 84.5,
                "internalMarks": 79,
                "previousGpa": 8.25,
                "backlogs": 1,
                "financialConditions": "Moderate",
            },
        )
        self.assertEqual(created.status_code, 201, created.text)
        response = created.json()
        self.assertGreaterEqual(len(response["temporaryPassword"]), 12)
        self.assertEqual(
            response["student"]["studentEmail"], "entered-student@college.edu"
        )
        self.assertEqual(response["student"]["attendance"], 84.5)
        self.assertEqual(response["student"]["createdBy"], "Details Teacher")

        student_token = self.login(
            "entered-student@college.edu", "student", response["temporaryPassword"]
        )
        student_headers = {"Authorization": f"Bearer {student_token}"}
        own_details = self.client.get(
            "/api/student/me/academic-details", headers=student_headers
        )
        self.assertEqual(own_details.status_code, 200, own_details.text)
        self.assertEqual(own_details.json()["student"]["previousGpa"], 8.25)

        existing_student_token = self.login(
            "student@college.edu", "student", "test-password-123"
        )
        existing_student_headers = {
            "Authorization": f"Bearer {existing_student_token}"
        }
        self.assertIsNone(
            self.client.get(
                "/api/student/me/academic-details",
                headers=existing_student_headers,
            ).json()["student"]
        )
        staff_details = self.client.get(
            "/api/staff/student-details", headers=admin_headers
        )
        self.assertEqual(staff_details.status_code, 200, staff_details.text)
        self.assertEqual(
            staff_details.json()[0]["studentEmail"], "entered-student@college.edu"
        )
        self.assertEqual(
            self.client.get(
                "/api/staff/student-details", headers=teacher_headers
            ).status_code,
            200,
        )
        self.assertEqual(
            self.client.get(
                "/api/staff/student-details", headers=student_headers
            ).status_code,
            403,
        )
        self.assertEqual(
            self.client.post(
                "/api/teacher/students",
                headers=student_headers,
                json={
                    "email": "not-allowed@college.edu",
                    "displayName": "Not Allowed",
                    "attendance": 80,
                    "internalMarks": 70,
                    "previousGpa": 7,
                    "backlogs": 0,
                    "financialConditions": "Stable",
                },
            ).status_code,
            403,
        )
        duplicate = self.client.post(
            "/api/teacher/students",
            headers=teacher_headers,
            json={
                "email": "entered-student@college.edu",
                "displayName": "Duplicate Student",
                "attendance": 80,
                "internalMarks": 70,
                "previousGpa": 7,
                "backlogs": 0,
                "financialConditions": "Stable",
            },
        )
        self.assertEqual(duplicate.status_code, 409)

    @patch("app.main.get_dropout_predictor")
    def test_ngo_access_is_limited_to_assigned_students_and_support(self, get_predictor):
        admin_token = self.login("admin@college.edu", "admin")
        admin_headers = {"Authorization": f"Bearer {admin_token}"}
        created = self.client.post(
            "/api/users",
            headers=admin_headers,
            json={
                "email": "ngo@college.edu",
                "password": "ngo-password-123",
                "displayName": "Community NGO",
                "role": "ngo",
            },
        )
        self.assertEqual(created.status_code, 201, created.text)
        ngo_id = created.json()["id"]
        ngo_token = self.login("ngo@college.edu", "ngo", "ngo-password-123")
        ngo_headers = {"Authorization": f"Bearer {ngo_token}"}

        self.assertEqual(
            self.client.put(
                f"/api/users/{ngo_id}/assigned-students",
                headers=ngo_headers,
                json={"studentIds": ["STU0001"]},
            ).status_code,
            403,
        )
        assignment = self.client.put(
            f"/api/users/{ngo_id}/assigned-students",
            headers=admin_headers,
            json={"studentIds": ["STU0001"]},
        )
        self.assertEqual(assignment.status_code, 200, assignment.text)
        self.assertEqual(assignment.json()["studentIds"], ["STU0001"])
        self.assertEqual(
            self.client.get(
                f"/api/users/{ngo_id}/assigned-students", headers=admin_headers
            ).json()["studentIds"],
            ["STU0001"],
        )

        self.assertEqual(
            self.client.get("/api/ngo/expenses", headers=admin_headers).status_code,
            403,
        )
        expense = self.client.post(
            "/api/ngo/expenses",
            headers=ngo_headers,
            json={
                "studentId": "STU0001",
                "category": "books",
                "description": "Semester textbooks",
                "amount": "1250.50",
                "expenseDate": date.today().isoformat(),
            },
        )
        self.assertEqual(expense.status_code, 201, expense.text)
        expense_id = expense.json()["id"]
        self.assertEqual(expense.json()["amount"], "1250.50")
        unassigned_expense = self.client.post(
            "/api/ngo/expenses",
            headers=ngo_headers,
            json={
                "studentId": "STU0002",
                "category": "tuition",
                "description": "Unassigned student expense",
                "amount": "500",
                "expenseDate": date.today().isoformat(),
            },
        )
        self.assertEqual(unassigned_expense.status_code, 404)
        empty_organization_expense = self.client.post(
            "/api/ngo/expenses",
            headers=ngo_headers,
            json={
                "category": "transport",
                "description": "Education transport support",
                "amount": "300.25",
                "expenseDate": date.today().isoformat(),
            },
        )
        self.assertEqual(empty_organization_expense.status_code, 201)
        expenses = self.client.get("/api/ngo/expenses", headers=ngo_headers)
        self.assertEqual(expenses.status_code, 200, expenses.text)
        self.assertEqual(expenses.json()["expenseCount"], 2)
        self.assertEqual(expenses.json()["totalAmount"], "1550.75")
        self.assertEqual(expenses.json()["monthAmount"], "1550.75")

        other_ngo = self.client.post(
            "/api/users",
            headers=admin_headers,
            json={
                "email": "other-ngo@college.edu",
                "password": "other-ngo-password-123",
                "displayName": "Another NGO",
                "role": "ngo",
            },
        )
        self.assertEqual(other_ngo.status_code, 201, other_ngo.text)
        other_ngo_token = self.login(
            "other-ngo@college.edu", "ngo", "other-ngo-password-123"
        )
        other_ngo_headers = {"Authorization": f"Bearer {other_ngo_token}"}
        self.assertEqual(
            self.client.get(
                "/api/ngo/expenses", headers=other_ngo_headers
            ).json()["expenseCount"],
            0,
        )
        self.assertEqual(
            self.client.delete(
                f"/api/ngo/expenses/{expense_id}",
                headers=other_ngo_headers,
            ).status_code,
            404,
        )
        self.assertEqual(
            self.client.delete(
                f"/api/ngo/expenses/{expense_id}",
                headers=ngo_headers,
            ).status_code,
            204,
        )
        remaining_expenses = self.client.get(
            "/api/ngo/expenses", headers=ngo_headers
        ).json()
        self.assertEqual(remaining_expenses["expenseCount"], 1)
        self.assertEqual(remaining_expenses["totalAmount"], "300.25")

        students = self.client.get("/api/students", headers=ngo_headers)
        self.assertEqual(students.status_code, 200, students.text)
        self.assertEqual([student["id"] for student in students.json()], ["STU0001"])
        self.assertEqual(
            self.client.get("/api/students/STU0001", headers=ngo_headers).status_code,
            200,
        )
        self.assertEqual(
            self.client.get("/api/students/STU0002", headers=ngo_headers).status_code,
            404,
        )

        get_predictor.return_value.predict.return_value = {
            "studentId": "STU0001",
            "predictedDropout": False,
            "probability": 0.1,
            "analysis": "Supportive check-ins may help.",
            "factors": [],
            "supportPlan": ["Offer a check-in", "Follow up with the student"],
        }
        prediction = self.client.get(
            "/api/students/STU0001/dropout-prediction", headers=ngo_headers
        )
        self.assertEqual(prediction.status_code, 200, prediction.text)
        self.assertIn("supportPlan", prediction.json())
        self.assertEqual(
            self.client.get(
                "/api/students/STU0002/dropout-prediction", headers=ngo_headers
            ).status_code,
            404,
        )

        for endpoint in (
            "/api/users",
            "/api/analytics/summary",
            "/api/interventions",
            "/api/admin/database",
        ):
            with self.subTest(endpoint=endpoint):
                self.assertEqual(
                    self.client.get(endpoint, headers=ngo_headers).status_code,
                    403,
                )
        manual_prediction = self.client.post(
            "/api/predictions/manual",
            headers=ngo_headers,
            json={
                "attendance": 80,
                "internalMarks": 65,
                "previousGpa": 7,
                "backlogs": 1,
                "financialConditions": "Moderate",
            },
        )
        self.assertEqual(manual_prediction.status_code, 403)

        invalid_assignment = self.client.put(
            f"/api/users/{ngo_id}/assigned-students",
            headers=admin_headers,
            json={"studentIds": ["STU0001", "UNKNOWN"]},
        )
        self.assertEqual(invalid_assignment.status_code, 422)
        retained = self.client.get(
            f"/api/users/{ngo_id}/assigned-students", headers=admin_headers
        )
        self.assertEqual(retained.json()["studentIds"], ["STU0001"])

    @patch("app.main.send_password_reset_email")
    def test_password_reset_email_changes_password_once(self, send_email):
        created_account = self.client.post(
            "/api/users",
            headers={"Authorization": f"Bearer {self.login('admin@college.edu', 'admin')}"},
            json={
                "email": "reset-target@college.edu",
                "password": "reset-target-password-123",
                "displayName": "Reset Target",
                "role": "teacher",
            },
        )
        self.assertEqual(created_account.status_code, 201)
        response = self.client.post(
            "/api/auth/password-reset",
            json={"email": "reset-target@college.edu"},
        )
        self.assertEqual(response.status_code, 202, response.text)
        send_email.assert_called_once()
        token = send_email.call_args.args[1]

        reset = self.client.post(
            "/api/auth/password-reset/confirm",
            json={"token": token, "password": "new-reset-target-password-123"},
        )
        self.assertEqual(reset.status_code, 204, reset.text)
        replay = self.client.post(
            "/api/auth/password-reset/confirm",
            json={"token": token, "password": "another-reset-target-password-123"},
        )
        self.assertEqual(replay.status_code, 400)
        login = self.client.post(
            "/api/auth/login",
            json={
                "email": "reset-target@college.edu",
                "password": "new-reset-target-password-123",
                "role": "teacher",
            },
        )
        self.assertEqual(login.status_code, 200, login.text)

    @patch("app.main.send_password_reset_email")
    def test_password_reset_does_not_disclose_unknown_accounts(self, send_email):
        response = self.client.post(
            "/api/auth/password-reset",
            json={"email": "missing@college.edu"},
        )
        self.assertEqual(response.status_code, 202)
        self.assertEqual(
            response.json()["message"],
            "If an active account uses that email, a reset link will be sent.",
        )
        send_email.assert_not_called()

    @patch("app.email_service.smtplib.SMTP")
    def test_password_reset_email_contains_frontend_token_link(self, smtp):
        send_password_reset_email("user@college.edu", "one-time-test-token-12345678901234567890")
        smtp_connection = smtp.return_value.__enter__.return_value
        message = smtp_connection.send_message.call_args.args[0]
        self.assertIn(
            "http://localhost:5173/reset-password?token=one-time-test-token-12345678901234567890",
            message.get_content(),
        )

    def test_role_permissions_and_student_record_scope(self):
        student_token = self.login("student@college.edu", "student")
        headers = {"Authorization": f"Bearer {student_token}"}
        self.assertEqual(self.client.get("/api/students", headers=headers).status_code, 403)
        self.assertEqual(
            self.client.get(
                "/api/students/STU0001/dropout-prediction", headers=headers
            ).status_code,
            403,
        )
        own_record = self.client.get("/api/student/me", headers=headers)
        self.assertEqual(own_record.status_code, 200)
        self.assertEqual(own_record.json()["student"]["id"], "STU0001")
        self.assertEqual(
            self.client.get("/api/students/STU0002", headers=headers).status_code,
            403,
        )
        self.assertEqual(self.client.get("/api/students").status_code, 401)

    def test_staff_dropout_prediction_uses_model_without_exposing_features(self):
        endpoint = "/api/students/STU0001/dropout-prediction"
        self.assertEqual(self.client.get(endpoint).status_code, 401)

        admin_token = self.login("admin@college.edu", "admin")
        response = self.client.get(
            endpoint,
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        self.assertEqual(response.status_code, 200, response.text)
        prediction = response.json()
        self.assertEqual(
            set(prediction),
            {
                "studentId",
                "predictedDropout",
                "probability",
                "analysis",
                "factors",
                "supportPlan",
            },
        )
        self.assertEqual(prediction["studentId"], "STU0001")
        self.assertIsInstance(prediction["predictedDropout"], bool)
        self.assertIsInstance(prediction["probability"], float)
        self.assertGreaterEqual(prediction["probability"], 0)
        self.assertLessEqual(prediction["probability"], 1)
        self.assertIsInstance(prediction["analysis"], str)
        self.assertTrue(prediction["analysis"])
        self.assertNotIn("threshold", response.text.lower())
        self.assertNotIn("regression", response.text.lower())
        self.assertGreaterEqual(len(prediction["supportPlan"]), 2)
        self.assertIn("considering leaving", prediction["supportPlan"][0])
        self.assertIn("follow-up check-in", prediction["supportPlan"][-1])
        self.assertLessEqual(len(prediction["factors"]), 3)
        for factor in prediction["factors"]:
            self.assertEqual(set(factor), {"factor", "explanation", "support"})
            self.assertTrue(factor["factor"])

    def test_dropout_prediction_unknown_student_returns_not_found(self):
        admin_token = self.login("admin@college.edu", "admin")
        response = self.client.get(
            "/api/students/UNKNOWN/dropout-prediction",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        self.assertEqual(response.status_code, 404)

    def test_staff_can_predict_from_manual_inputs_without_creating_student(self):
        body = {
            "attendance": 80,
            "internalMarks": 65,
            "previousGpa": 7,
            "backlogs": 1,
            "financialConditions": "Moderate",
        }
        response = self.client.post("/api/predictions/manual", json=body)
        self.assertEqual(response.status_code, 401)

        token = self.login("admin@college.edu", "admin")
        response = self.client.post(
            "/api/predictions/manual",
            headers={"Authorization": f"Bearer {token}"},
            json=body,
        )
        self.assertEqual(response.status_code, 200, response.text)
        result = response.json()
        self.assertIsNone(result["studentId"])
        self.assertIsInstance(result["probability"], float)
        self.assertGreaterEqual(result["probability"], 0)
        self.assertLessEqual(result["probability"], 1)
        self.assertTrue(result["analysis"])
        self.assertTrue(result["supportPlan"])

        invalid = {**body, "attendance": 120}
        invalid_response = self.client.post(
            "/api/predictions/manual",
            headers={"Authorization": f"Bearer {token}"},
            json=invalid,
        )
        self.assertEqual(invalid_response.status_code, 422)
        invalid_category = self.client.post(
            "/api/predictions/manual",
            headers={"Authorization": f"Bearer {token}"},
            json={**body, "financialConditions": "Unknown"},
        )
        self.assertEqual(invalid_category.status_code, 422)

    def test_student_cannot_use_staff_manual_prediction(self):
        token = self.login("student@college.edu", "student")
        response = self.client.post(
            "/api/predictions/manual",
            headers={"Authorization": f"Bearer {token}"},
            json={
                "attendance": 80,
                "internalMarks": 65,
                "previousGpa": 7,
                "backlogs": 1,
                "financialConditions": "Moderate",
            },
        )
        self.assertEqual(response.status_code, 403)

    def test_account_creation_and_intervention_lifecycle(self):
        admin_token = self.login("admin@college.edu", "admin")
        headers = {"Authorization": f"Bearer {admin_token}"}
        created_user = self.client.post(
            "/api/users",
            headers=headers,
            json={
                "email": "teacher@college.edu",
                "password": "teacher-password-123",
                "displayName": "Test Teacher",
                "role": "teacher",
            },
        )
        self.assertEqual(created_user.status_code, 201, created_user.text)
        self.assertNotIn("password", created_user.json())
        teacher_token = self.login(
            "teacher@college.edu", "teacher", "teacher-password-123"
        )
        prediction = self.client.get(
            "/api/students/STU0001/dropout-prediction",
            headers={"Authorization": f"Bearer {teacher_token}"},
        )
        self.assertEqual(prediction.status_code, 200, prediction.text)
        reset_password = self.client.patch(
            f"/api/users/{created_user.json()['id']}/password",
            headers=headers,
            json={"password": "replacement-password-456"},
        )
        self.assertEqual(reset_password.status_code, 204)
        revoked_session = self.client.get(
            "/api/auth/me", headers={"Authorization": f"Bearer {teacher_token}"}
        )
        self.assertEqual(revoked_session.status_code, 401)
        old_password = self.client.post(
            "/api/auth/login",
            json={
                "email": "teacher@college.edu",
                "password": "teacher-password-123",
                "role": "teacher",
            },
        )
        self.assertEqual(old_password.status_code, 401)
        new_password = self.client.post(
            "/api/auth/login",
            json={
                "email": "teacher@college.edu",
                "password": "replacement-password-456",
                "role": "teacher",
            },
        )
        self.assertEqual(new_password.status_code, 200)

        created = self.client.post(
            "/api/interventions",
            headers=headers,
            json={
                "studentId": "STU0001",
                "title": "Offer academic support",
                "notes": "Schedule a check-in.",
                "status": "planned",
            },
        )
        self.assertEqual(created.status_code, 201, created.text)
        intervention_id = created.json()["id"]
        updated = self.client.patch(
            f"/api/interventions/{intervention_id}",
            headers=headers,
            json={"status": "completed"},
        )
        self.assertEqual(updated.status_code, 200)
        self.assertEqual(updated.json()["status"], "completed")
        self.assertEqual(
            self.client.delete(
                f"/api/interventions/{intervention_id}", headers=headers
            ).status_code,
            204,
        )

    def test_repeated_failed_login_is_throttled(self):
        body = {
            "email": "unknown@college.edu",
            "password": "incorrect-password",
            "role": "student",
        }
        for _ in range(8):
            self.assertEqual(self.client.post("/api/auth/login", json=body).status_code, 401)
        response = self.client.post("/api/auth/login", json=body)
        self.assertEqual(response.status_code, 429)
        self.assertIn("Retry-After", response.headers)


if __name__ == "__main__":
    unittest.main()
