import React, { useEffect, useState } from 'react';
import {
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  IndianRupee,
  ReceiptText,
  ShieldCheck,
  Trash2,
  Users,
} from 'lucide-react';
import PrimaryNavigation from '../components/layout/PrimaryNavigation.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { getStudents } from '../services/studentService.js';
import {
  createNGOExpense,
  deleteNGOExpense,
  getNGOExpenses,
} from '../services/ngoExpenseService.js';
import {
  acceptNGOSupportRequest,
  getNGOSupportOffers,
  supportCategories,
} from '../services/supportRequestService.js';
import classroomSupport from '../assets/images/ct-classroom-support.png';
import classroomEngagement from '../assets/images/ct-classroom-engagement.png';
import '../styles/data-pages.css';
import '../styles/ngo-dashboard.css';

const expenseCategories = [
  { value: 'tuition', label: 'Tuition and fees' },
  { value: 'books', label: 'Books and learning materials' },
  { value: 'transport', label: 'Transport' },
  { value: 'school_supplies', label: 'School supplies' },
  { value: 'exam_fees', label: 'Examination fees' },
  { value: 'accommodation', label: 'Accommodation' },
  { value: 'meals', label: 'Meals' },
  { value: 'other', label: 'Other education expense' },
];

const today = new Date();
const localToday = [
  today.getFullYear(),
  String(today.getMonth() + 1).padStart(2, '0'),
  String(today.getDate()).padStart(2, '0'),
].join('-');

const emptyExpense = {
  studentId: '',
  category: 'tuition',
  description: '',
  amount: '',
  expenseDate: localToday,
};

const currency = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 2,
});

function formatCurrency(value) {
  return currency.format(Number(value) || 0);
}

function formatExpenseDate(value) {
  return new Date(`${value}T00:00:00`).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function getOrganizationName(displayName) {
  return (displayName || 'NGO partner').replace(/\s+\(Demo - Unverified\)$/i, '');
}

function getOrganizationInitials(displayName) {
  return getOrganizationName(displayName)
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0])
    .join('')
    .toUpperCase();
}

export default function NGODashboard() {
  const { user } = useAuth();
  const [students, setStudents] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [supportOffers, setSupportOffers] = useState([]);
  const [totals, setTotals] = useState({ expenseCount: 0, totalAmount: '0', monthAmount: '0' });
  const [form, setForm] = useState(emptyExpense);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingExpenseId, setSavingExpenseId] = useState(null);
  const [acceptingRequestId, setAcceptingRequestId] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const organizationName = getOrganizationName(user?.displayName);

  useEffect(() => {
    let active = true;
    Promise.all([getStudents(), getNGOExpenses(), getNGOSupportOffers()])
      .then(([studentData, expenseData, offerData]) => {
        if (!Array.isArray(studentData) || !Array.isArray(expenseData.expenses) || !Array.isArray(offerData)) {
          throw new Error('The dashboard service returned an unexpected response.');
        }
        if (active) {
          setStudents(studentData);
          setExpenses(expenseData.expenses);
          setSupportOffers(offerData);
          setTotals({
            expenseCount: expenseData.expenseCount,
            totalAmount: expenseData.totalAmount,
            monthAmount: expenseData.monthAmount,
          });
        }
      })
      .catch((requestError) => {
        if (active) {
          setError(
            requestError.response?.data?.detail
              || requestError.message
              || 'Unable to load education expense data.',
          );
        }
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
    const refreshOffers = async () => {
      try {
        const offers = await getNGOSupportOffers();
        if (!Array.isArray(offers)) {
          throw new Error('The support request service returned an unexpected response.');
        }
        if (active) setSupportOffers(offers);
      } catch (requestError) {
        if (active) {
          setError(
            requestError.response?.data?.detail
              || requestError.message
              || 'Unable to refresh support requests.',
          );
        }
      }
    };
    const intervalId = window.setInterval(refreshOffers, 15000);
    window.addEventListener('focus', refreshOffers);

    return () => {
      active = false;
      window.clearInterval(intervalId);
      window.removeEventListener('focus', refreshOffers);
    };
  }, []);

  async function handleSupportRequestAccept(request) {
    setError('');
    setNotice('');
    setAcceptingRequestId(request.id);
    try {
      const accepted = await acceptNGOSupportRequest(request.id);
      setSupportOffers((current) => current.map((item) => item.id === accepted.id
        ? { ...item, ...accepted, offerStatus: 'accepted' }
        : item));
      setNotice(`You accepted ${request.studentName}'s support request. Other NGO offers were cancelled.`);
    } catch (requestError) {
      setError(
        requestError.response?.data?.detail
          || requestError.message
          || 'Unable to accept this support request.',
      );
    } finally {
      setAcceptingRequestId(null);
    }
  }

  async function handleExpenseSubmit(event) {
    event.preventDefault();
    setError('');
    setNotice('');
    setSaving(true);
    try {
      const createdExpense = await createNGOExpense({
        ...form,
        amount: Number(form.amount).toFixed(2),
        studentId: form.studentId || null,
      });
      setExpenses((current) => [createdExpense, ...current]);
      setTotals((current) => ({
        expenseCount: current.expenseCount + 1,
        totalAmount: (Number(current.totalAmount) + Number(createdExpense.amount)).toFixed(2),
        monthAmount: new Date(`${createdExpense.expenseDate}T00:00:00`).getMonth() === new Date().getMonth()
          && new Date(`${createdExpense.expenseDate}T00:00:00`).getFullYear() === new Date().getFullYear()
          ? (Number(current.monthAmount) + Number(createdExpense.amount)).toFixed(2)
          : current.monthAmount,
      }));
      setForm({ ...emptyExpense, expenseDate: localToday });
      setNotice('Education expense recorded.');
    } catch (requestError) {
      setError(
        requestError.response?.data?.detail
          || requestError.message
          || 'Unable to record this education expense.',
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleExpenseDelete(expense) {
    if (!window.confirm(`Remove the ${formatCurrency(expense.amount)} ${expense.description} expense?`)) {
      return;
    }
    setError('');
    setNotice('');
    setSavingExpenseId(expense.id);
    try {
      await deleteNGOExpense(expense.id);
      setExpenses((current) => current.filter((item) => item.id !== expense.id));
      setTotals((current) => ({
        expenseCount: Math.max(0, current.expenseCount - 1),
        totalAmount: (Number(current.totalAmount) - Number(expense.amount)).toFixed(2),
        monthAmount: new Date(`${expense.expenseDate}T00:00:00`).getMonth() === new Date().getMonth()
          && new Date(`${expense.expenseDate}T00:00:00`).getFullYear() === new Date().getFullYear()
          ? (Number(current.monthAmount) - Number(expense.amount)).toFixed(2)
          : current.monthAmount,
      }));
      setNotice('Education expense removed.');
    } catch (requestError) {
      setError(
        requestError.response?.data?.detail
          || requestError.message
          || 'Unable to remove this education expense.',
      );
    } finally {
      setSavingExpenseId(null);
    }
  }

  return (
    <main className="data-page ngo-dashboard">
      <header className="data-page-header ngo-dashboard-header" data-scroll-reveal>
        <div>
          <p className="eyebrow">EDUSHIELD <span> / </span> NGO PORTAL</p>
          <h1>Organization dashboard</h1>
          <p className="data-page-subtitle">
            Review assigned students and open their AI-suggested support plans.
          </p>
        </div>
        <PrimaryNavigation />
      </header>

      <section className="ngo-story-hero" data-scroll-reveal aria-labelledby="ngo-story-title">
        <div className="ngo-story-copy">
          <span className="ngo-demo-status"><ShieldCheck size={14} aria-hidden="true" /> Demo account · unverified</span>
          <p className="ngo-section-kicker">NGO PARTNER DESK</p>
          <h2 id="ngo-story-title">Education support, with every next step in view.</h2>
          <p className="ngo-story-intro">
            A clear place to review student requests, record education expenses, and keep your organization’s work organized.
          </p>
          <div className="ngo-story-organization">
            <span className="ngo-organization-monogram" aria-hidden="true">
              {getOrganizationInitials(user?.displayName)}
            </span>
            <span>
              <strong>{organizationName}</strong>
              <small>Demo profile · partnership not confirmed</small>
            </span>
          </div>
          <div className="ngo-story-links">
            <a href="#ngo-support-offers">Review support requests <ArrowRight size={14} aria-hidden="true" /></a>
            <a href="#ngo-expense-entry">Record an expense <ArrowRight size={14} aria-hidden="true" /></a>
          </div>
        </div>
        <div className="ngo-story-photos" aria-label="Illustrative campus photography">
          <img
            className="ngo-story-photo-main"
            src={classroomSupport}
            alt="Illustrative photo of an instructor supporting students in a classroom"
          />
          <img
            className="ngo-story-photo-secondary"
            src={classroomEngagement}
            alt="Illustrative photo of students taking part in a classroom lesson"
          />
          <span className="ngo-photo-caption">Campus photography · illustrative, not NGO imagery</span>
        </div>
      </section>

      <section className="ngo-metrics-grid" aria-label="Education expenses overview" data-scroll-reveal>
        <article className="ngo-metric-card">
          <span className="ngo-metric-icon"><IndianRupee size={19} aria-hidden="true" /></span>
          <span className="ngo-metric-label">Total education expenses</span>
          <strong>{loading ? '—' : formatCurrency(totals.totalAmount)}</strong>
          <small>All expenses recorded by your organization</small>
        </article>
        <article className="ngo-metric-card">
          <span className="ngo-metric-icon"><CalendarDays size={19} aria-hidden="true" /></span>
          <span className="ngo-metric-label">This month</span>
          <strong>{loading ? '—' : formatCurrency(totals.monthAmount)}</strong>
          <small>Expenses dated this calendar month</small>
        </article>
        <article className="ngo-metric-card">
          <span className="ngo-metric-icon"><ReceiptText size={19} aria-hidden="true" /></span>
          <span className="ngo-metric-label">Expense entries</span>
          <strong>{loading ? '—' : totals.expenseCount}</strong>
          <small>Education expenses recorded</small>
        </article>
        <article className="ngo-metric-card">
          <span className="ngo-metric-icon"><Users size={19} aria-hidden="true" /></span>
          <span className="ngo-metric-label">Assigned students</span>
          <strong>{loading ? '—' : students.length}</strong>
          <small>Students available for expense linking</small>
        </article>
      </section>

      {loading && <div className="data-state" role="status">Loading education expense data…</div>}
      {error && <div className="data-state data-state-error" role="alert">{error}</div>}
      {notice && <div className="data-state" role="status">{notice}</div>}

      {!loading && !error && (
        <>
          <section className="data-panel ngo-support-offers-panel" id="ngo-support-offers" data-scroll-reveal>
            <div className="ngo-panel-heading">
              <div>
                <p className="ngo-section-kicker">Student assistance</p>
                <h2>Support requests</h2>
                <p>Requests approved by administrators are shared with active NGOs. The first acceptance wins.</p>
              </div>
            </div>
            {supportOffers.length === 0 ? (
              <div className="ngo-empty-state">
                <span className="ngo-empty-icon"><Users size={22} aria-hidden="true" /></span>
                <h3>No support requests yet</h3>
                <p>Administrator-approved student requests will appear here.</p>
              </div>
            ) : (
              <div className="ngo-support-offers-list">
                {supportOffers.map((request) => {
                  const accepted = request.offerStatus === 'accepted';
                  const available = request.offerStatus === 'offered' && request.status === 'approved';
                  return (
                    <article className="ngo-support-offer" key={request.id}>
                      <div className="ngo-support-offer-header">
                        <div>
                          <p className="ngo-section-kicker">
                            {supportCategories.find((item) => item.value === request.category)?.label || request.category}
                          </p>
                          <h3>{request.studentName}</h3>
                          <p>{request.studentEmail}{request.studentId ? ` · ${request.studentId}` : ''}</p>
                        </div>
                        <strong>{formatCurrency(request.amount)}</strong>
                      </div>
                      <p className="ngo-support-offer-details">{request.details}</p>
                      <div className="ngo-support-offer-actions">
                        <span className={`ngo-support-offer-status ngo-support-offer-status-${request.offerStatus}`}>
                          {accepted ? 'Accepted by your organization' : available ? 'Awaiting your response' : 'Cancelled — another NGO was selected'}
                        </span>
                        {available && (
                          <button
                            className="management-submit"
                            type="button"
                            onClick={() => handleSupportRequestAccept(request)}
                            disabled={acceptingRequestId === request.id}
                          >
                            {acceptingRequestId === request.id ? 'Accepting…' : 'Accept request'}
                          </button>
                        )}
                        {accepted && <CheckCircle2 size={20} aria-label="Accepted" />}
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </section>

          <section className="data-panel ngo-expense-form-panel" id="ngo-expense-entry" data-scroll-reveal>
            <div className="ngo-panel-heading">
              <div>
                <p className="ngo-section-kicker">Education support</p>
                <h2>Record an expense</h2>
                <p>Log education costs paid by your organization.</p>
              </div>
            </div>
            <form className="ngo-expense-form" onSubmit={handleExpenseSubmit}>
              <label>
                <span>Expense category</span>
                <select
                  value={form.category}
                  onChange={(event) => setForm({ ...form, category: event.target.value })}
                  required
                >
                  {expenseCategories.map((category) => (
                    <option key={category.value} value={category.value}>{category.label}</option>
                  ))}
                </select>
              </label>
              <label>
                <span>Description</span>
                <input
                  value={form.description}
                  onChange={(event) => setForm({ ...form, description: event.target.value })}
                  maxLength={255}
                  placeholder="What was this expense for?"
                  required
                />
              </label>
              <label>
                <span>Amount (₹)</span>
                <input
                  type="number"
                  min="0.01"
                  max="99999999.99"
                  step="0.01"
                  value={form.amount}
                  onChange={(event) => setForm({ ...form, amount: event.target.value })}
                  placeholder="0.00"
                  required
                />
              </label>
              <label>
                <span>Expense date</span>
                <input
                  type="date"
                  max={localToday}
                  value={form.expenseDate}
                  onChange={(event) => setForm({ ...form, expenseDate: event.target.value })}
                  required
                />
              </label>
              <label>
                <span>Student (optional)</span>
                <select
                  value={form.studentId}
                  onChange={(event) => setForm({ ...form, studentId: event.target.value })}
                >
                  <option value="">Organization-wide expense</option>
                  {students.map((student) => (
                    <option key={student.id} value={student.id}>{student.id}</option>
                  ))}
                </select>
              </label>
              <button className="management-submit" type="submit" disabled={saving}>
                {saving ? 'Saving expense…' : 'Save expense'}
              </button>
            </form>
          </section>

          <section className="data-panel ngo-students-panel" id="ngo-expense-history" data-scroll-reveal>
            <div className="ngo-panel-heading">
              <div>
                <p className="ngo-section-kicker">Your organization</p>
                <h2>Education expense history</h2>
                <p>Expenses are visible only to the NGO account that recorded them.</p>
              </div>
            </div>
            {expenses.length === 0 ? (
              <div className="ngo-empty-state">
                <span className="ngo-empty-icon"><ReceiptText size={22} aria-hidden="true" /></span>
                <h3>No expenses recorded yet</h3>
                <p>Your education expenses will appear here after you add them.</p>
              </div>
            ) : (
              <div className="data-table-scroll">
                <table className="data-table ngo-students-table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Category</th>
                      <th>Description</th>
                      <th>Student</th>
                      <th>Amount</th>
                      <th><span className="sr-only">Action</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    {expenses.map((expense) => (
                      <tr key={expense.id}>
                        <td>{formatExpenseDate(expense.expenseDate)}</td>
                        <td>{expenseCategories.find((item) => item.value === expense.category)?.label || expense.category}</td>
                        <td><strong>{expense.description}</strong></td>
                        <td>{expense.studentId || 'Organization-wide'}</td>
                        <td><strong>{formatCurrency(expense.amount)}</strong></td>
                        <td>
                          <button
                            className="ngo-expense-delete"
                            type="button"
                            onClick={() => handleExpenseDelete(expense)}
                            disabled={savingExpenseId === expense.id}
                            aria-label={`Remove expense ${expense.description}`}
                          >
                            <Trash2 size={15} aria-hidden="true" />
                            {savingExpenseId === expense.id ? 'Removing…' : 'Remove'}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </main>
  );
}
