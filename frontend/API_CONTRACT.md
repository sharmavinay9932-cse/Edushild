# EduShield API contract

The frontend uses the backend at `VITE_API_BASE_URL` (default project setup:
`http://localhost:8000/api`). Protected requests send the in-memory bearer
token in the `Authorization` header. Tokens expire after the configured
`EDUSHIELD_ACCESS_TOKEN_MINUTES`; refresh the page or sign in again after
expiration.

The backend implementation and local setup are documented in
[`../backend/README.md`](../backend/README.md).

## Authentication

`POST /auth/login`

```json
{
  "email": "user@college.edu",
  "password": "provided-by-user",
  "role": "admin"
}
```

On success, the response contains an access token and user identity:

```json
{
  "accessToken": "backend-issued-token",
  "tokenType": "bearer",
  "expiresIn": 3600,
  "user": {
    "id": "account-id",
    "displayName": "Account name",
    "role": "admin"
  }
}
```

`GET /auth/me` returns the authenticated account. Invalid credentials and a
role mismatch return the same `401` response. Repeated failed sign-ins are
temporarily throttled. Admins create and disable accounts through the accounts
page; no public registration or demo credentials are provided.

`POST /auth/password-reset` accepts an email and emails a single-use link when
an active account matches. It returns the same generic response for known and
unknown addresses. `POST /auth/password-reset/confirm` accepts the link token
and a new password of at least 12 characters. Reset links expire after 30
minutes. SMTP must be configured by the administrator for recovery emails.

## Student support and predictions

`GET /students/{studentId}/dropout-prediction` (admin, teacher) returns a
categorical support indication and an estimated probability percentage for
one synthetic dataset record, along with a brief factor analysis and practical
retention-support plan. It does not expose decision thresholds or model labels.
The factors are patterns associated with the assessment, not confirmed causes;
staff and students should choose support steps together. The plan does not
guarantee an outcome.

`POST /predictions/manual` (admin, teacher) accepts the same model input fields
for an exploratory prediction. Manual values are not stored as student records.

## Data endpoints

| Endpoint | Access | Purpose |
|---|---|---|
| `GET /health` | Public | Backend and dataset readiness |
| `GET /students` | Admin, teacher | Student rows; supports `search`, `risk_level`, `limit`, and `offset` |
| `GET /students/{studentId}` | Admin, teacher | One dataset record |
| `GET /students/{studentId}/dropout-prediction` | Admin, teacher | On-demand model estimate for one synthetic record |
| `GET /student/me` | Student | Only the record explicitly linked to the signed-in account |
| `GET /analytics/summary` | Admin, teacher | Dataset metrics and attendance/risk distributions |
| `GET /risk-analysis` | Admin, teacher | Existing dataset risk and dropout labels with selected indicators |
| `GET /interventions` | Admin, teacher | Saved intervention records |
| `POST /interventions` | Admin, teacher | Create an intervention for an existing dataset ID |
| `PATCH /interventions/{id}` | Admin, teacher | Update intervention title, notes, status, or due date |
| `DELETE /interventions/{id}` | Admin, teacher | Delete an intervention |
| `GET /users` | Admin | List provisioned accounts |
| `POST /users` | Admin | Create an admin, teacher, or student account |
| `PATCH /users/{id}/status` | Admin | Enable or disable an account |
| `PATCH /users/{id}/password` | Admin | Reset an account password |

The API validates roles independently of the frontend. Students cannot access
staff datasets, analytics, risk, account, or intervention endpoints. Passwords
are stored as salted PBKDF2 hashes. The local backend imports only selected
academic fields into MySQL; sensitive fields not used in the UI are not
stored.

## Dataset and model scope

The CSV in `../datasets/` is synthetic. Risk categories and dropout labels are
supplied by the file; they are descriptive source values, **not predictions**.
The file has no dates or intervention history. The saved model artifacts are
used only for the staff-only, on-demand dropout estimate endpoint; the estimate
is experimental and is not a substitute for human review. A student account can
optionally be linked by an administrator to a synthetic dataset ID; this does
not convert it into a live student record.
