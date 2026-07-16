import { Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from './components/AppShell';
import { ProtectedRoute } from './components/ProtectedRoute';
import { AccountPage } from './pages/AccountPage';
import { LoginPage, ResetPage } from './pages/AuthPages';
import { DashboardPage } from './pages/DashboardPage';
import { LessonPage } from './pages/LessonPage';
import { ModulePage } from './pages/ModulePage';
import { QuizPage } from './pages/QuizPage';

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/reset" element={<ResetPage />} />
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
