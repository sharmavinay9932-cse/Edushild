import React from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.jsx';

export default function RequireRole({ allowedRoles }) {
  const { user } = useAuth();
  const location = useLocation();

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  if (!allowedRoles.includes(user.role)) {
    const destination = user.role === 'student'
      ? '/student'
      : user.role === 'ngo'
        ? '/ngo-dashboard'
        : '/';
    return <Navigate to={destination} replace />;
  }

  return <Outlet />;
}
