import React, { useEffect, useState } from 'react';
import { Search } from 'lucide-react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import PrimaryNavigation from '../components/layout/PrimaryNavigation.jsx';
import PredictionResult from '../components/prediction/PredictionResult.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { getManualDropoutPrediction, getStudentDropoutPrediction } from '../services/predictionService.js';
import { getStudentById } from '../services/studentService.js';
import '../styles/data-pages.css';

const emptyManualInputs = {
  attendance: '',
  internalMarks: '',
  previousGpa: '',
  backlogs: '',
  financialConditions: '',
};

export default function StudentDetails() {
  const { studentId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [searchId, setSearchId] = useState(studentId || '');
  const [student, setStudent] = useState(null);
  const [prediction, setPrediction] = useState(null);
  const [predictionLoading, setPredictionLoading] = useState(false);
  const [predictionError, setPredictionError] = useState('');
  const [manualInputs, setManualInputs] = useState(emptyManualInputs);
  const [manualPrediction, setManualPrediction] = useState(null);
  const [manualPredictionLoading, setManualPredictionLoading] = useState(false);
  const [manualPredictionError, setManualPredictionError] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    setSearchId(studentId || '');
    setLoading(true);
    setError('');
    setStudent(null);
    setPrediction(null);
    setPredictionError('');
    getStudentById(studentId)
      .then((data) => {
        if (active) setStudent(data);
      })
      .catch((requestError) => {
        if (active) setError(requestError.response?.data?.detail || requestError.message || 'Unable to load student details.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [studentId]);

  function handleSearch(event) {
    event.preventDefault();
    const requestedId = searchId.trim();
    if (requestedId) {
      navigate(`/students/${encodeURIComponent(requestedId)}`);
    }
  }

  async function handlePrediction() {
    setPredictionLoading(true);
    setPredictionError('');
    try {
      setPrediction(await getStudentDropoutPrediction(studentId));
    } catch (requestError) {
      setPredictionError(
        requestError.response?.data?.detail
          || requestError.message
          || 'Unable to estimate dropout risk.',
      );
    } finally {
      setPredictionLoading(false);
    }
  }

  async function handleManualPrediction(event) {
    event.preventDefault();
    setManualPredictionLoading(true);
    setManualPredictionError('');
    setManualPrediction(null);
    try {
      const inputs = {
        attendance: Number(manualInputs.attendance),
        internalMarks: Number(manualInputs.internalMarks),
        previousGpa: Number(manualInputs.previousGpa),
        backlogs: Number(manualInputs.backlogs),
        financialConditions: manualInputs.financialConditions,
      };
      setManualPrediction(await getManualDropoutPrediction(inputs));
    } catch (requestError) {
      setManualPredictionError(
        requestError.response?.data?.detail
          || requestError.message
          || 'Unable to analyze the manually entered information.',
      );
    } finally {
      setManualPredictionLoading(false);
    }
  }

  function updateManualInput(event) {
    const { name, value } = event.target;
    setManualInputs((current) => ({ ...current, [name]: value }));
    setManualPrediction(null);
  }

  return (
    <main className="data-page">
      <header className="data-page-header" data-scroll-reveal>
        <div>
          <p className="eyebrow">EDUSHIELD <span> / </span> STUDENT SUPPORT</p>
          <h1>Student details</h1>
          <p className="data-page-subtitle">
            {user?.role === 'ngo'
              ? 'Review this assigned student record and its AI-suggested support plan.'
              : 'A starting point for a supportive, staff-led conversation.'}
          </p>
        </div>
        <PrimaryNavigation />
      </header>
      <Link className="data-back-link" to="/students">← Back to students</Link>
      <form className="student-detail-search" onSubmit={handleSearch} role="search">
        <label className="student-detail-search-label" htmlFor="student-detail-search">
          Search student by ID
        </label>
        <div className="student-detail-search-control">
          <input
            id="student-detail-search"
            type="search"
            value={searchId}
            onChange={(event) => setSearchId(event.target.value)}
            placeholder="Enter student ID"
            autoComplete="off"
            required
          />
          <button type="submit" aria-label="Search student">
            <Search size={16} aria-hidden="true" />
            Search
          </button>
        </div>
      </form>
      {loading && <div className="data-state" role="status">Loading student details…</div>}
      {error && <div className="data-state data-state-error" role="alert">Could not load student: {error}</div>}
      {!loading && !error && student && (
        <section className="data-panel student-detail-panel" data-scroll-reveal>
          <span className={`data-risk data-risk-${String(student.riskLevel).toLowerCase()}`}>{student.riskLevel} dataset category</span>
          <h2>Dataset record {student.id}</h2>
          <p>Source dataset student identifier</p>
          <dl>
            <div><dt>Attendance</dt><dd>{student.attendance}%</dd></div>
            <div><dt>Internal marks</dt><dd>{student.internalMarks}%</dd></div>
            <div><dt>Previous semester GPA</dt><dd>{student.previousGpa}</dd></div>
            <div><dt>Active backlogs</dt><dd>{student.activeBacklogs}</dd></div>
            <div><dt>Financial conditions</dt><dd>{student.financialConditions}</dd></div>
            <div><dt>Dataset dropout label</dt><dd>{student.dropout ? 'Yes' : 'No'}</dd></div>
            <div><dt>Dataset indicators</dt><dd>{student.signals.length ? student.signals.join(', ') : 'None of the selected thresholds'}</dd></div>
          </dl>
          <p className="student-detail-note">This is a synthetic dataset record. Risk and dropout values are provided by the dataset; they are not generated predictions about a real student.</p>
          <section className="dropout-prediction" aria-labelledby="dropout-prediction-title" aria-live="polite">
            <div className="dropout-prediction-heading">
              <div>
                <h3 id="dropout-prediction-title">AI dropout analysis</h3>
                <p>Review possible contributing factors and use them to guide a supportive conversation.</p>
              </div>
              <button
                className="management-submit"
                type="button"
                onClick={handlePrediction}
                disabled={predictionLoading}
              >
                {predictionLoading ? 'Estimating…' : prediction ? 'Refresh estimate' : 'Estimate risk'}
              </button>
            </div>
            {predictionError && <div className="data-state data-state-error" role="alert">{predictionError}</div>}
            {prediction && (
              <PredictionResult prediction={prediction} />
            )}
            <p className="dropout-prediction-disclaimer">
              This plan offers supportive options, not a promise to prevent dropout or a judgment about the student. The analysis uses patterns in synthetic data, not confirmed causes; discuss what the student needs and choose next steps together.
            </p>
          </section>
        </section>
      )}
      {user?.role !== 'ngo' && <section className="data-panel manual-prediction-panel" aria-labelledby="manual-prediction-title">
        <div className="manual-prediction-heading">
          <div>
            <h2 id="manual-prediction-title">Try a prediction with manual data</h2>
            <p>Enter the model inputs to explore a hypothetical case. This does not save a student record.</p>
          </div>
        </div>
        <form className="management-form manual-prediction-form" onSubmit={handleManualPrediction}>
          <label>
            Attendance
            <input name="attendance" type="number" min="0" max="100" step="0.1" value={manualInputs.attendance} onChange={updateManualInput} required />
          </label>
          <label>
            Internal marks
            <input name="internalMarks" type="number" min="0" max="100" step="0.1" value={manualInputs.internalMarks} onChange={updateManualInput} required />
          </label>
          <label>
            Previous GPA (0–10)
            <input name="previousGpa" type="number" min="0" max="10" step="0.01" value={manualInputs.previousGpa} onChange={updateManualInput} required />
          </label>
          <label>
            Backlogs
            <input name="backlogs" type="number" min="0" max="50" step="1" value={manualInputs.backlogs} onChange={updateManualInput} required />
          </label>
          <label>
            Financial conditions
            <select name="financialConditions" value={manualInputs.financialConditions} onChange={updateManualInput} required>
              <option value="">Choose…</option>
              <option value="Stable">Stable</option>
              <option value="Moderate">Moderate</option>
              <option value="Severe">Severe</option>
            </select>
          </label>
          {manualPredictionError && (
            <div className="data-state data-state-error manual-prediction-message" role="alert">
              {manualPredictionError}
            </div>
          )}
          <button className="management-submit manual-prediction-submit" type="submit" disabled={manualPredictionLoading}>
            {manualPredictionLoading ? 'Analyzing…' : 'Predict from entered data'}
          </button>
        </form>
        {manualPrediction && (
          <PredictionResult prediction={manualPrediction} sourceLabel="Based on manually entered data" />
        )}
        <p className="student-detail-note manual-prediction-note">
          This is an exploratory estimate based on synthetic training data, not a diagnosis or guarantee. Discuss the result with the student and use their real context when choosing support.
        </p>
      </section>}
      {!loading && !error && !student && <div className="data-state">Student not found.</div>}
    </main>
  );
}
