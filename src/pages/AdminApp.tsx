import { Suspense, lazy } from 'react';
import { Route, Routes } from 'react-router-dom';
import { AdminShell } from '../components/AdminShell';
import { PageSkeleton } from '../components/Skeletons';
import { AdminProvider } from '../context/AdminContext';
import type { LmsAdminProvider } from '../data/provider';
import {
  AdminAuditPage,
  AdminCoursePage,
  AdminCoursesPage,
  AdminLearnersPage,
  AdminNotFoundPage,
} from './AdminPages';

const CeReportingPage = lazy(() => import('./CeReportingPage').then((module) => ({
  default: module.CeReportingPage,
})));

/**
 * The whole operator console as one lazy-loadable module (M-12).
 *
 * Default-exported and the sole entry point for /admin/*, so React.lazy in
 * App.tsx pulls the admin pages, the admin context and the CSV tooling out of
 * the learner bundle in a single chunk. Learners never execute any of it, so
 * they should never download it.
 *
 * The guard (AdminRoute) deliberately stays in App.tsx, outside the lazy
 * boundary — authorisation must not be something you can defer.
 */
export default function AdminApp({ adminProvider }: { adminProvider?: LmsAdminProvider }) {
  return (
    <AdminProvider provider={adminProvider}>
      <Routes>
        <Route element={<AdminShell />}>
          <Route index element={<AdminCoursesPage />} />
          <Route path="course/:id" element={<AdminCoursePage />} />
          <Route path="learners" element={<AdminLearnersPage />} />
          <Route path="ce-reporting" element={<Suspense fallback={<PageSkeleton />}><CeReportingPage /></Suspense>} />
          <Route path="audit" element={<AdminAuditPage />} />
          <Route path="*" element={<AdminNotFoundPage />} />
        </Route>
      </Routes>
    </AdminProvider>
  );
}
