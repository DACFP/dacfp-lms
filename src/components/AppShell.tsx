import { LayoutDashboard, LogOut, Menu, UserRound } from 'lucide-react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useAuth } from '../context/AuthContext';
import { useLms } from '../context/LmsContext';
import { courseUnlocked } from '../engine';
import { courseKind } from '../lib/courseKind';
import { enrollmentAccessState } from '../lib/progress';
import { BrandLockup } from './BrandLockup';
import { formatDate } from './common';
import { DarkBuildOnly } from './DarkBuild';
import { TermsModal } from './TermsModal';

const navItems = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/account', label: 'Account', icon: UserRound },
];

export function AppShell() {
  const navigate = useNavigate();
  const { session, logout } = useAuth();
  const { catalog, snapshot, acceptTerms } = useLms();
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

  /* The mockup's top bar states the enrollment window at all times. This is
     the flagship enrollment's window — display only, derived from state the
     dashboard already renders. */
  const flagshipEnrollment = snapshot.enrollments.find((enrollment) => {
    const course = catalog.courses.find((item) => item.id === enrollment.course_id);
    return course ? courseKind(course) === 'flagship' : false;
  });
  const accessLine = flagshipEnrollment
    ? flagshipEnrollment.expires_at
      ? `Access ${enrollmentAccessState(flagshipEnrollment) === 'expired' ? 'expired' : 'through'} ${formatDate(flagshipEnrollment.expires_at)}`
      : 'No access expiry'
    : null;

  const signOut = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  return (
    <div className="learner-skin min-h-dvh bg-dacfp-wash text-dacfp-navy">
      <a className="skip-link" href="#main-content">
        Skip to main content
      </a>

      {/* T1: the mockup's institutional white bar replaces the navy header —
          light lockup, navy nav with a gold rule under the active item, the
          enrollment window stated plainly on the right. brief #13's one-row
          guarantee is unchanged: everything past the lockup collapses into a
          single overflow control below md. */}
      <header className="sticky top-0 z-40 border-b border-dacfp-line bg-white">
        <div className="mx-auto flex h-16 max-w-shell items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
          <Link
            to="/dashboard"
            className="shrink-0 rounded-md"
            aria-label="DACFP learning portal — go to dashboard"
          >
            <BrandLockup surface="light" priority className="h-9 w-auto sm:h-10" />
          </Link>

          <nav aria-label="Primary" className="hidden h-full items-center gap-7 md:flex">
            {navItems.map(({ to, label }) => (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) =>
                  `flex h-full items-center border-b-2 px-1 text-sm transition-colors ${
                    isActive
                      ? 'border-dacfp-gold-text font-bold text-dacfp-navy'
                      : 'border-transparent font-semibold text-dacfp-gray-text hover:text-dacfp-navy'
                  }`
                }
              >
                {label}
              </NavLink>
            ))}
          </nav>

          <div className="hidden items-center gap-4 md:flex">
            {accessLine ? (
              <p className="text-xs tabular-nums text-dacfp-gray-text">{accessLine}</p>
            ) : (
              <p className="max-w-48 truncate text-xs text-dacfp-gray-text" title={session?.user.email}>
                {session?.user.email}
              </p>
            )}
            <button
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-[0.1875rem] border border-dacfp-line px-3 text-sm font-semibold text-dacfp-gray-text transition-colors hover:border-dacfp-navy hover:text-dacfp-navy"
              type="button"
              onClick={() => void signOut()}
              aria-label={`Sign out${session?.user.email ? ` ${session.user.email}` : ''}`}
            >
              <LogOut className="size-icon-sm" aria-hidden="true" />
              <span>Sign out</span>
            </button>
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="inline-flex size-11 items-center justify-center rounded-[0.1875rem] border border-dacfp-line text-dacfp-navy transition-colors hover:bg-dacfp-wash md:hidden"
                aria-label="Open menu"
              >
                <Menu className="size-icon-md" aria-hidden="true" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel className="truncate font-normal text-muted-foreground">
                {session?.user.email}
              </DropdownMenuLabel>
              {accessLine ? (
                <DropdownMenuLabel className="pt-0 text-xs font-normal text-muted-foreground">
                  {accessLine}
                </DropdownMenuLabel>
              ) : null}
              <DropdownMenuSeparator />
              {navItems.map(({ to, label, icon: Icon }) => (
                <DropdownMenuItem key={to} asChild className="min-h-11">
                  <Link to={to}>
                    <Icon className="size-icon-sm" aria-hidden="true" />
                    {label}
                  </Link>
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem className="min-h-11" onSelect={() => void signOut()}>
                <LogOut className="size-icon-sm" aria-hidden="true" />
                Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <div className="brand-strip h-0.5" />
      </header>

      <main
        id="main-content"
        className="mx-auto max-w-shell px-4 py-8 sm:px-6 lg:px-8 lg:py-12"
        tabIndex={-1}
      >
        <Outlet />
      </main>

      <footer className="mt-8 border-t border-dacfp-line bg-white">
        <div className="mx-auto flex max-w-shell flex-col gap-2 px-4 py-8 text-sm text-dacfp-gray-text sm:px-6 lg:px-8">
          <BrandLockup surface="light" className="h-9 w-auto" />
          <p className="mt-2">
            Learning access and designation status are governed separately.
          </p>
          <DarkBuildOnly>
            <p className="text-xs">
              Sandbox preview · synthetic learner data only.
            </p>
          </DarkBuildOnly>
        </div>
      </footer>

      {gatedEnrollment && gatedCourse ? (
        <TermsModal course={gatedCourse} enrollment={gatedEnrollment} onAccept={acceptTerms} />
      ) : null}
    </div>
  );
}
