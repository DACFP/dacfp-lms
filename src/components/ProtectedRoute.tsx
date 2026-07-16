import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { session, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <main className="grid min-h-dvh place-items-center bg-dacfp-wash px-6">
        <div className="text-center" role="status" aria-live="polite">
          <div className="mx-auto size-9 animate-spin rounded-full border-4 border-dacfp-line border-t-brand-royal motion-reduce:animate-none" />
          <p className="mt-4 text-sm font-bold text-brand-navy">
            Checking your secure session…
          </p>
        </div>
      </main>
    );
  }

  if (!session) {
    return (
      <Navigate
        replace
        to="/login"
        state={{ from: `${location.pathname}${location.search}` }}
      />
    );
  }

  return children;
}
