import { Search, ArrowUpRight } from 'lucide-react';
import React, { useMemo, useState } from 'react';

export default function HighRiskStudentsTable({ students, onReview }) {
  const [query, setQuery] = useState('');
  const [riskFilter, setRiskFilter] = useState('All risk levels');
  const [visibleCount, setVisibleCount] = useState(100);

  const filteredStudents = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return students.filter((student) => {
      const matchesRisk = riskFilter === 'All risk levels' || student.riskLevel === riskFilter;
      const matchesQuery = !normalizedQuery || [
        student.id,
        student.riskLevel,
        ...student.signals,
      ].some((value) => String(value ?? '').toLowerCase().includes(normalizedQuery));
      return matchesRisk && matchesQuery;
    });
  }, [students, query, riskFilter]);
  const visibleStudents = filteredStudents.slice(0, visibleCount);

  return (
    <section className="panel students-panel" data-scroll-reveal>
      <div className="panel-heading students-panel-heading">
        <div>
          <h2>Student dataset</h2>
          <p>Filter records by observed dataset risk category</p>
        </div>
        <div className="table-controls">
          <label className="search-field">
            <Search size={16} aria-hidden="true" />
            <input
              type="search"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setVisibleCount(100);
              }}
              placeholder="Search students"
              aria-label="Search students"
            />
          </label>
          <select
            value={riskFilter}
            onChange={(event) => {
              setRiskFilter(event.target.value);
              setVisibleCount(100);
            }}
            aria-label="Filter by risk level"
            className="risk-filter"
          >
            <option>All risk levels</option>
            <option>High</option>
            <option>Medium</option>
            <option>Low</option>
          </select>
        </div>
      </div>
      <div className="table-scroll">
        <table className="students-table">
          <thead>
            <tr>
              <th>Student ID</th>
              <th>Attendance</th>
              <th>Internal marks</th>
              <th>Previous GPA</th>
              <th>Active backlogs</th>
              <th>Financial conditions</th>
              <th>Risk level</th>
              <th>Dataset dropout label</th>
              <th><span className="sr-only">Action</span></th>
            </tr>
          </thead>
          <tbody>
            {visibleStudents.map((student) => (
              <tr key={student.id}>
                <td className="student-id">{student.id}</td>
                <td>
                  <span className={`attendance-value ${student.attendance < 60 ? 'attendance-low' : ''}`}>
                    {student.attendance}%
                  </span>
                </td>
                <td>{student.internalMarks}%</td>
                <td>{student.previousGpa}</td>
                <td>{student.activeBacklogs}</td>
                <td>{student.financialConditions}</td>
                <td><span className={`risk-badge risk-${student.riskLevel.toLowerCase()}`}>{student.riskLevel}</span></td>
                <td>{student.dropout ? 'Yes' : 'No'}</td>
                <td>
                  <button className="review-button" type="button" onClick={() => onReview(student)}>
                    Details <ArrowUpRight size={14} aria-hidden="true" />
                  </button>
                </td>
              </tr>
            ))}
            {filteredStudents.length === 0 && (
              <tr><td className="empty-table" colSpan="9">No students match your search and risk filters.</td></tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="table-footer">
        <span>Showing {visibleStudents.length} of {filteredStudents.length} filtered records</span>
        {visibleStudents.length < filteredStudents.length && (
          <button type="button" onClick={() => setVisibleCount((count) => count + 100)}>
            Show more
          </button>
        )}
      </div>
    </section>
  );
}
