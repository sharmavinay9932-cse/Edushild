import React, { useEffect, useState } from 'react';
import PrimaryNavigation from '../components/layout/PrimaryNavigation.jsx';
import {
  getAdminSupportRequests,
  supportCategories,
  adminSupportRequestStatuses,
  updateSupportRequestStatus,
} from '../services/supportRequestService.js';
import '../styles/data-pages.css';
import '../styles/support-requests.css';

const currency = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 2,
});

function formatRequestDate(value) {
  return new Date(value).toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function responseMessage(error, fallback) {
  return error.response?.data?.detail || error.message || fallback;
}

export default function SupportRequests() {
  const [requests, setRequests] = useState([]);
  const [draftStatuses, setDraftStatuses] = useState({});
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    let active = true;
    getAdminSupportRequests()
      .then((data) => {
        if (!Array.isArray(data)) {
          throw new Error('The support request service returned an unexpected response.');
        }
        if (active) {
          setRequests(data);
          setDraftStatuses(Object.fromEntries(data.map((request) => [request.id, request.status])));
        }
      })
      .catch((requestError) => {
        if (active) setError(responseMessage(requestError, 'Unable to load support requests.'));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  async function handleStatusSave(request) {
    const nextStatus = draftStatuses[request.id];
    if (nextStatus === request.status) return;
    setError('');
    setNotice('');
    setSavingId(request.id);
    try {
      const updated = await updateSupportRequestStatus(request.id, nextStatus);
      setRequests((current) => current.map((item) => item.id === updated.id ? updated : item));
      setDraftStatuses((current) => ({ ...current, [updated.id]: updated.status }));
      setNotice(`Request from ${updated.studentName} updated.`);
    } catch (requestError) {
      setError(responseMessage(requestError, 'Unable to update the support request.'));
    } finally {
      setSavingId(null);
    }
  }

  return (
    <main className="data-page">
      <header className="data-page-header" data-scroll-reveal>
        <div>
          <p className="eyebrow">EDUSHIELD <span> / </span> ADMINISTRATION</p>
          <h1>Support requests</h1>
          <p className="data-page-subtitle">Review student education-cost requests and keep their status up to date.</p>
        </div>
        <PrimaryNavigation />
      </header>

      {loading && <div className="data-state" role="status">Loading support requests…</div>}
      {error && <div className="data-state data-state-error" role="alert">{error}</div>}
      {notice && <div className="data-state" role="status">{notice}</div>}

      {!loading && !error && (
        <section className="data-panel support-admin-panel" data-scroll-reveal>
          <div className="support-request-heading">
            <p className="support-request-kicker">Administrator review</p>
            <h2>{requests.length} request{requests.length === 1 ? '' : 's'}</h2>
            <p>Approve a request to send it to all active NGOs. The first NGO to accept receives the request.</p>
          </div>
          {requests.length === 0 ? (
            <p className="data-empty">No student support requests have been submitted.</p>
          ) : (
            <div className="support-admin-list">
              {requests.map((request) => {
                const category = supportCategories.find((item) => item.value === request.category);
                return (
                  <article className="support-admin-request" key={request.id}>
                    <div className="support-admin-request-header">
                      <div>
                        <p className="support-request-kicker">{category?.label || request.category}</p>
                        <h3>{request.studentName}</h3>
                        <p>{request.studentEmail}{request.studentId ? ` · ${request.studentId}` : ''}</p>
                      </div>
                      <strong>{currency.format(Number(request.amount))}</strong>
                    </div>
                    <p className="support-admin-details">{request.details}</p>
                    <div className="support-admin-controls">
                      <span>Submitted {formatRequestDate(request.submittedAt)}</span>
                      <label>
                        <span className="sr-only">Request status</span>
                        <select
                          value={draftStatuses[request.id] || request.status}
                          onChange={(event) => setDraftStatuses((current) => ({
                            ...current,
                            [request.id]: event.target.value,
                          }))}
                        >
                          {adminSupportRequestStatuses.map((status) => (
                            <option key={status.value} value={status.value}>{status.label}</option>
                          ))}
                          {!adminSupportRequestStatuses.some((status) => status.value === request.status) && (
                            <option value={request.status}>{request.status}</option>
                          )}
                        </select>
                      </label>
                      <button
                        className="management-submit"
                        type="button"
                        onClick={() => handleStatusSave(request)}
                        disabled={
                          savingId === request.id
                          || draftStatuses[request.id] === request.status
                          || ['accepted', 'declined', 'completed'].includes(request.status)
                        }
                      >
                        {savingId === request.id
                          ? 'Saving…'
                          : draftStatuses[request.id] === 'approved'
                            ? 'Approve and send'
                            : 'Save status'}
                      </button>
                    </div>
                    {request.status === 'approved' && (
                      <p className="support-admin-delivery-status">
                        Sent to {request.availableNGOCount} active NGO{request.availableNGOCount === 1 ? '' : 's'}; waiting for acceptance.
                      </p>
                    )}
                    {request.status === 'accepted' && (
                      <p className="support-admin-delivery-status is-accepted">
                        Accepted by {request.acceptedBy || 'an NGO'}. Other NGO offers were cancelled.
                      </p>
                    )}
                  </article>
                );
              })}
            </div>
          )}
        </section>
      )}
    </main>
  );
}
