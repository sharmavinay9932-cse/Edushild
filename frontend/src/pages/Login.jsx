import React, { useEffect, useState } from 'react';
import { ArrowRight, KeyRound, MapPin, ShieldCheck, UserRound } from 'lucide-react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import PrimaryNavigation from '../components/layout/PrimaryNavigation.jsx';
import { createUser } from '../services/userService.js';
import classroomSupport from '../assets/images/ct-classroom-support.png';
import classroomEngagement from '../assets/images/ct-classroom-engagement.png';
import '../styles/data-pages.css';

const ngoDemoAccounts = [
  {
    name: 'Ethos Children Welfare Foundation',
    location: 'Punjab, India',
    focus: 'Student living costs · food · transport · education',
    email: 'ethos.demo@example.org',
  },
  {
    name: 'Sikh Human Development Foundation',
    location: 'Punjab and nearby states',
    focus: 'Higher-education scholarships · financial assistance',
    email: 'shdf.demo@example.org',
  },
  {
    name: 'Guru Harkrishan Educational Society',
    location: 'Punjab, India',
    focus: 'Merit-cum-means scholarships · education support',
    email: 'ghes.demo@example.org',
  },
  {
    name: 'Navjeevan Charitable Society',
    location: 'Jalandhar, Punjab',
    focus: 'Scholarships · vocational training · welfare',
    email: 'navjeevan.demo@example.org',
  },
  {
    name: "ISHTI People's Backbone Foundation",
    location: 'Jalandhar, Punjab',
    focus: 'Student scholarships · social welfare · housing',
    email: 'ishti.demo@example.org',
  },
  {
    name: 'Manav Sehyog Society',
    location: 'Jalandhar, Punjab',
    focus: 'Historical merit-cum-means scholarship lead',
    email: 'manavsehyog.demo@example.org',
  },
  {
    name: 'Bowry Memorial Educational and Medical Trust',
    location: 'Jalandhar, Punjab',
    focus: 'Scholarships · freeships · fee concessions',
    email: 'bowrytrust.demo@example.org',
  },
  {
    name: 'Denthinkers Foundation',
    location: 'Jalandhar, Punjab',
    focus: 'Educational supplies · reported fee support',
    email: 'denthinkers.demo@example.org',
  },
  {
    name: 'Pratham Education Foundation',
    location: 'India · programs vary by region',
    focus: 'Education programs · learning · youth development',
    email: 'pratham.demo@example.org',
  },
  {
    name: 'Smile Foundation',
    location: 'India',
    focus: 'Education · healthcare · livelihood programs',
    email: 'smile.demo@example.org',
  },
];

const demoNgoPhotos = [
  {
    src: classroomSupport,
    alt: 'Illustrative classroom scene with students and an instructor',
  },
  {
    src: classroomEngagement,
    alt: 'Illustrative classroom scene with students taking part in a lesson',
  },
];

const emptyAccountForm = {
  displayName: '',
  email: '',
  password: '',
  role: 'teacher',
};

const roles = [
  { id: 'admin', label: 'Admin', description: 'Manage campus insights and access' },
  { id: 'teacher', label: 'Teacher', description: 'Review academic and attendance data' },
  { id: 'student', label: 'Student', description: 'View your own student information' },
  { id: 'ngo', label: 'NGO', description: 'Review requests and track education support' },
];

const roleEmailFields = {
  admin: { label: 'Admin email', placeholder: 'admin@college.edu' },
  teacher: { label: 'Teacher email', placeholder: 'teacher@gmail.com' },
  student: { label: 'Student email', placeholder: 'student@gmail.com' },
  ngo: { label: 'NGO email', placeholder: 'contact@ngo.org' },
};

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const { login, user } = useAuth();
  const [role, setRole] = useState('admin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [accountForm, setAccountForm] = useState(emptyAccountForm);
  const [creatingAccount, setCreatingAccount] = useState(false);
  const [accountError, setAccountError] = useState('');
  const [accountNotice, setAccountNotice] = useState('');
  const [newUserNotice, setNewUserNotice] = useState('');
  const [newUserIntent, setNewUserIntent] = useState(false);
  const emailField = roleEmailFields[role];

  useEffect(() => {
    if (user?.role === 'admin' && location.hash === '#new-user') {
      document.getElementById('new-user')?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [location.hash, user]);

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');
    setSubmitting(true);

    try {
      const authenticatedUser = await login({ email: email.trim(), password, role });
      if (newUserIntent && authenticatedUser.role === 'admin') {
        setNewUserNotice('');
        navigate('/login#new-user', { replace: true });
        return;
      }
      const defaultDestination = authenticatedUser.role === 'student'
        ? '/student'
        : authenticatedUser.role === 'ngo'
          ? '/ngo-dashboard'
          : '/';
      const requestedPath = location.state?.from?.pathname;
      navigate(authenticatedUser.role === 'admin' ? requestedPath || defaultDestination : defaultDestination, { replace: true });
    } catch (loginError) {
      const status = loginError.response?.status;
      if (status === 404) {
        setError('The authentication endpoint was not found. Start the backend or configure its API URL.');
      } else if (status === 401 || status === 403) {
        setError(loginError.response?.data?.detail || 'The credentials or selected account type were not accepted.');
      } else if (!loginError.response) {
        setError('Could not reach the authentication service. Check that the backend is running.');
      } else {
        setError(loginError.response.data?.detail || 'Unable to sign in.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  function handleNewUserOption() {
    setError('');
    if (user?.role === 'admin') {
      document.getElementById('new-user')?.scrollIntoView({ behavior: 'smooth' });
      return;
    }
    setRole('admin');
    setNewUserIntent(true);
    setNewUserNotice('Only an administrator can create accounts. Sign in with an admin account to continue.');
  }

  function chooseDemoNgo(emailAddress) {
    setEmail(emailAddress);
    setError('');
    document.getElementById('login-password')?.focus();
  }

  async function handleCreateAccount(event) {
    event.preventDefault();
    setAccountError('');
    setAccountNotice('');
    setCreatingAccount(true);

    try {
      await createUser({ ...accountForm, studentId: null });
      setAccountForm(emptyAccountForm);
      setAccountNotice(accountForm.role === 'ngo'
        ? 'NGO account created. Assign student records under Accounts before the NGO can view them.'
        : 'Account created. The new user can now sign in.');
    } catch (requestError) {
      setAccountError(
        requestError.response?.data?.detail
          || (requestError.response
            ? 'Unable to create the account.'
            : 'Could not reach the account service. Check that the backend is running.'),
      );
    } finally {
      setCreatingAccount(false);
    }
  }

  return (
    <main className="data-page login-page">
      <header className="data-page-header" data-scroll-reveal>
        <div>
          <p className="eyebrow">EDUSHIELD <span> / </span> SECURE ACCESS</p>
          <h1>Sign in</h1>
          <p className="data-page-subtitle">Choose your account type to continue.</p>
        </div>
        <PrimaryNavigation />
      </header>

      <section className="login-card" data-scroll-reveal>
        <div className="login-card-heading">
          <span className="login-shield"><ShieldCheck size={21} aria-hidden="true" /></span>
          <div>
            <h2>Welcome back</h2>
            <p>{role === 'ngo' ? 'Sign in with your organization account.' : 'Sign in with your campus account.'}</p>
          </div>
        </div>

        {user && (
          <div className="login-session" role="status">
            Signed in as {user.displayName} ({user.role}).
          </div>
        )}

        <form className="login-form" onSubmit={handleSubmit}>
          <fieldset className="login-role-fieldset">
            <legend>Account type</legend>
            <div className="login-role-options">
              {roles.map((item) => (
                <label className={`login-role-option${role === item.id ? ' is-selected' : ''}`} key={item.id}>
                  <input
                    type="radio"
                    name="role"
                    value={item.id}
                    checked={role === item.id}
                    onChange={() => setRole(item.id)}
                  />
                  <span className="login-role-icon"><UserRound size={17} aria-hidden="true" /></span>
                  <span className="login-role-copy"><strong>{item.label}</strong><small>{item.description}</small></span>
                </label>
              ))}
            </div>
          </fieldset>

          <label className="login-field">
            <span>{emailField.label}</span>
            <input
              id="login-email"
              type="email"
              name="email"
              autoComplete="username"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder={emailField.placeholder}
              required
            />
          </label>

          <label className="login-field">
            <span>Password</span>
            <span className="login-password-input">
              <KeyRound size={16} aria-hidden="true" />
              <input
                id="login-password"
                type="password"
                name="password"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Enter your password"
                required
              />
            </span>
            <Link className="login-recovery-link" to="/forgot-password">
              Forgot password?
            </Link>
          </label>

          {error && <div className="login-error" role="alert">{error}</div>}

          <button className="login-submit" type="submit" disabled={submitting}>
            {submitting ? 'Signing in…' : `Sign in as ${roles.find((item) => item.id === role).label}`}
            {!submitting && <ArrowRight size={16} aria-hidden="true" />}
          </button>
        </form>

        <p className="login-security-note">
          Credentials are sent to the configured authentication backend. Use HTTPS outside local development; the app does not save your password.
        </p>
        <div className="login-new-user">
          <span>Need an account?</span>
          <button type="button" className="login-recovery-link" onClick={handleNewUserOption}>
            New user
          </button>
        </div>
        {newUserNotice && <div className="login-session login-new-user-notice" role="status">{newUserNotice}</div>}
      </section>

      {role === 'ngo' && (
        <section className="ngo-demo-directory" aria-labelledby="ngo-demo-directory-title">
          <div className="ngo-demo-directory-heading">
            <div>
              <p className="ngo-directory-eyebrow">Demo NGO directory</p>
              <h2 id="ngo-demo-directory-title">Choose an organization</h2>
              <p>Selecting an organization fills its demo email. Enter its password above to continue.</p>
            </div>
            <span className="ngo-directory-status"><ShieldCheck size={15} aria-hidden="true" /> Unverified demo accounts</span>
          </div>
          <p className="ngo-directory-notice" role="note">
            These are fictional login credentials and unverified organization profiles. Photos are illustrative campus images, not NGO photographs or endorsements. Do not use these accounts with real student information.
          </p>
          <div className="ngo-demo-grid">
            {ngoDemoAccounts.map((account, index) => {
              const photo = demoNgoPhotos[index % demoNgoPhotos.length];
              return (
                <button
                  className={`ngo-demo-card${email === account.email ? ' is-selected' : ''}`}
                  key={account.email}
                  type="button"
                  onClick={() => chooseDemoNgo(account.email)}
                  aria-pressed={email === account.email}
                  aria-label={`Use ${account.name} demo account (${account.email})`}
                >
                  <img src={photo.src} alt={photo.alt} loading="lazy" />
                  <span className="ngo-demo-card-content">
                    <strong>{account.name}</strong>
                    <span className="ngo-demo-location"><MapPin size={13} aria-hidden="true" />{account.location}</span>
                    <span className="ngo-demo-focus">{account.focus}</span>
                    <span className="ngo-demo-email">{account.email}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      )}

      {user?.role === 'admin' && (
        <section className="login-card login-create-card" id="new-user" data-scroll-reveal>
          <div className="login-card-heading">
            <span className="login-shield"><UserRound size={21} aria-hidden="true" /></span>
            <div>
              <h2>Create a new user</h2>
              <p>Admin access is required to create accounts.</p>
            </div>
          </div>

          <form className="login-form" onSubmit={handleCreateAccount}>
            <label className="login-field">
              <span>Display name</span>
              <input
                type="text"
                autoComplete="name"
                maxLength={120}
                value={accountForm.displayName}
                onChange={(event) => setAccountForm({ ...accountForm, displayName: event.target.value })}
                required
              />
            </label>

            <label className="login-field">
              <span>Campus email</span>
              <input
                type="email"
                autoComplete="email"
                value={accountForm.email}
                onChange={(event) => setAccountForm({ ...accountForm, email: event.target.value })}
                required
              />
            </label>

            <label className="login-field">
              <span>Temporary password (12+ characters)</span>
              <input
                type="password"
                autoComplete="new-password"
                minLength={12}
                maxLength={256}
                value={accountForm.password}
                onChange={(event) => setAccountForm({ ...accountForm, password: event.target.value })}
                required
              />
            </label>

            <label className="login-field">
              <span>Account type</span>
              <select
                value={accountForm.role}
                onChange={(event) => setAccountForm({ ...accountForm, role: event.target.value })}
              >
                <option value="teacher">Teacher</option>
                <option value="student">Student</option>
                <option value="ngo">NGO</option>
                <option value="admin">Admin</option>
              </select>
            </label>

            {accountError && <div className="login-error" role="alert">{accountError}</div>}
            {accountNotice && <div className="login-session" role="status">{accountNotice}</div>}

            <button className="login-submit" type="submit" disabled={creatingAccount}>
              {creatingAccount ? 'Creating account…' : 'Create account'}
              {!creatingAccount && <ArrowRight size={16} aria-hidden="true" />}
            </button>
          </form>
        </section>
      )}
    </main>
  );
}
