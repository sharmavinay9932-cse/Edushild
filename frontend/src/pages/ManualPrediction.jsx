import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import PrimaryNavigation from '../components/layout/PrimaryNavigation.jsx';
import PredictionResult from '../components/prediction/PredictionResult.jsx';
import { getManualDropoutPrediction } from '../services/predictionService.js';
import '../styles/data-pages.css';

const emptyInputs = {
  attendance: '',
  internalMarks: '',
  previousGpa: '',
  backlogs: '',
  financialConditions: '',
};

function responseMessage(error) {
  return error.response?.data?.detail
    || error.message
    || 'Unable to analyze the manually entered information.';
}

export default function ManualPrediction() {
  const [inputs, setInputs] = useState(emptyInputs);
  const [prediction, setPrediction] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  function updateInput(event) {
    const { name, value } = event.target;
    setInputs((current) => ({ ...current, [name]: value }));
    setPrediction(null);
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setLoading(true);
    setError('');
    setPrediction(null);
    try {
      setPrediction(await getManualDropoutPrediction({
        attendance: Number(inputs.attendance),
        internalMarks: Number(inputs.internalMarks),
        previousGpa: Number(inputs.previousGpa),
        backlogs: Number(inputs.backlogs),
        financialConditions: inputs.financialConditions,
      }));
    } catch (requestError) {
      setError(responseMessage(requestError));
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="data-page">
      <header className="data-page-header" data-scroll-reveal>
        <div>
          <p className="eyebrow">EDUSHIELD <span> / </span> STUDENT SUPPORT</p>
          <h1>Manual student analysis</h1>
          <p className="data-page-subtitle">
            Enter academic information to estimate support needs for a student, whether or not they are in the dataset.
          </p>
        </div>
        <PrimaryNavigation />
      </header>
      <Link className="data-back-link" to="/">← Back to dashboard</Link>

      <section className="data-panel manual-prediction-panel" aria-labelledby="manual-prediction-title">
        <div className="manual-prediction-heading">
          <div>
            <h2 id="manual-prediction-title">Enter student information</h2>
            <p>This analysis uses only the values entered below. It does not search for or create a student record.</p>
          </div>
        </div>
        <form className="management-form manual-prediction-form" onSubmit={handleSubmit}>
          <label>
            Attendance (%)
            <input
              name="attendance"
              type="number"
              min="0"
              max="100"
              step="0.1"
              value={inputs.attendance}
              onChange={updateInput}
              required
            />
          </label>
          <label>
            Internal marks (%)
            <input
              name="internalMarks"
              type="number"
              min="0"
              max="100"
              step="0.1"
              value={inputs.internalMarks}
              onChange={updateInput}
              required
            />
          </label>
          <label>
            Previous GPA (0–10)
            <input
              name="previousGpa"
              type="number"
              min="0"
              max="10"
              step="0.01"
              value={inputs.previousGpa}
              onChange={updateInput}
              required
            />
          </label>
          <label>
            Backlogs
            <input
              name="backlogs"
              type="number"
              min="0"
              max="50"
              step="1"
              value={inputs.backlogs}
              onChange={updateInput}
              required
            />
          </label>
          <label>
            Financial conditions
            <select
              name="financialConditions"
              value={inputs.financialConditions}
              onChange={updateInput}
              required
            >
              <option value="">Choose…</option>
              <option value="Stable">Stable</option>
              <option value="Moderate">Moderate</option>
              <option value="Severe">Severe</option>
            </select>
          </label>
          {error && (
            <div className="data-state data-state-error manual-prediction-message" role="alert">
              {error}
            </div>
          )}
          <button className="management-submit manual-prediction-submit" type="submit" disabled={loading}>
            {loading ? 'Analyzing…' : 'Analyze student'}
          </button>
        </form>
        {prediction && (
          <PredictionResult prediction={prediction} sourceLabel="Based on manually entered student data" />
        )}
        <p className="student-detail-note manual-prediction-note">
          This is an exploratory estimate based on synthetic training data, not a diagnosis or guarantee. Discuss the result with the student and consider their full circumstances before choosing support.
        </p>
      </section>
    </main>
  );
}
