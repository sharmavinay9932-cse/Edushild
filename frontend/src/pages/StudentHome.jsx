import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import PrimaryNavigation from '../components/layout/PrimaryNavigation.jsx';
import { getMyStudentRecord, getMyTeacherEnteredDetails } from '../services/studentService.js';
import {
  getMySupportRequests,
  submitSupportRequest,
  supportCategories,
  supportRequestStatuses,
} from '../services/supportRequestService.js';
import '../styles/data-pages.css';
import '../styles/support-requests.css';

const currency = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 2,
});

const emptyRequest = { category: 'tuition', amount: '', details: '' };

function formatRequestDate(value) {
  return new Date(value).toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export default function StudentHome() {
  const { user } = useAuth();
  const [record, setRecord] = useState(null);
  const [teacherDetails, setTeacherDetails] = useState(null);
  const [supportRequests, setSupportRequests] = useState([]);
  const [requestForm, setRequestForm] = useState(emptyRequest);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [teacherDetailsLoading, setTeacherDetailsLoading] = useState(true);
  const [requestsLoading, setRequestsLoading] = useState(true);
  const [savingRequest, setSavingRequest] = useState(false);
  const [error, setError] = useState('');
  const [teacherDetailsError, setTeacherDetailsError] = useState('');
  const [requestError, setRequestError] = useState('');
  const [requestNotice, setRequestNotice] = useState('');

  useEffect(() => {
    let active = true;
    getMyStudentRecord()
      .then((result) => {
        if (!active) return;
        setRecord(result.student);
        setMessage(result.message || '');
      })
      .catch((requestError) => {
        if (active) setError(requestError.response?.data?.detail || requestError.message || 'Unable to load your student information.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    getMyTeacherEnteredDetails()
      .then((result) => {
        if (active) setTeacherDetails(result.student);
      })
      .catch((requestError) => {
        if (active) {
          setTeacherDetailsError(
            requestError.response?.data?.detail
              || requestError.message
              || 'Unable to load teacher-entered student details.',
          );
        }
      })
      .finally(() => {
        if (active) setTeacherDetailsLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    const refreshRequests = async () => {
      try {
        const requests = await getMySupportRequests();
        if (!Array.isArray(requests)) {
          throw new Error('The support request service returned an unexpected response.');
        }
        if (active) {
          setSupportRequests(requests);
          setRequestError('');
        }
      } catch (requestError) {
        if (active) {
          setRequestError(
            requestError.response?.data?.detail
              || requestError.message
              || 'Unable to load your support requests.',
          );
        }
      } finally {
        if (active) setRequestsLoading(false);
      }
    };
    refreshRequests();
    const intervalId = window.setInterval(refreshRequests, 15000);
    window.addEventListener('focus', refreshRequests);

    return () => {
      active = false;
      window.clearInterval(intervalId);
      window.removeEventListener('focus', refreshRequests);
    };
  }, []);

  async function handleRequestSubmit(event) {
    event.preventDefault();
    setRequestError('');
    setRequestNotice('');
    setSavingRequest(true);
    try {
      const createdRequest = await submitSupportRequest({
        ...requestForm,
        amount: Number(requestForm.amount).toFixed(2),
      });
      setSupportRequests((current) => [createdRequest, ...current]);
      setRequestForm(emptyRequest);
      setRequestNotice('Your education support request was submitted for administrator review.');
    } catch (requestError) {
      setRequestError(
        requestError.response?.data?.detail
          || requestError.message
          || 'Unable to submit your support request.',
      );
    } finally {
      setSavingRequest(false);
    }
  }

  return (
    <main className="data-page">
      <header className="data-page-header" data-scroll-reveal>
        <div>
          <p className="eyebrow">EDUSHIELD <span> / </span> STUDENT PORTAL</p>
          <h1>My details</h1>
          <p className="data-page-subtitle">Your personal student information.</p>
        </div>
        <PrimaryNavigation />
      </header>
      {loading && <div className="data-state" role="status">Loading your information…</div>}
      {error && <div className="data-state data-state-error" role="alert">Could not load your information: {error}</div>}
      {!loading && !error && record && (
        <section className="data-panel student-detail-panel" data-scroll-reveal>
          <span className={`data-risk data-risk-${String(record.riskLevel).toLowerCase()}`}>{record.riskLevel} dataset category</span>
          <h2>{user.displayName}</h2>
          <p>Linked dataset record {record.id}</p>
          <dl>
            <div><dt>Attendance</dt><dd>{record.attendance}%</dd></div>
            <div><dt>Internal marks</dt><dd>{record.internalMarks}%</dd></div>
            <div><dt>Previous semester GPA</dt><dd>{record.previousGpa}</dd></div>
            <div><dt>Active backlogs</dt><dd>{record.activeBacklogs}</dd></div>
            <div><dt>Financial conditions</dt><dd>{record.financialConditions}</dd></div>
          </dl>
          <p className="student-detail-note">This linked record comes from a synthetic dataset and is not a live academic record or generated prediction.</p>
        </section>
      )}
      {!loading && !error && !record && (
      <section className="data-panel student-detail-panel" data-scroll-reveal>
        <h2>{user.displayName}</h2>
        <p>Signed in as a student</p>
        <p className="student-detail-note">
          {message || 'No student dataset record is linked to this account. Contact your college administrator.'}
        </p>
      </section>
      )}
      {!teacherDetailsLoading && teacherDetailsError && (
        <div className="data-state data-state-error" role="alert">
          Could not load teacher-entered student details: {teacherDetailsError}
        </div>
      )}
      {!teacherDetailsLoading && !teacherDetailsError && teacherDetails && (
        <section className="data-panel student-detail-panel teacher-entered-student-card" data-scroll-reveal>
          <p className="support-request-kicker">Teacher-provided details</p>
          <h2>{teacherDetails.studentName}</h2>
          <p>Academic information entered by {teacherDetails.createdBy || 'your teacher'}.</p>
          <dl>
            <div><dt>Attendance</dt><dd>{teacherDetails.attendance}%</dd></div>
            <div><dt>Internal marks</dt><dd>{teacherDetails.internalMarks}%</dd></div>
            <div><dt>Previous semester GPA</dt><dd>{teacherDetails.previousGpa}</dd></div>
            <div><dt>Active backlogs</dt><dd>{teacherDetails.activeBacklogs}</dd></div>
            <div><dt>Financial conditions</dt><dd>{teacherDetails.financialConditions}</dd></div>
          </dl>
          <p className="student-detail-note">
            These details were entered by your teacher and are shared with administrators. They are separate from synthetic dataset records.
          </p>
        </section>
      )}

      <section className="data-panel support-request-panel" data-scroll-reveal aria-labelledby="support-request-title">
        <div className="support-request-heading">
          <p className="support-request-kicker">Education assistance</p>
          <h2 id="support-request-title">Request support</h2>
          <p>Tell us what education expense you need help with. An administrator will review your request.</p>
        </div>
        <p className="support-request-privacy">
          An administrator reviews each request. When approved, it is sent to active NGOs; the first NGO to accept it is selected and other offers are cancelled.
        </p>
        {requestError && <div className="data-state data-state-error" role="alert">{requestError}</div>}
        {requestNotice && <div className="data-state" role="status">{requestNotice}</div>}
        <form className="support-request-form" onSubmit={handleRequestSubmit}>
          <label>
            <span>Expense category</span>
            <select
              value={requestForm.category}
              onChange={(event) => setRequestForm({ ...requestForm, category: event.target.value })}
              required
            >
              {supportCategories.map((category) => (
                <option key={category.value} value={category.value}>{category.label}</option>
              ))}
            </select>
          </label>
          <label>
            <span>Amount requested (₹)</span>
            <input
              type="number"
              min="0.01"
              max="99999999.99"
              step="0.01"
              value={requestForm.amount}
              onChange={(event) => setRequestForm({ ...requestForm, amount: event.target.value })}
              placeholder="0.00"
              required
            />
          </label>
          <label className="support-request-details">
            <span>What do you need help with?</span>
            <textarea
              value={requestForm.details}
              onChange={(event) => setRequestForm({ ...requestForm, details: event.target.value })}
              maxLength={4000}
              rows={4}
              placeholder="Briefly explain the education expense and when it is needed."
              required
            />
          </label>
          <button className="management-submit" type="submit" disabled={savingRequest}>
            {savingRequest ? 'Submitting request…' : 'Submit support request'}
          </button>
        </form>

        <div className="support-request-history">
          <h3>Your requests</h3>
          {requestsLoading ? (
            <p className="data-empty" role="status">Loading your requests…</p>
          ) : supportRequests.length === 0 ? (
            <p className="data-empty">You have not submitted a support request.</p>
          ) : (
            <ul>
              {supportRequests.map((request) => {
                const requestStatus = supportRequestStatuses.find((item) => item.value === request.status);
                const category = supportCategories.find((item) => item.value === request.category);
                return (
                  <li key={request.id}>
                    <div>
                      <strong>{category?.label || request.category}</strong>
                      <span>{formatRequestDate(request.submittedAt)}</span>
                    </div>
                    <p>{request.details}</p>
                    <div className="support-request-meta">
                      <strong>{currency.format(Number(request.amount))}</strong>
                      <span className={`support-request-status support-request-status-${request.status}`}>
                        {requestStatus?.label || request.status}
                      </span>
                    </div>
                    {request.status === 'approved' && (
                      <div className="support-student-outcome" role="status" aria-live="polite">
                        Your request has been approved and shared with NGOs. We’ll notify you here when an NGO accepts it.
                      </div>
                    )}
                    {request.status === 'accepted' && (
                      <section className="support-student-ngo" aria-label="NGO accepting your request">
                        <span>Accepted by</span>
                        <strong>{request.acceptedBy || 'An NGO partner'}</strong>
                        <p>Your request has been accepted. The other NGO offers have been cancelled.</p>
                      </section>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </section>
    </main>
  );
}
