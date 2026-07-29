import { Suspense, lazy } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from '../components/AppShell';
import { PageSkeleton } from '../components/Skeletons';
import { AccountPage } from './AccountPage';
import { CertificatePage } from './CertificatePage';
import { CompletionPage } from './CompletionPage';
import { DashboardPage } from './DashboardPage';
import { ModulePage } from './ModulePage';
import { QuizPage } from './QuizPage';

// LessonPage owns the secure player, survey runtime, and markdown reading
// surface. Keeping it behind its route boundary avoids loading those heavier
// paths for dashboard, account, module, quiz, and credential visits.
const LessonPage = lazy(() => import('./LessonPage').then((module) => ({
  default: module.LessonPage,
})));

export default function LearnerApp() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/course/:slug/module/:n" element={<ModulePage />} />
        <Route path="/lesson/:id" element={
          <Suspense fallback={<PageSkeleton />}>
            <LessonPage />
          </Suspense>
        } />
        <Route path="/quiz/:moduleId" element={<QuizPage />} />
        <Route path="/account" element={<AccountPage />} />
        <Route path="/completion/:slug" element={<CompletionPage />} />
        <Route path="/credentials" element={<CertificatePage />} />
        <Route path="/certificate" element={<CertificatePage />} />
      </Route>
      <Route path="/" element={<Navigate replace to="/dashboard" />} />
      <Route path="*" element={<Navigate replace to="/dashboard" />} />
    </Routes>
  );
}
