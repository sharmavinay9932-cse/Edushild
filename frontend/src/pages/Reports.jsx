import React, { useEffect, useState } from 'react';
import { Download } from 'lucide-react';
import PrimaryNavigation from '../components/layout/PrimaryNavigation.jsx';
import { getStudents } from '../services/studentService.js';
import '../styles/data-pages.css';

function downloadCsv(students) {
  const rows = [
    ['Dataset ID', 'Attendance', 'Internal marks', 'Previous GPA', 'Backlogs', 'Financial conditions', 'Risk category', 'Dataset dropout label'],
    ...students.map((student) => [
      student.id,
      student.attendance,
      student.internalMarks,
      student.previousGpa,
      student.activeBacklogs,
      student.financialConditions,
      student.riskLevel,
      student.dropout ? 'Yes' : 'No',
    ]),
  ];
  const csv = rows.map((row) => row.map((value) => `"${String(value ?? '').replaceAll('"', '""')}"`).join(',')).join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `edushield-student-report-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

export default function Reports() {
  const [students, setStudents] = useState([]);
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
        if (active) setError(requestError.response?.data?.detail || requestError.message || 'Unable to prepare the report.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  return (
    <main className="data-page">
      <header className="data-page-header" data-scroll-reveal>
        <div>
          <p className="eyebrow">EDUSHIELD <span> / </span> STUDENT SUPPORT</p>
          <h1>Reports</h1>
          <p className="data-page-subtitle">Download a CSV report of the provided dataset records.</p>
        </div>
        <PrimaryNavigation />
      </header>
      {loading && <div className="data-state" role="status">Preparing report data…</div>}
      {error && <div className="data-state data-state-error" role="alert">Could not prepare report: {error}</div>}
      {!loading && !error && (
        <section className="data-panel report-panel" data-scroll-reveal>
          <div>
            <h2>Dataset student records</h2>
            <p>{students.length} student records are available in this report.</p>
          </div>
          <button className="report-download" type="button" onClick={() => downloadCsv(students)}>
            <Download size={16} aria-hidden="true" /> Download CSV
          </button>
        </section>
      )}
    </main>
  );
}
