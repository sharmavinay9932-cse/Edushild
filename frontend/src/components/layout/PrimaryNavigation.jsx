import React from 'react';
import { LogIn, LogOut } from 'lucide-react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.jsx';

const staffLinks = [
  { to: '/', label: 'Overview', end: true },
  { to: '/students', label: 'Student details' },
  { to: '/risk-analysis', label: 'Risk analysis' },
  { to: '/interventions', label: 'Interventions' },
  { to: '/analytics', label: 'Analytics' },
  { to: '/reports', label: 'Reports' },
  { to: '/settings', label: 'Accounts', adminOnly: true },
  { to: '/support-requests', label: 'Support requests', adminOnly: true },
  { to: '/login#new-user', label: 'New user', adminOnly: true },
];

export default function PrimaryNavigation({ showLogin = true }) {
  const { user, logout } = useAuth();
  const links = user?.role === 'teacher'
    ? staffLinks.filter(({ to, adminOnly }) => to !== '/' && !adminOnly)
    : user?.role === 'admin'
      ? staffLinks
      : user?.role === 'ngo'
        ? [
          { to: '/ngo-dashboard', label: 'Overview' },
          { to: '/students', label: 'Assigned students' },
        ]
      : user?.role === 'student'
        ? [{ to: '/student', label: 'My details' }]
        : [];

  return (
    <nav className="dashboard-nav" aria-label="Main navigation">
      {links.map(({ to, label, end }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          className={({ isActive }) => (isActive ? 'is-active' : undefined)}
        >
          {label}
        </NavLink>
      ))}
      {user ? (
        <div className="nav-account">
          <span className="nav-account-role">{user.role}</span>
          <button type="button" className="nav-login-button" onClick={logout}>
            <LogOut size={14} aria-hidden="true" /> Sign out
          </button>
        </div>
      ) : showLogin ? (
        <NavLink to="/login" className={({ isActive }) => `nav-login-button${isActive ? ' is-active' : ''}`}>
          <LogIn size={14} aria-hidden="true" /> Login
        </NavLink>
      ) : null}
    </nav>
  );
}
