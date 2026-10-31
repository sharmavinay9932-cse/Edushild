import React, { useEffect, useState } from 'react';
import PrimaryNavigation from '../components/layout/PrimaryNavigation.jsx';
import { getStudents } from '../services/studentService.js';
import {
  createIntervention,
  deleteIntervention,
  getInterventions,
  updateIntervention,
} from '../services/interventionService.js';
import '../styles/data-pages.css';

const initialForm = { studentId: '', title: '', notes: '', dueDate: '' };
const statusLabels = {
  planned: 'Planned',
  in_progress: 'In progress',
  completed: 'Completed',
};

export default function Interventions() {
  const [students, setStudents] = useState([]);
  const [interventions, setInterventions] = useState([]);
  const [form, setForm] = useState(initialForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingId, setSavingId] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    let active = true;
    Promise.all([getInterventions(), getStudents()])
      .then(([interventionData, studentData]) => {
        if (!Array.isArray(interventionData) || !Array.isArray(studentData)) {
          throw new Error('The backend returned an unexpected response.');
        }
        if (!active) return;
        setInterventions(interventionData);
        setStudents(studentData);
        setForm((current) => ({ ...current, studentId: studentData[0]?.id || '' }));
      })
      .catch((requestError) => {
        if (active) setError(requestError.response?.data?.detail || requestError.message || 'Unable to load interventions.');
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
      const created = await createIntervention({
        ...form,
        dueDate: form.dueDate || null,
      });
      setInterventions((current) => [created, ...current]);
      setForm({ ...initialForm, studentId: students[0]?.id || '' });
      setNotice('Intervention saved.');
    } catch (requestError) {
      setError(requestError.response?.data?.detail || requestError.message || 'Unable to save intervention.');
    } finally {
      setSaving(false);
    }
  }

  async function handleStatusChange(intervention, nextStatus) {
    setError('');
    setNotice('');
    setSavingId(intervention.id);
    try {
      const updated = await updateIntervention(intervention.id, { status: nextStatus });
      setInterventions((current) => current.map((item) => item.id === updated.id ? updated : item));
    } catch (requestError) {
      setError(requestError.response?.data?.detail || requestError.message || 'Unable to update intervention.');
    } finally {
      setSavingId(null);
    }
  }

  async function handleDelete(interventionId) {
    setError('');
    setNotice('');
    setSavingId(interventionId);
    try {
      await deleteIntervention(interventionId);
      setInterventions((current) => current.filter((item) => item.id !== interventionId));
      setNotice('Intervention deleted.');
    } catch (requestError) {
      setError(requestError.response?.data?.detail || requestError.message || 'Unable to delete intervention.');
    } finally {
      setSavingId(null);
    }
  }

  return (
    <main className="data-page">
      <header className="data-page-header" data-scroll-reveal>
        <div>
          <p className="eyebrow">EDUSHIELD <span> / </span> STUDENT SUPPORT</p>
          <h1>Interventions</h1>
          <p className="data-page-subtitle">Record and track staff-led student support actions.</p>
        </div>
        <PrimaryNavigation />
      </header>

      {loading && <div className="data-state" role="status">Loading interventions…</div>}
      {error && <div className="data-state data-state-error" role="alert">{error}</div>}
      {notice && <div className="data-state" role="status">{notice}</div>}

      {!loading && (
        <>
          <section className="data-panel intervention-create-panel" data-scroll-reveal>
            <h2>Record an intervention</h2>
            {students.length === 0 ? (
              <p className="data-empty">No student records are available to associate with an intervention.</p>
            ) : (
              <form className="management-form" onSubmit={handleSubmit}>
                <label>
                  <span>Student dataset ID</span>
                  <select
                    value={form.studentId}
                    onChange={(event) => setForm({ ...form, studentId: event.target.value })}
                    required
                  >
                    {students.map((student) => (
                      <option key={student.id} value={student.id}>{student.id}</option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>Action</span>
                  <input
                    value={form.title}
                    onChange={(event) => setForm({ ...form, title: event.target.value })}
                    maxLength={160}
                    required
                  />
                </label>
                <label>
                  <span>Due date (optional)</span>
                  <input
                    type="date"
                    value={form.dueDate}
                    onChange={(event) => setForm({ ...form, dueDate: event.target.value })}
                  />
                </label>
                <label className="management-form-wide">
                  <span>Notes</span>
                  <textarea
                    value={form.notes}
                    onChange={(event) => setForm({ ...form, notes: event.target.value })}
                    maxLength={4000}
                    rows={3}
                  />
                </label>
                <button className="management-submit" type="submit" disabled={saving}>
                  {saving ? 'Saving…' : 'Save intervention'}
                </button>
              </form>
            )}
          </section>

          <section className="data-panel intervention-list-panel" data-scroll-reveal>
            <h2>Intervention history</h2>
            {interventions.length === 0 ? (
              <p className="data-empty">No intervention records have been added.</p>
            ) : (
              <div className="data-table-scroll">
                <table className="data-table">
                  <thead>
                    <tr><th>Student ID</th><th>Action and notes</th><th>Due date</th><th>Status</th><th /></tr>
                  </thead>
                  <tbody>
                    {interventions.map((intervention) => (
                      <tr key={intervention.id}>
                        <td><strong>{intervention.studentId}</strong></td>
                        <td>
                          <strong>{intervention.title}</strong>
                          {intervention.notes && <small>{intervention.notes}</small>}
                        </td>
                        <td>{intervention.dueDate || '—'}</td>
                        <td>
                          <select
                            aria-label={`Status for ${intervention.title}`}
                            value={intervention.status}
                            disabled={savingId === intervention.id}
                            onChange={(event) => handleStatusChange(intervention, event.target.value)}
                          >
                            {Object.entries(statusLabels).map(([value, label]) => (
                              <option key={value} value={value}>{label}</option>
                            ))}
                          </select>
                        </td>
                        <td>
                          <button
                            className="management-delete"
                            type="button"
                            disabled={savingId === intervention.id}
                            onClick={() => handleDelete(intervention.id)}
                          >
                            Delete
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
          <p className="dataset-disclaimer">
            These interventions are saved in the local backend database. Student IDs refer to synthetic dataset records, not real student identities.
          </p>
        </>
      )}
    </main>
  );
}
