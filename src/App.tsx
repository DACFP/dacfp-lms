import { Suspense, lazy } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from './components/AppShell';
import { AdminRoute } from './components/AdminRoute';
import { ProtectedRoute } from './components/ProtectedRoute';
import { RouteFocus } from './components/RouteFocus';
import type { LmsAdminProvider } from './data/provider';
import { AccountPage } from './pages/AccountPage';
import { LoginPage, ResetPage } from './pages/AuthPages';
import { DashboardPage } from './pages/DashboardPage';
import { LessonPage } from './pages/LessonPage';
import { ModulePage } from './pages/ModulePage';
import { QuizPage } from './pages/QuizPage';

// The operator console is a separate chunk (M-12). Nothing on a learner's path
// imports it, so nothing on a learner's path downloads it.
const AdminApp = lazy(() => import('./pages/AdminApp'));

function AdminChunkFallback() {
  return (
    <div className="grid min-h-dvh place-items-center bg-dacfp-wash" role="status">
      <p className="text-sm font-semibold text-dacfp-gray-text">Loading operator console…</p>
    </div>
  );
}

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
              <Suspense fallback={<AdminChunkFallback />}>
                <AdminApp adminProvider={adminProvider} />
              </Suspense>
            </AdminRoute>
          }
        />
        <Route
          element={
            <ProtectedRoute>
              <AppShell />
            </ProtectedRoute>
          }
        >
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/course/:slug/module/:n" element={<ModulePage />} />
          <Route path="/lesson/:id" element={<LessonPage />} />
          <Route path="/quiz/:moduleId" element={<QuizPage />} />
          <Route path="/account" element={<AccountPage />} />
        </Route>
        <Route path="/" element={<Navigate replace to="/dashboard" />} />
        <Route path="*" element={<Navigate replace to="/dashboard" />} />
      </Routes>
    </>
  );
}
