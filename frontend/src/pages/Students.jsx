import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import PrimaryNavigation from '../components/layout/PrimaryNavigation.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { getStudents } from '../services/studentService.js';
import '../styles/data-pages.css';

export default function Students() {
  const { user } = useAuth();
  const [students, setStudents] = useState([]);
  const [visibleCount, setVisibleCount] = useState(100);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    getStudents()
      .then((data) => {
        if (!Array.isArray(data)) throw new Error('Expected the students endpoint to return an array.');
        if (active) setStudents(data);
      })
      .catch((requestError) => {
        if (active) setError(requestError.response?.data?.detail || requestError.message || 'Unable to load students.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);
  const visibleStudents = students.slice(0, visibleCount);

  return (
    <main className="data-page">
      <header className="data-page-header" data-scroll-reveal>
        <div>
          <p className="eyebrow">EDUSHIELD <span> / </span> STUDENT SUPPORT</p>
          <h1>{user?.role === 'ngo' ? 'Assigned students' : 'Student details'}</h1>
          <p className="data-page-subtitle">
            {user?.role === 'ngo'
              ? 'View the student records assigned to your organization and their AI support plans.'
              : 'Browse academic records and categories from the synthetic dataset. Select Details for a student to run an AI estimate or try a prediction with manual data.'}
          </p>
        </div>
        <PrimaryNavigation />
      </header>
      {loading && <div className="data-state" role="status">Loading students…</div>}
      {error && <div className="data-state data-state-error" role="alert">Could not load students: {error}</div>}
      {!loading && !error && <p className="dataset-disclaimer">IDs and academic values come from a synthetic dataset, not live student records.</p>}
      {!loading && !error && (
        <section className="data-panel" data-scroll-reveal>
          {students.length === 0 ? (
            <p className="data-empty">
              {user?.role === 'ngo'
                ? 'No student records have been assigned to your organization. Contact an administrator.'
                : 'The dataset contains no student records.'}
            </p>
          ) : (
            <div className="data-table-scroll">
              <table className="data-table">
                <thead>
                  <tr><th>Dataset ID</th><th>Attendance</th><th>Internal marks</th><th>Previous GPA</th><th>Backlogs</th><th>Financial conditions</th><th>Risk category</th><th>Dropout label</th><th /></tr>
                </thead>
                <tbody>
                  {visibleStudents.map((student) => (
                    <tr key={student.id}>
                      <td><strong>{student.id}</strong></td>
                      <td>{student.attendance}%</td>
                      <td>{student.internalMarks}%</td>
                      <td>{student.previousGpa}</td>
                      <td>{student.activeBacklogs}</td>
                      <td>{student.financialConditions}</td>
                      <td><span className={`data-risk data-risk-${String(student.riskLevel).toLowerCase()}`}>{student.riskLevel}</span></td>
                      <td>{student.dropout ? 'Yes' : 'No'}</td>
                      <td><Link className="data-row-link" to={`/students/${encodeURIComponent(student.id)}`}>Details</Link></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {students.length > visibleStudents.length && (
            <div className="data-pagination">
              <span>Showing {visibleStudents.length} of {students.length} records</span>
              <button type="button" onClick={() => setVisibleCount((count) => count + 100)}>Show more</button>
            </div>
          )}
        </section>
      )}
    </main>
  );
}
