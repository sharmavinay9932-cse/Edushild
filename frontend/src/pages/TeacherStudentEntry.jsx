import React, { useState } from 'react';
import { Copy, CopyCheck } from 'lucide-react';
import { Link } from 'react-router-dom';
import PrimaryNavigation from '../components/layout/PrimaryNavigation.jsx';
import { createTeacherStudent } from '../services/teacherStudentService.js';
import '../styles/data-pages.css';
import '../styles/support-requests.css';
import '../styles/teacher-student-entry.css';

const emptyForm = {
  displayName: '',
  email: '',
  attendance: '',
  internalMarks: '',
  previousGpa: '',
  backlogs: '',
  financialConditions: '',
};

function getErrorMessage(error) {
  return error.response?.data?.detail
    || error.message
    || 'Unable to save student details.';
}

export default function TeacherStudentEntry() {
  const [form, setForm] = useState(emptyForm);
  const [created, setCreated] = useState(null);
  const [copied, setCopied] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  function updateField(event) {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
    setCreated(null);
    setCopied(false);
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setSaving(true);
    setError('');
    setCreated(null);
    try {
      const result = await createTeacherStudent({
        ...form,
        attendance: Number(form.attendance),
        internalMarks: Number(form.internalMarks),
        previousGpa: Number(form.previousGpa),
        backlogs: Number(form.backlogs),
      });
      setCreated(result);
      setForm(emptyForm);
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setSaving(false);
    }
  }

  async function copyTemporaryPassword() {
    try {
      await navigator.clipboard.writeText(created.temporaryPassword);
      setCopied(true);
    } catch {
      setError('Could not copy the password. Select and copy it manually.');
    }
  }

  return (
    <main className="data-page">
      <header className="data-page-header" data-scroll-reveal>
        <div>
          <p className="eyebrow">EDUSHIELD <span> / </span> TEACHER PORTAL</p>
          <h1>Add student details</h1>
          <p className="data-page-subtitle">
            Create a student portal login and enter academic details visible to that student and administrators.
          </p>
        </div>
        <PrimaryNavigation />
      </header>
      <Link className="data-back-link" to="/">← Back to dashboard</Link>

      {error && <div className="data-state data-state-error" role="alert">{error}</div>}
      {created && (
        <section className="data-state teacher-student-created" role="status">
          <strong>Student account and details created.</strong>
          <span>
            Share this temporary password with {created.student.studentName}. It is shown only now:
          </span>
          <div className="teacher-temporary-password">
            <code>{created.temporaryPassword}</code>
            <button type="button" onClick={copyTemporaryPassword} aria-label="Copy temporary password">
              {copied ? <CopyCheck size={16} aria-hidden="true" /> : <Copy size={16} aria-hidden="true" />}
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
          <small>The student can sign in using {created.student.studentEmail}.</small>
        </section>
      )}

      <section className="data-panel teacher-student-entry-panel" data-scroll-reveal>
        <div className="teacher-student-entry-heading">
          <p className="support-request-kicker">Student portal account</p>
          <h2>Student information</h2>
          <p>These details are saved to the student’s account and appear in their portal and the admin dashboard.</p>
        </div>
        <form className="management-form teacher-student-entry-form" onSubmit={handleSubmit}>
          <label>
            Student name
            <input
              name="displayName"
              type="text"
              autoComplete="name"
              maxLength={120}
              value={form.displayName}
              onChange={updateField}
              required
            />
          </label>
          <label>
            Student email
            <input
              name="email"
              type="email"
              autoComplete="email"
              maxLength={254}
              value={form.email}
              onChange={updateField}
              required
            />
          </label>
          <label>
            Attendance (%)
            <input
              name="attendance"
              type="number"
              min="0"
              max="100"
              step="0.1"
              value={form.attendance}
              onChange={updateField}
              required
            />
          </label>
          <label>
            Internal marks (%)
            <input
              name="internalMarks"
              type="number"
              min="0"
              max="100"
              step="0.1"
              value={form.internalMarks}
              onChange={updateField}
              required
            />
          </label>
          <label>
            Previous GPA (0–10)
            <input
              name="previousGpa"
              type="number"
              min="0"
              max="10"
              step="0.01"
              value={form.previousGpa}
              onChange={updateField}
              required
            />
          </label>
          <label>
            Backlogs
            <input
              name="backlogs"
              type="number"
              min="0"
              max="50"
              step="1"
              value={form.backlogs}
              onChange={updateField}
              required
            />
          </label>
          <label>
            Financial conditions
            <select
              name="financialConditions"
              value={form.financialConditions}
              onChange={updateField}
              required
            >
              <option value="">Choose…</option>
              <option value="Stable">Stable</option>
              <option value="Moderate">Moderate</option>
              <option value="Severe">Severe</option>
            </select>
          </label>
          <p className="teacher-entry-password-note">
            A temporary password will be generated after the account is created. Copy it then and give it to the student.
          </p>
          <button className="management-submit teacher-entry-submit" type="submit" disabled={saving}>
            {saving ? 'Creating student account…' : 'Create account and save details'}
          </button>
        </form>
      </section>
    </main>
  );
}
