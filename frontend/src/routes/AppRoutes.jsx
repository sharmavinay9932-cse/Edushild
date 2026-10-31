import React from 'react';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import RequireRole from '../components/common/RequireRole.jsx';
import ScrollRevealObserver from '../components/common/ScrollRevealObserver.jsx';
import { AuthProvider } from '../context/AuthContext.jsx';
import Analytics from '../pages/Analytics.jsx';
import Dashboard from '../pages/Dashboard.jsx';
import Interventions from '../pages/Interventions.jsx';
import Login from '../pages/Login.jsx';
import ManualPrediction from '../pages/ManualPrediction.jsx';
import NGODashboard from '../pages/NGODashboard.jsx';
import NotFound from '../pages/NotFound.jsx';
import PasswordRecovery from '../pages/PasswordRecovery.jsx';
import Reports from '../pages/Reports.jsx';
import RiskAnalysis from '../pages/RiskAnalysis.jsx';
import Settings from '../pages/Settings.jsx';
import StudentHome from '../pages/StudentHome.jsx';
import StudentDetails from '../pages/StudentDetails.jsx';
import SupportRequests from '../pages/SupportRequests.jsx';
import TeacherStudentEntry from '../pages/TeacherStudentEntry.jsx';
import Students from '../pages/Students.jsx';

export default function AppRoutes() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ScrollRevealObserver />
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/login" element={<Login />} />
          <Route path="/forgot-password" element={<PasswordRecovery />} />
          <Route path="/reset-password" element={<PasswordRecovery reset />} />
          <Route element={<RequireRole allowedRoles={['admin', 'teacher', 'ngo']} />}>
            <Route path="/students" element={<Students />} />
            <Route path="/students/:studentId" element={<StudentDetails />} />
          </Route>
          <Route element={<RequireRole allowedRoles={['ngo']} />}>
            <Route path="/ngo-dashboard" element={<NGODashboard />} />
          </Route>
          <Route element={<RequireRole allowedRoles={['admin', 'teacher']} />}>
            <Route path="/prediction/manual" element={<ManualPrediction />} />
            <Route path="/risk-analysis" element={<RiskAnalysis />} />
            <Route path="/interventions" element={<Interventions />} />
            <Route path="/analytics" element={<Analytics />} />
            <Route path="/reports" element={<Reports />} />
          </Route>
          <Route element={<RequireRole allowedRoles={['teacher']} />}>
            <Route path="/teacher/students/new" element={<TeacherStudentEntry />} />
          </Route>
          <Route element={<RequireRole allowedRoles={['admin']} />}>
            <Route path="/settings" element={<Settings />} />
            <Route path="/support-requests" element={<SupportRequests />} />
          </Route>
          <Route element={<RequireRole allowedRoles={['student']} />}>
            <Route path="/student" element={<StudentHome />} />
          </Route>
          <Route path="*" element={<NotFound />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
