import React, { useEffect, useState } from 'react';
import { GraduationCap, ShieldCheck } from 'lucide-react';
import { Navigate, useNavigate } from 'react-router-dom';
import campusStudentPhoto from '../assets/images/ct-campus-student-robot.png';
import classroomPhoto from '../assets/images/ct-classroom-support.png';
import classroomEngagementPhoto from '../assets/images/ct-classroom-engagement.png';
import { useAuth } from '../context/AuthContext.jsx';
import AttendanceChart from '../components/dashboard/AttendanceChart.jsx';
import CampusHero from '../components/dashboard/CampusHero.jsx';
import DashboardHeader from '../components/dashboard/DashboardHeader.jsx';
import HighRiskStudentsTable from '../components/dashboard/HighRiskStudentsTable.jsx';
import { AlertsPanel, RecentInterventions } from '../components/dashboard/InterventionsAndAlerts.jsx';
import MetricCard from '../components/dashboard/MetricCard.jsx';
import RiskDistributionCard from '../components/dashboard/RiskDistributionCard.jsx';
import { getDashboardSummary } from '../services/dashboardService.js';
import { getInterventions } from '../services/interventionService.js';
import { getStudents } from '../services/studentService.js';
import { getStaffStudentDetails } from '../services/teacherStudentService.js';
import { getUsers } from '../services/userService.js';
import '../styles/campus.css';
import '../styles/dashboard.css';

const STATUS_LABEL = {
  planned: 'Pending',
  in_progress: 'In Progress',
  completed: 'Completed',
};

const retentionIdeas = [
  {
    image: 'https://images.unsplash.com/photo-1522202176988-66273c2fd55f?auto=format&fit=crop&w=800&q=80',
    alt: 'Students working together around a table',
    title: 'Check in early',
    detail: 'A missed class or assignment can be a reason to reach out with care. Ask what is getting in the way and listen before suggesting next steps.',
    action: 'Start with a supportive conversation',
  },
  {
    image: classroomPhoto,
    alt: 'Teacher helping students in a classroom',
    title: 'Make help easy to find',
    detail: 'Connect students with tutoring, office hours, advising, or financial and wellbeing resources through a clear, low-friction next step.',
    action: 'Offer a specific resource or referral',
  },
  {
    image: campusStudentPhoto,
    alt: 'Student standing beside a metal sculpture on the CT campus',
    title: 'Strengthen belonging',
    detail: 'Peer study groups, mentoring, and a trusted staff contact can help students feel connected and comfortable asking for support.',
    action: 'Help each student find their people',
  },
  {
    image: classroomEngagementPhoto,
    alt: 'Students taking part in a classroom lesson with their teacher',
    title: 'Make learning engaging',
    detail: 'Invite questions, check understanding, and make it easy for students to ask for help before they fall behind.',
    action: 'Create space for every student to participate',
  },
];

export default function Dashboard() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [analytics, setAnalytics] = useState(null);
  const [students, setStudents] = useState([]);
  const [interventions, setInterventions] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [teacherStudentDetails, setTeacherStudentDetails] = useState([]);
  const [accountSearch, setAccountSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return undefined;
    }
    if (user.role === 'student' || user.role === 'ngo') return undefined;

    let active = true;
    const accountsRequest = user.role === 'admin' ? getUsers() : Promise.resolve([]);
    const enteredDetailsRequest = user.role === 'admin'
      ? getStaffStudentDetails()
      : Promise.resolve([]);
    Promise.all([
      getDashboardSummary(),
      getStudents(),
      getInterventions(),
      accountsRequest,
      enteredDetailsRequest,
    ])
      .then(([analyticsData, studentData, interventionData, accountData, enteredDetailsData]) => {
        if (!active) return;
        if (
          !Array.isArray(studentData)
          || !Array.isArray(interventionData)
          || !Array.isArray(accountData)
          || !Array.isArray(enteredDetailsData)
        ) {
          throw new Error('The dashboard service returned an unexpected response.');
        }
        setAnalytics(analyticsData);
        setStudents(studentData);
        setInterventions(interventionData);
        setAccounts(accountData);
        setTeacherStudentDetails(enteredDetailsData);
      })
      .catch((err) => {
        if (active)
          setError(err.response?.data?.detail || err.message || 'Unable to load dashboard data.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [user]);

  if (user?.role === 'student') return <Navigate to="/student" replace />;
  if (user?.role === 'ngo') return <Navigate to="/ngo-dashboard" replace />;

  const studentAccounts = accounts.filter((account) => account.role === 'student');
  const teacherAccounts = accounts.filter((account) => account.role === 'teacher');
  const query = accountSearch.trim().toLowerCase();
  const visibleAccounts = accounts
    .filter((account) => account.role === 'student' || account.role === 'teacher')
    .filter((account) => !query || [
      account.displayName,
      account.email,
      account.role,
      account.studentId,
      account.active ? 'active' : 'disabled',
    ].some((value) => String(value ?? '').toLowerCase().includes(query)));

  // Derive alerts: high-risk students with no intervention yet
  const interventionStudentIds = new Set(interventions.map((i) => i.studentId));
  const alertStudents = students
    .filter((s) => s.riskLevel === 'High' && !interventionStudentIds.has(s.id))
    .slice(0, 8)
    .map((s) => ({
      student: s.id,
      initials: s.id.slice(0, 2).toUpperCase(),
      detail: s.signals.length
        ? s.signals[0]
        : `Attendance ${s.attendance}%, GPA ${s.previousGpa}`,
    }));

  // Recent interventions (last 5)
  const recentInterventions = interventions.slice(0, 5).map((i) => ({
    title: i.title,
    student: i.studentId,
    date: i.dueDate || i.createdAt?.slice(0, 10) || '—',
    status: STATUS_LABEL[i.status] || i.status,
  }));

  function handleReviewStudent(student) {
    const id = typeof student === 'object' ? student.id : student;
    navigate(`/students/${encodeURIComponent(id)}`);
  }

  return (
    <main className="dashboard-page">
      <DashboardHeader />
      {user?.role !== 'admin' && <CampusHero />}

      {user?.role !== 'admin' && <section className="retention-section" aria-labelledby="retention-title" data-scroll-reveal>
        <div className="retention-heading">
          <div>
            <p className="campus-kicker">Small actions, meaningful support</p>
            <h2 id="retention-title">Ways to help students stay on track.</h2>
          </div>
          <p>Lead with curiosity, connect students to support, and follow up together.</p>
        </div>
        <div className="retention-grid">
          {retentionIdeas.map((idea) => (
            <article className="retention-card" key={idea.title}>
              <img
                src={idea.image}
                alt={idea.alt}
                loading="lazy"
                decoding="async"
              />
              <div className="retention-card-copy">
                <h3>{idea.title}</h3>
                <p>{idea.detail}</p>
                <span>{idea.action}</span>
              </div>
            </article>
          ))}
        </div>
        <p className="retention-disclaimer">
          These are general support ideas, not guarantees. Use student data thoughtfully and involve students in decisions about their support.
        </p>
      </section>}

      {loading && (
        <div className="data-state" role="status" style={{ margin: '32px 0' }}>
          Loading dashboard data…
        </div>
      )}
      {error && (
        <div className="data-state data-state-error" role="alert" style={{ margin: '32px 0' }}>
          {error}
        </div>
      )}

      {!user && (
        <section className="public-dashboard-note" data-scroll-reveal>
          <ShieldCheck size={19} aria-hidden="true" />
          <p>Sign in with your campus account to access student insights and support tools.</p>
        </section>
      )}

      {!loading && !error && analytics && (
        <>
          {user?.role === 'admin' && (
            <section className="admin-people-overview" aria-label="Student and teacher account overview" data-scroll-reveal>
              <div className="admin-people-heading">
                <div>
                  <p className="campus-kicker">People overview</p>
                  <h2>Students and teachers</h2>
                </div>
                <p>Account directory and student dataset records are shown below.</p>
              </div>
              <div className="admin-people-metrics">
                <article>
                  <span>Student accounts</span>
                  <strong>{studentAccounts.length}</strong>
                  <small>Student portal access</small>
                </article>
                <article>
                  <span>Teacher accounts</span>
                  <strong>{teacherAccounts.length}</strong>
                  <small>{teacherAccounts.filter((account) => account.active).length} active</small>
                </article>
                <article>
                  <span>Teacher-entered records</span>
                  <strong>{teacherStudentDetails.length.toLocaleString()}</strong>
                  <small>Saved student portal details</small>
                </article>
              </div>
              <div className="admin-directory-panel">
                <div className="admin-directory-heading">
                  <div>
                    <h3>Student and teacher accounts</h3>
                    <p>Student accounts may be linked to a dataset record. Account status is managed in Accounts.</p>
                  </div>
                  <input
                    type="search"
                    value={accountSearch}
                    onChange={(event) => setAccountSearch(event.target.value)}
                    placeholder="Search name, email or ID"
                    aria-label="Search student and teacher accounts"
                  />
                </div>
                {visibleAccounts.length === 0 ? (
                  <p className="admin-directory-empty">
                    {accounts.length === 0
                      ? 'No student or teacher accounts have been created yet.'
                      : 'No student or teacher accounts match your search.'}
                  </p>
                ) : (
                  <div className="table-scroll">
                    <table className="students-table admin-directory-table">
                      <thead>
                        <tr>
                          <th>Role</th>
                          <th>Name</th>
                          <th>Email</th>
                          <th>Linked student record</th>
                          <th>Account status</th>
                          <th>Created</th>
                        </tr>
                      </thead>
                      <tbody>
                        {visibleAccounts.map((account) => (
                          <tr key={account.id}>
                            <td><span className={`admin-role-badge admin-role-${account.role}`}>{account.role}</span></td>
                            <td className="student-id">{account.displayName}</td>
                            <td>{account.email}</td>
                            <td>{account.studentId || '—'}</td>
                            <td>
                              <span className={`admin-account-status ${account.active ? 'is-active' : 'is-disabled'}`}>
                                {account.active ? 'Active' : 'Disabled'}
                              </span>
                            </td>
                            <td>{account.createdAt ? new Date(account.createdAt).toLocaleDateString() : '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                <div className="admin-directory-footer">
                  <span>Showing {visibleAccounts.length} student and teacher account{visibleAccounts.length === 1 ? '' : 's'}</span>
                  <button type="button" onClick={() => navigate('/settings')}>Manage accounts</button>
                </div>
              </div>
              <div className="admin-directory-panel">
                <div className="admin-directory-heading">
                  <div>
                    <h3>Teacher-entered student details</h3>
                    <p>These are saved academic details shared with each student and administrators.</p>
                  </div>
                </div>
                {teacherStudentDetails.length === 0 ? (
                  <p className="admin-directory-empty">Teachers have not entered student details yet.</p>
                ) : (
                  <div className="table-scroll">
                    <table className="students-table admin-directory-table">
                      <thead>
                        <tr>
                          <th>Student</th>
                          <th>Email</th>
                          <th>Attendance</th>
                          <th>Internal marks</th>
                          <th>Previous GPA</th>
                          <th>Backlogs</th>
                          <th>Financial conditions</th>
                          <th>Entered by</th>
                        </tr>
                      </thead>
                      <tbody>
                        {teacherStudentDetails.map((details) => (
                          <tr key={details.studentAccountId}>
                            <td className="student-id">{details.studentName}</td>
                            <td>{details.studentEmail}</td>
                            <td>{details.attendance}%</td>
                            <td>{details.internalMarks}%</td>
                            <td>{details.previousGpa}</td>
                            <td>{details.activeBacklogs}</td>
                            <td>{details.financialConditions}</td>
                            <td>{details.createdBy || '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </section>
          )}

          {/* Metric cards */}
          <section className="metrics-grid" aria-label="Student overview metrics" data-scroll-reveal>
            {analytics.dashboardMetrics.map((metric, index) => (
              <MetricCard key={metric.label} metric={metric} index={index} />
            ))}
          </section>

          {/* Charts row */}
          <section className="chart-grid" aria-label="Student analytics" data-scroll-reveal>
            <AttendanceChart data={analytics.attendanceDistribution} />
            <RiskDistributionCard data={analytics.riskDistribution} />
          </section>

          {/* Interventions + Alerts row */}
          {(recentInterventions.length > 0 || alertStudents.length > 0) && (
            <section className="activity-grid" aria-label="Interventions and alerts" data-scroll-reveal>
              {recentInterventions.length > 0 && (
                <RecentInterventions interventions={recentInterventions} />
              )}
              {alertStudents.length > 0 && (
                <AlertsPanel alerts={alertStudents} onReview={handleReviewStudent} />
              )}
            </section>
          )}

          {/* Full student table */}
          <div data-scroll-reveal>
            <HighRiskStudentsTable students={students} onReview={handleReviewStudent} />
          </div>
        </>
      )}

      <footer className="dashboard-footer">
        <span><ShieldCheck size={14} aria-hidden="true" /> Student information should be handled with care.</span>
        <span><GraduationCap size={15} aria-hidden="true" /> EduShield AI <i /> Overview</span>
      </footer>
    </main>
  );
}
