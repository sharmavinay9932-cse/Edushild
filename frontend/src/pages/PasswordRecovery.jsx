import React, { useState } from 'react';
import { ArrowLeft, ArrowRight, KeyRound, ShieldCheck } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import PrimaryNavigation from '../components/layout/PrimaryNavigation.jsx';
import { confirmPasswordReset, requestPasswordReset } from '../services/authService.js';
import '../styles/data-pages.css';

function requestErrorMessage(error) {
  if (error.response?.data?.detail) return error.response.data.detail;
  if (!error.response) return 'Could not reach the password service. Check that the backend is running.';
  return 'Unable to process the password request.';
}

export default function PasswordRecovery({ reset = false }) {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') || '';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  async function handleRequest(event) {
    event.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      setNotice(await requestPasswordReset(email.trim()));
    } catch (requestError) {
      setError(requestErrorMessage(requestError));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleReset(event) {
    event.preventDefault();
    setError('');
    if (!token) {
      setError('This reset link is missing its security token. Request a new link.');
      return;
    }
    if (password !== confirmation) {
      setError('The passwords do not match.');
      return;
    }

    setSubmitting(true);
    try {
      await confirmPasswordReset({ token, password });
      setPassword('');
      setConfirmation('');
      setNotice('Your password has been changed. You can now sign in with the new password.');
    } catch (requestError) {
      setError(requestErrorMessage(requestError));
    } finally {
      setSubmitting(false);
    }
  }

  const isReset = reset;
  const resetComplete = isReset && Boolean(notice);

  return (
    <main className="data-page login-page">
      <header className="data-page-header" data-scroll-reveal>
        <div>
          <p className="eyebrow">EDUSHIELD <span> / </span> SECURE ACCESS</p>
          <h1>{isReset ? 'Choose a new password' : 'Forgot password'}</h1>
          <p className="data-page-subtitle">
            {isReset
              ? 'Set a new password for your campus account.'
              : 'We will email a secure reset link if an account matches.'}
          </p>
        </div>
        <PrimaryNavigation />
      </header>

      <section className="login-card recovery-card" data-scroll-reveal>
        <div className="login-card-heading">
          <span className="login-shield"><ShieldCheck size={21} aria-hidden="true" /></span>
          <div>
            <h2>{isReset ? 'Reset your password' : 'Recover account access'}</h2>
            <p>
              {isReset
                ? 'Reset links expire after 30 minutes and can only be used once.'
                : 'This works for administrator, teacher, and student accounts.'}
            </p>
          </div>
        </div>

        {isReset && !token ? (
          <div className="login-error" role="alert">
            This reset link is missing its security token. Request a new link.
            {' '}<Link className="login-recovery-link" to="/forgot-password">Request another link</Link>
          </div>
        ) : isReset ? (
          <form className="login-form" onSubmit={handleReset}>
            <label className="login-field">
              <span>New password (12+ characters)</span>
              <span className="login-password-input">
                <KeyRound size={16} aria-hidden="true" />
                <input
                  type="password"
                  autoComplete="new-password"
                  minLength={12}
                  maxLength={256}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                  disabled={resetComplete}
                />
              </span>
            </label>
            <label className="login-field">
              <span>Confirm new password</span>
              <input
                type="password"
                autoComplete="new-password"
                minLength={12}
                maxLength={256}
                value={confirmation}
                onChange={(event) => setConfirmation(event.target.value)}
                required
                disabled={resetComplete}
              />
            </label>
            {error && <div className="login-error" role="alert">{error}</div>}
            {notice && <div className="login-session" role="status">{notice}</div>}
            {!resetComplete && (
              <button className="login-submit" type="submit" disabled={submitting}>
                {submitting ? 'Updating password…' : 'Set new password'}
                {!submitting && <ArrowRight size={16} aria-hidden="true" />}
              </button>
            )}
          </form>
        ) : (
          <form className="login-form" onSubmit={handleRequest}>
            <label className="login-field">
              <span>Campus email</span>
              <input
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
              />
            </label>
            {error && <div className="login-error" role="alert">{error}</div>}
            {notice && <div className="login-session" role="status">{notice}</div>}
            {!notice && (
              <button className="login-submit" type="submit" disabled={submitting}>
                {submitting ? 'Requesting link…' : 'Send reset link'}
                {!submitting && <ArrowRight size={16} aria-hidden="true" />}
              </button>
            )}
          </form>
        )}

        <Link className="login-recovery-link recovery-back-link" to="/login">
          <ArrowLeft size={14} aria-hidden="true" /> Back to sign in
        </Link>
      </section>
    </main>
  );
}
