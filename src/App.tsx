import { Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from './components/AppShell';
import { AdminRoute } from './components/AdminRoute';
import { AdminShell } from './components/AdminShell';
import { ProtectedRoute } from './components/ProtectedRoute';
import { AdminProvider } from './context/AdminContext';
import type { LmsAdminProvider } from './data/provider';
import { AccountPage } from './pages/AccountPage';
import { LoginPage, ResetPage } from './pages/AuthPages';
import { DashboardPage } from './pages/DashboardPage';
import { LessonPage } from './pages/LessonPage';
import { ModulePage } from './pages/ModulePage';
import { QuizPage } from './pages/QuizPage';
import {
  AdminAuditPage,
  AdminCoursePage,
  AdminCoursesPage,
  AdminLearnersPage,
} from './pages/AdminPages';

export function App({ adminProvider }: { adminProvider?: LmsAdminProvider }) {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/reset" element={<ResetPage />} />
      <Route
        element={
          <AdminRoute>
            <AdminProvider provider={adminProvider}>
              <AdminShell />
            </AdminProvider>
          </AdminRoute>
        }
      >
        <Route path="/admin" element={<AdminCoursesPage />} />
        <Route path="/admin/course/:id" element={<AdminCoursePage />} />
        <Route path="/admin/learners" element={<AdminLearnersPage />} />
        <Route path="/admin/audit" element={<AdminAuditPage />} />
      </Route>
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
  );
}
