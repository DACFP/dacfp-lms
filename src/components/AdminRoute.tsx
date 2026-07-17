import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export function AdminRoute({ children }: { children: ReactNode }) {
  const { session, loading } = useAuth();
  const location = useLocation();
  if (loading) {
    return <main className="grid min-h-dvh place-items-center bg-dacfp-wash" role="status">Checking operator access…</main>;
  }
  if (!session) {
    return <Navigate replace to="/login" state={{ from: location.pathname }} />;
  }
  if (session.user.role !== 'operator') return <Navigate replace to="/dashboard" />;
  return children;
}
