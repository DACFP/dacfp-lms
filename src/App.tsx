import { Suspense, lazy } from 'react';
import { Route, Routes } from 'react-router-dom';
import { AdminRoute } from './components/AdminRoute';
import { ProtectedRoute } from './components/ProtectedRoute';
import { RouteFocus } from './components/RouteFocus';
import { BootSkeleton } from './components/Skeletons';
import type { LmsAdminProvider } from './data/provider';
import { LoginPage, ResetPage } from './pages/AuthPages';

// Authentication stays in the entry chunk. The learner application and
// operator console are independent route chunks, and LearnerApp gives the
// player/survey lesson route its own second-level lazy boundary.
const AdminApp = lazy(() => import('./pages/AdminApp'));
const LearnerApp = lazy(() => import('./pages/LearnerApp'));

export function App({ adminProvider }: { adminProvider?: LmsAdminProvider }) {
  return (
    <>
      <RouteFocus />
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/reset" element={<ResetPage />} />
        <Route
          path="/admin/*"
          element={
            <AdminRoute>
              <Suspense fallback={<BootSkeleton />}>
                <AdminApp adminProvider={adminProvider} />
              </Suspense>
            </AdminRoute>
          }
        />
        <Route path="/*" element={
          <ProtectedRoute>
            <Suspense fallback={<BootSkeleton />}>
              <LearnerApp />
            </Suspense>
          </ProtectedRoute>
        } />
      </Routes>
    </>
  );
}
