import { BookOpen, LayoutDashboard, LogOut, UserRound } from 'lucide-react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useLms } from '../context/LmsContext';
import type { LearnerStateKey } from '../data/types';
import { courseUnlocked } from '../engine';
import { enrollmentAccessState } from '../lib/progress';
import { learnerPath } from './common';
import { TermsModal } from './TermsModal';

const navItems = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/account', label: 'Account', icon: UserRound },
];

export function AppShell() {
  const navigate = useNavigate();
  const { session, logout } = useAuth();
  const {
    catalog,
    learners,
    snapshot,
    selectedLearner,
    selectLearner,
    acceptTerms,
  } = useLms();
  const gatedEnrollment = snapshot.enrollments.find((enrollment) => {
    const course = catalog.courses.find((item) => item.id === enrollment.course_id);
    return (
      course?.requires_terms_acceptance &&
      !enrollment.terms_accepted_at &&
      enrollmentAccessState(enrollment) === 'active' &&
      courseUnlocked(course, snapshot.completions)
    );
  });
  const gatedCourse = gatedEnrollment
    ? catalog.courses.find((course) => course.id === gatedEnrollment.course_id)
    : null;

  const signOut = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  return (
    <div className="min-h-dvh bg-dacfp-wash text-dacfp-ink">
      <a className="skip-link" href="#main-content">
        Skip to main content
      </a>
      <header className="border-b border-white/10 bg-gradient-to-b from-brand-navy to-brand-navy-deep text-white shadow-sm">
        <div className="mx-auto flex max-w-7xl flex-col gap-5 px-4 py-5 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8">
          <div className="flex items-center gap-3">
            <div className="grid size-11 place-items-center rounded-xl border border-white/20 bg-white/10">
              <BookOpen aria-hidden="true" size={23} />
            </div>
            <div>
              <p className="text-lg font-bold tracking-tight">DACFP</p>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-white/65">Learning portal</p>
            </div>
          </div>

          <div className="flex flex-col gap-4 md:flex-row md:items-center">
            <nav aria-label="Primary" className="flex flex-wrap items-center gap-2">
              {navItems.map(({ to, label, icon: Icon }) => (
                <NavLink
                  key={to}
                  to={learnerPath(to, selectedLearner)}
                  className={({ isActive }) =>
                    `flex min-h-11 items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-gold ${
                      isActive ? 'bg-white text-brand-navy' : 'text-white/80 hover:bg-white/10 hover:text-white'
                    }`
                  }
                >
                  <Icon size={18} aria-hidden="true" />
                  {label}
                </NavLink>
              ))}
            </nav>
            {learners.length > 1 ? (
              <label className="flex min-h-11 items-center gap-3 rounded-lg border border-white/20 bg-white/10 px-3 text-sm">
                <span className="font-semibold text-white/70">Preview state</span>
                <select
                  className="min-h-9 max-w-52 rounded-md border border-white/20 bg-brand-navy px-2 text-sm font-semibold text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-gold"
                  value={selectedLearner}
                  onChange={(event) => selectLearner(event.target.value as LearnerStateKey)}
                  aria-label="Select synthetic learner state"
                >
                  {learners.map((learner) => (
                    <option key={learner.id} value={learner.id}>
                      {learner.label}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <p className="max-w-56 truncate text-sm text-white/70" title={session?.user.email}>
                {session?.user.email}
              </p>
            )}
            <button
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-white/20 px-3 py-2 text-sm font-semibold text-white/80 hover:bg-white/10 hover:text-white"
              type="button"
              onClick={() => void signOut()}
              aria-label={`Sign out${session?.user.email ? ` ${session.user.email}` : ''}`}
            >
              <LogOut size={17} aria-hidden="true" />
              <span>Sign out</span>
            </button>
          </div>
        </div>
        <div className="h-1 bg-gradient-to-r from-brand-royal via-brand-royal-bright to-brand-gold" />
      </header>

      <main id="main-content" className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 lg:py-12" tabIndex={-1}>
        <Outlet />
      </main>

      <footer className="border-t border-dacfp-line bg-white">
        <div className="mx-auto flex max-w-7xl flex-col gap-1 px-4 py-6 text-sm text-dacfp-slate sm:px-6 lg:px-8">
          <p className="font-semibold text-brand-navy">DACFP learning portal · sandbox preview</p>
          <p>Synthetic learner data only. Learning access and designation status are governed separately.</p>
        </div>
      </footer>

      {gatedEnrollment && gatedCourse ? (
        <TermsModal course={gatedCourse} enrollment={gatedEnrollment} onAccept={acceptTerms} />
      ) : null}
    </div>
  );
}
