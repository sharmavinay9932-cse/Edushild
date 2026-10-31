import React, { useEffect, useState } from 'react';
import PrimaryNavigation from '../components/layout/PrimaryNavigation.jsx';
import { getRiskPredictions } from '../services/predictionService.js';
import '../styles/data-pages.css';

export default function RiskAnalysis() {
  const [records, setRecords] = useState([]);
  const [visibleCount, setVisibleCount] = useState(100);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    getRiskPredictions()
      .then((data) => {
        if (!Array.isArray(data)) throw new Error('Expected the risk analysis endpoint to return an array.');
        if (active) setRecords(data);
      })
      .catch((requestError) => {
        if (active) setError(requestError.response?.data?.detail || requestError.message || 'Unable to load dataset risk records.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);
  const visibleRecords = records.slice(0, visibleCount);

  return (
    <main className="data-page">
      <header className="data-page-header" data-scroll-reveal>
        <div>
          <p className="eyebrow">EDUSHIELD <span> / </span> STUDENT SUPPORT</p>
          <h1>Dataset risk analysis</h1>
          <p className="data-page-subtitle">Review risk categories and dropout labels already present in the dataset.</p>
        </div>
        <PrimaryNavigation />
      </header>
      {loading && <div className="data-state" role="status">Loading dataset records…</div>}
      {error && <div className="data-state data-state-error" role="alert">Could not load dataset risk records: {error}</div>}
      {!loading && !error && <p className="dataset-disclaimer">These are existing labels in a synthetic dataset, not model-generated predictions.</p>}
      {!loading && !error && (
        <section className="data-panel" data-scroll-reveal>
          {records.length === 0 ? (
            <p className="data-empty">The dataset contains no risk records.</p>
          ) : (
            <div className="data-table-scroll">
              <table className="data-table">
                <thead>
                  <tr><th>Dataset ID</th><th>Risk category</th><th>Dropout label</th><th>Dataset indicators</th></tr>
                </thead>
                <tbody>
                  {visibleRecords.map((record, index) => {
                    const factors = Array.isArray(record.factors)
                      ? record.factors.join(', ')
                      : '';
                    return (
                      <tr key={record.studentId ?? `${record.studentId}-${index}`}>
                        <td><strong>{record.studentId}</strong></td>
                        <td><span className={`data-risk data-risk-${String(record.riskLevel).toLowerCase()}`}>{record.riskLevel}</span></td>
                        <td>{record.dropout ? 'Yes' : 'No'}</td>
                        <td>{factors || 'No selected threshold indicators'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          {records.length > visibleRecords.length && (
            <div className="data-pagination">
              <span>Showing {visibleRecords.length} of {records.length} records</span>
              <button type="button" onClick={() => setVisibleCount((count) => count + 100)}>Show more</button>
            </div>
          )}
        </section>
      )}
    </main>
  );
}
