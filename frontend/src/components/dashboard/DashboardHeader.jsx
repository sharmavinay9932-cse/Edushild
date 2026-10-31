import React from 'react';
import { ArrowRight, CalendarDays, Sparkles, UserRoundPlus } from 'lucide-react';
import { Link } from 'react-router-dom';
import PrimaryNavigation from '../layout/PrimaryNavigation.jsx';
import { useAuth } from '../../context/AuthContext.jsx';

export default function DashboardHeader() {
  const { user } = useAuth();
  const date = new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date());

  return (
    <header className="dashboard-header" data-scroll-reveal>
      <div>
        <p className="eyebrow">EDUSHIELD <span> / </span> STUDENT SUPPORT</p>
        <h1>{user?.role === 'admin' ? 'Admin dashboard' : user ? 'Overview' : 'Welcome'}</h1>
        <p className="dashboard-subtitle">
          {user?.role === 'admin'
            ? 'Review student records, teacher and student accounts, and campus support activity.'
            : user
              ? 'Welcome to your student support workspace.'
              : 'A more connected approach to student support.'}
        </p>
      </div>
      {user && <PrimaryNavigation />}
      <div className="dashboard-header-actions">
        {user ? (
          <>
            <div className="date-display"><CalendarDays size={16} aria-hidden="true" />{date}</div>
            {user.role !== 'student' && (
              <Link className="button-primary dashboard-students-link" to="/students">Student details</Link>
            )}
            {(user.role === 'admin' || user.role === 'teacher') && (
              <Link className="button-primary dashboard-prediction-link" to="/prediction/manual">
                <Sparkles size={15} aria-hidden="true" />
                Make prediction
              </Link>
            )}
            {user.role === 'teacher' && (
              <Link className="button-primary dashboard-prediction-link" to="/teacher/students/new">
                <UserRoundPlus size={15} aria-hidden="true" />
                Add student details
              </Link>
            )}
          </>
        ) : (
          <Link className="button-primary dashboard-students-link" to="/login">
            Sign in <ArrowRight size={16} aria-hidden="true" />
          </Link>
        )}
      </div>
    </header>
  );
}
