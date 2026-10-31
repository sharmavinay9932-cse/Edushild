import React, { useEffect, useState } from 'react';
import AttendanceChart from '../components/dashboard/AttendanceChart.jsx';
import PrimaryNavigation from '../components/layout/PrimaryNavigation.jsx';
import RiskDistributionCard from '../components/dashboard/RiskDistributionCard.jsx';
import { getDashboardSummary } from '../services/dashboardService.js';
import '../styles/campus.css';
import '../styles/dashboard.css';
import '../styles/data-pages.css';

export default function Analytics() {
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    getDashboardSummary()
      .then((data) => {
        if (active) setAnalytics(data);
      })
      .catch((requestError) => {
        if (active) setError(requestError.response?.data?.detail || requestError.message || 'Unable to load analytics.');
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
          <h1>Analytics</h1>
          <p className="data-page-subtitle">Explore attendance and student-support trends.</p>
        </div>
        <PrimaryNavigation />
      </header>
      {loading && <div className="data-state" role="status">Loading analytics…</div>}
      {error && <div className="data-state data-state-error" role="alert">Could not load analytics: {error}</div>}
      {!loading && !error && analytics && (
        <>
          <section className="metrics-grid" aria-label="Student overview metrics" data-scroll-reveal>
            {analytics.dashboardMetrics.map((metric) => (
              <div className="analytics-metric" key={metric.label}>
                <span>{metric.label}</span><strong>{metric.value}</strong>
              </div>
            ))}
          </section>
          <section className="chart-grid" aria-label="Student analytics" data-scroll-reveal>
            <AttendanceChart data={analytics.attendanceDistribution} />
            <RiskDistributionCard data={analytics.riskDistribution} />
          </section>
          <p className="dataset-disclaimer" data-scroll-reveal>
            These are descriptive statistics for a synthetic dataset. The file contains no dates, so no time-based trend is inferred.
          </p>
        </>
      )}
    </main>
  );
}
