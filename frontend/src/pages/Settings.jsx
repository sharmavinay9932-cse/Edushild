import React, { useEffect, useState } from 'react';
import PrimaryNavigation from '../components/layout/PrimaryNavigation.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { getStudents } from '../services/studentService.js';
import {
  createUser,
  getAssignedStudents,
  getUsers,
  resetUserPassword,
  updateAssignedStudents,
  updateUserStatus,
} from '../services/userService.js';
import '../styles/data-pages.css';

const emptyForm = {
  email: '',
  displayName: '',
  password: '',
  role: 'teacher',
  studentId: '',
};

function responseMessage(error, fallback) {
  return error.response?.data?.detail || error.message || fallback;
}

export default function Settings() {
  const { user } = useAuth();
  const [accounts, setAccounts] = useState([]);
  const [students, setStudents] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingId, setSavingId] = useState(null);
  const [resetAccountId, setResetAccountId] = useState(null);
  const [resetPassword, setResetPassword] = useState('');
  const [assignmentAccountId, setAssignmentAccountId] = useState(null);
  const [assignmentStudentIds, setAssignmentStudentIds] = useState(null);
  const [assignmentSearch, setAssignmentSearch] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    let active = true;
    Promise.all([getUsers(), getStudents()])
      .then(([userData, studentData]) => {
        if (!Array.isArray(userData) || !Array.isArray(studentData)) {
          throw new Error('The backend returned an unexpected response.');
        }
        if (!active) return;
        setAccounts(userData);
        setStudents(studentData);
      })
      .catch((requestError) => {
        if (active) setError(responseMessage(requestError, 'Unable to load account settings.'));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');
    setNotice('');
    setSaving(true);
    try {
      const account = await createUser({
        email: form.email,
        displayName: form.displayName,
        password: form.password,
        role: form.role,
        studentId: form.role === 'student' && form.studentId ? form.studentId : null,
      });
      setAccounts((current) => [...current, account]);
      setForm(emptyForm);
      if (account.role === 'ngo') {
        setAssignmentAccountId(account.id);
        setAssignmentStudentIds([]);
        setAssignmentSearch('');
        setNotice('NGO account created. Assign its student records below before the NGO can view them.');
      } else {
        setNotice('Account created.');
      }
    } catch (requestError) {
      setError(responseMessage(requestError, 'Unable to create account.'));
    } finally {
      setSaving(false);
    }
  }

  async function handleStatusChange(account) {
    setError('');
    setNotice('');
    setSavingId(account.id);
    try {
      const updated = await updateUserStatus(account.id, !account.active);
      setAccounts((current) => current.map((item) => item.id === updated.id ? updated : item));
      setNotice(`${updated.displayName}'s account is ${updated.active ? 'active' : 'disabled'}.`);
    } catch (requestError) {
      setError(responseMessage(requestError, 'Unable to update account status.'));
    } finally {
      setSavingId(null);
    }
  }

  async function handlePasswordReset(event, userId) {
    event.preventDefault();
    setError('');
    setNotice('');
    setSavingId(userId);
    try {
      await resetUserPassword(userId, resetPassword);
      setResetAccountId(null);
      setResetPassword('');
      setNotice('Password reset. Ask the account holder to sign in with the new password.');
    } catch (requestError) {
      setError(responseMessage(requestError, 'Unable to reset the account password.'));
    } finally {
      setSavingId(null);
    }
  }

  async function handleAssignmentToggle(account) {
    if (assignmentAccountId === account.id) {
      setAssignmentAccountId(null);
      setAssignmentStudentIds(null);
      setAssignmentSearch('');
      return;
    }

    setError('');
    setAssignmentAccountId(account.id);
    setAssignmentStudentIds(null);
    setAssignmentSearch('');
    setSavingId(account.id);
    try {
      const response = await getAssignedStudents(account.id);
      if (!Array.isArray(response.studentIds)) {
        throw new Error('The backend returned an unexpected student assignment response.');
      }
      setAssignmentStudentIds(response.studentIds);
    } catch (requestError) {
      setAssignmentAccountId(null);
      setError(responseMessage(requestError, 'Unable to load NGO student assignments.'));
    } finally {
      setSavingId(null);
    }
  }

  async function handleAssignmentSave(event, userId) {
    event.preventDefault();
    setError('');
    setNotice('');
    setSavingId(userId);
    try {
      const response = await updateAssignedStudents(userId, assignmentStudentIds || []);
      if (!Array.isArray(response.studentIds)) {
        throw new Error('The backend returned an unexpected student assignment response.');
      }
      setAssignmentStudentIds(response.studentIds);
      setNotice(`Saved ${response.studentIds.length} assigned student record${response.studentIds.length === 1 ? '' : 's'}.`);
    } catch (requestError) {
      setError(responseMessage(requestError, 'Unable to save NGO student assignments.'));
    } finally {
      setSavingId(null);
    }
  }

  return (
    <main className="data-page">
      <header className="data-page-header" data-scroll-reveal>
        <div>
          <p className="eyebrow">EDUSHIELD <span> / </span> ADMINISTRATION</p>
          <h1>Accounts</h1>
          <p className="data-page-subtitle">Create and manage administrator, teacher, student, and NGO access.</p>
        </div>
        <PrimaryNavigation />
      </header>

      {loading && <div className="data-state" role="status">Loading accounts…</div>}
      {error && <div className="data-state data-state-error" role="alert">{error}</div>}
      {notice && <div className="data-state" role="status">{notice}</div>}

      {!loading && (
        <>
          <section className="data-panel intervention-create-panel" data-scroll-reveal>
            <h2>Create an account</h2>
            <form className="management-form" onSubmit={handleSubmit}>
              <label>
                <span>Display name</span>
                <input
                  autoComplete="name"
                  value={form.displayName}
                  onChange={(event) => setForm({ ...form, displayName: event.target.value })}
                  maxLength={120}
                  required
                />
              </label>
              <label>
                <span>Campus email</span>
                <input
                  type="email"
                  autoComplete="email"
                  value={form.email}
                  onChange={(event) => setForm({ ...form, email: event.target.value })}
                  required
                />
              </label>
              <label>
                <span>Temporary password (12+ characters)</span>
                <input
                  type="password"
                  autoComplete="new-password"
                  minLength={12}
                  maxLength={256}
                  value={form.password}
                  onChange={(event) => setForm({ ...form, password: event.target.value })}
                  required
                />
              </label>
              <label>
                <span>Account type</span>
                <select
                  value={form.role}
                  onChange={(event) => setForm({ ...form, role: event.target.value, studentId: '' })}
                >
                  <option value="admin">Admin</option>
                  <option value="teacher">Teacher</option>
                  <option value="student">Student</option>
                  <option value="ngo">NGO</option>
                </select>
              </label>
              {form.role === 'student' && (
                <label>
                  <span>Link synthetic dataset record (optional)</span>
                  <select
                    value={form.studentId}
                    onChange={(event) => setForm({ ...form, studentId: event.target.value })}
                  >
                    <option value="">No record linked</option>
                    {students.map((student) => (
                      <option key={student.id} value={student.id}>{student.id}</option>
                    ))}
                  </select>
                </label>
              )}
              <button className="management-submit" type="submit" disabled={saving}>
                {saving ? 'Creating…' : 'Create account'}
              </button>
            </form>
          </section>

          <section className="data-panel intervention-list-panel" data-scroll-reveal>
            <h2>Accounts ({accounts.length})</h2>
            {accounts.length === 0 ? (
              <p className="data-empty">No accounts have been created.</p>
            ) : (
              <div className="data-table-scroll">
                <table className="data-table">
                  <thead>
                    <tr><th>Name</th><th>Email</th><th>Role</th><th>Student record</th><th>Status</th><th /></tr>
                  </thead>
                  <tbody>
                    {accounts.map((account) => (
                      <tr key={account.id}>
                        <td><strong>{account.displayName}</strong></td>
                        <td>{account.email}</td>
                        <td>{account.role}</td>
                        <td>{account.studentId || '—'}</td>
                        <td>{account.active ? 'Active' : 'Disabled'}</td>
                        <td>
                          <div className="management-actions">
                            {account.role === 'ngo' && (
                              <button
                                className="management-action"
                                type="button"
                                disabled={savingId === account.id}
                                onClick={() => handleAssignmentToggle(account)}
                              >
                                {assignmentAccountId === account.id ? 'Close assignments' : 'Assign students'}
                              </button>
                            )}
                            <button
                              className="management-delete"
                              type="button"
                              disabled={savingId === account.id || account.id === user.id}
                              onClick={() => handleStatusChange(account)}
                            >
                              {account.active ? 'Disable' : 'Enable'}
                            </button>
                            <button
                              className="management-action"
                              type="button"
                              onClick={() => {
                                setResetAccountId(resetAccountId === account.id ? null : account.id);
                                setResetPassword('');
                              }}
                            >
                              Reset password
                            </button>
                          </div>
                          {resetAccountId === account.id && (
                            <form className="management-reset-form" onSubmit={(event) => handlePasswordReset(event, account.id)}>
                              <input
                                aria-label={`New password for ${account.email}`}
                                type="password"
                                minLength={12}
                                maxLength={256}
                                autoComplete="new-password"
                                placeholder="New password (12+ chars)"
                                value={resetPassword}
                                onChange={(event) => setResetPassword(event.target.value)}
                                required
                              />
                              <button className="management-submit" type="submit" disabled={savingId === account.id}>
                                {savingId === account.id ? 'Saving…' : 'Save password'}
                              </button>
                            </form>
                          )}
                          {account.role === 'ngo' && assignmentAccountId === account.id && (
                            <form className="ngo-assignment-editor" onSubmit={(event) => handleAssignmentSave(event, account.id)}>
                              {assignmentStudentIds === null ? (
                                <span role="status">Loading assignments…</span>
                              ) : (
                                <>
                                  <strong>{assignmentStudentIds.length} student record{assignmentStudentIds.length === 1 ? '' : 's'} selected</strong>
                                  <label>
                                    <span>Find a student ID to assign or remove</span>
                                    <input
                                      type="search"
                                      value={assignmentSearch}
                                      onChange={(event) => setAssignmentSearch(event.target.value)}
                                      placeholder="Search student ID"
                                      autoComplete="off"
                                    />
                                  </label>
                                  {assignmentSearch.trim() && (
                                    <div className="ngo-assignment-results">
                                      {students
                                        .filter((student) => student.id.toLowerCase().includes(assignmentSearch.trim().toLowerCase()))
                                        .slice(0, 40)
                                        .map((student) => {
                                          const selected = assignmentStudentIds.includes(student.id);
                                          return (
                                            <label key={student.id}>
                                              <input
                                                type="checkbox"
                                                checked={selected}
                                                onChange={() => setAssignmentStudentIds((current) => (
                                                  current.includes(student.id)
                                                    ? current.filter((studentId) => studentId !== student.id)
                                                    : [...current, student.id]
                                                ))}
                                              />
                                              {student.id}
                                            </label>
                                          );
                                        })}
                                    </div>
                                  )}
                                  <div className="management-actions">
                                    <button
                                      className="management-action"
                                      type="button"
                                      onClick={() => setAssignmentStudentIds([])}
                                      disabled={assignmentStudentIds.length === 0}
                                    >
                                      Clear all
                                    </button>
                                    <button className="management-submit" type="submit" disabled={savingId === account.id}>
                                      {savingId === account.id ? 'Saving…' : 'Save assignments'}
                                    </button>
                                  </div>
                                </>
                              )}
                            </form>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
          <p className="dataset-disclaimer">
            Passwords are stored as salted, one-way hashes. Student links point only to the supplied synthetic dataset.
          </p>
        </>
      )}
    </main>
  );
}
