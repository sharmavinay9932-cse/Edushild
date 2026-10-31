# EduShield backend

FastAPI REST API with MySQL persistence for accounts and interventions. On
startup it validates the configured MySQL database, creates any missing
application tables, and imports selected columns from the synthetic student
CSV. Dataset rows are refreshed only when the CSV content changes. Teacher and admin users can request an on-demand dropout estimate from the
saved model. NGO users can request one only for student IDs assigned to their
account. The model uses attendance, internal marks, previous GPA, backlogs,
and financial conditions. Extra model inputs are read from the configured CSV
in memory and are not stored in MySQL or returned by the API.

## Run locally (Windows PowerShell)

From the `backend` directory:

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
Copy-Item .env.example .env
```

In `.env`, set `EDUSHIELD_JWT_SECRET` to at least 32 random characters and
enter the same MySQL password you use for the Workbench connection in
`EDUSHIELD_MYSQL_PASSWORD`. Do not send the password in chat or commit `.env`.
The default connection is `127.0.0.1:3306`, user `root`, database `edushield`.
The database must already exist; set `EDUSHIELD_MYSQL_CREATE_DATABASE=true`
only if this MySQL user is allowed to create it.

Generate a signing secret:

```powershell
python -c "import secrets; print(secrets.token_urlsafe(48))"
```

Create the first administrator interactively (the password is not echoed or
saved in shell history), then start the server:

```powershell
python -m app.create_admin
python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

The app creates the application tables if they do not exist. You may also
run `schema.mysql.sql` in MySQL Workbench; the checked database schema is
`edushield`. The backend does not clear accounts or interventions. It replaces
only `student_records` when the configured CSV content changes.

To enable password recovery, configure the SMTP settings in `.env` and restart
the backend. For Gmail, use `smtp.gmail.com`, port `587`, your Gmail address as
the SMTP username and sender, and a Google app password (not your normal Gmail
password); set `EDUSHIELD_SMTP_USE_SSL=false`. Keep SMTP credentials private.
The default reset-link base is `http://localhost:5173`; change
`EDUSHIELD_FRONTEND_URL` for another local host or HTTPS deployment.

Set `frontend/.env.local` to:

```dotenv
VITE_API_BASE_URL=http://localhost:8000/api
```

Then start the Vite frontend from `frontend` with `npm run dev`. The backend
serves interactive API documentation at `http://localhost:8000/docs`; health
and dataset readiness are available at `http://localhost:8000/api/health`.
The first admin can create all other accounts from the **Accounts** page.
Student accounts may optionally be linked to one synthetic dataset ID. Admins
can create NGO accounts and assign them selected student IDs from that page.
NGO accounts can view only their assigned student records and the associated
AI support plans; they cannot access campus-wide analytics, manual predictions,
interventions, reports, or account administration. An NGO can also record
education expenses in its portal, link them to its assigned students or mark
them organization-wide, and view or remove only expenses recorded by its own
account. Students can submit education-cost support requests from the student
portal and see their request status. Requests remain private to the submitting
student and administrators until approval. When an administrator approves a
request from the **Support requests** page, it is offered to every active NGO
account and appears in each NGO dashboard. The first NGO to accept wins; all
other pending offers are cancelled, and the selected NGO is shown to the
student and administrators. Approval requires at least one active NGO account.
Teachers can create student portal accounts with academic details from the
teacher dashboard. The generated temporary password is shown once after
creation; the saved details are visible to the student and administrators and
are stored separately from the refreshed synthetic dataset.

## Configuration

| Variable | Default | Description |
|---|---|---|
| `EDUSHIELD_JWT_SECRET` | Required | Secret key for signing access tokens (minimum 32 characters) |
| `EDUSHIELD_MYSQL_HOST` | `127.0.0.1` | MySQL server host |
| `EDUSHIELD_MYSQL_PORT` | `3306` | MySQL server port |
| `EDUSHIELD_MYSQL_USER` | `root` | MySQL account |
| `EDUSHIELD_MYSQL_PASSWORD` | Empty | MySQL password; keep it private in `.env` |
| `EDUSHIELD_MYSQL_DATABASE` | `edushield` | MySQL schema/database name |
| `EDUSHIELD_MYSQL_CREATE_DATABASE` | `false` | Create the schema if it does not exist |
| `EDUSHIELD_FRONTEND_URL` | `http://localhost:5173` | Base URL used in password reset links |
| `EDUSHIELD_SMTP_HOST` | Empty | Outgoing mail server hostname |
| `EDUSHIELD_SMTP_PORT` | `587` | SMTP port (typically 587 for STARTTLS, 465 for SSL) |
| `EDUSHIELD_SMTP_USERNAME` | Empty | SMTP account username; optional for trusted relays |
| `EDUSHIELD_SMTP_PASSWORD` | Empty | SMTP password or provider app password |
| `EDUSHIELD_SMTP_FROM` | Empty | Sender address for reset emails |
| `EDUSHIELD_SMTP_USE_SSL` | `false` | Use implicit SSL (for example, port 465) |
| `EDUSHIELD_DATASET_PATH` | `datasets/edushield_ai_student_dataset_2500.csv` | Student CSV with dataset ID, model features, risk category, and dropout label |
| `EDUSHIELD_MODEL_PATH` | `models/dropout_model.joblib` | Packaged scikit-learn pipeline, model features, and decision threshold |
| `EDUSHIELD_CORS_ORIGINS` | `http://localhost:5173,http://127.0.0.1:5173` | Exact browser origins allowed to call the API |
| `EDUSHIELD_ACCESS_TOKEN_MINUTES` | `60` | Access-token lifetime |

Login attempts are throttled after repeated failures. Account status is checked
on each request, so disabling an account revokes its active access immediately.
Password reset links are single-use, expire after 30 minutes, and are stored
only as token hashes. Password reset requests are rate-limited and use a
generic response that does not disclose whether an email belongs to an account.

The student details page offers staff an on-demand model estimate; NGOs can
request it only for assigned student IDs. The model package must contain the
dropout classifier pipeline, its feature list, and a decision threshold.
Predictions use the configured synthetic CSV and
return a categorical support indication, estimated probability percentage,
brief explanation of factors associated with that assessment, and a practical
retention-support plan. They do not expose decision thresholds or model
metadata. The explanations are associations learned from synthetic data, not
confirmed causes. Staff should discuss options with the student and choose
next steps together; the plan is not a guarantee and must not be the sole basis
for interventions or academic outcomes.

Admins and teachers can also run a one-time prediction with manually entered
model inputs from the student details page. Manual submissions are not saved
to the student database.

## Tests

From `backend`, run:

```powershell
python -m unittest discover -s tests -v
```

Tests require a MySQL account with permission to create and drop databases.
Each run generates and removes its own `edushield_test_<random>` schema; it
never uses or drops the configured `edushield` application schema.

## Deployment notes

Use HTTPS, a unique secret stored in a secrets manager, a persistent database
with backups, and production CORS origins. Do not expose credentials or use
the default local MySQL account for production. Put the API behind a
rate-limiting reverse proxy and add operational monitoring/audit retention
appropriate to your institution before using real student information. The
provided records are synthetic and are not suitable for real academic decisions.
