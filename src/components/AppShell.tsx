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
import { enrollmentAccessState } from '../lib/progress';
import { BrandLockup } from './BrandLockup';
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

  const signOut = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  return (
    <div className="min-h-dvh bg-dacfp-wash text-dacfp-navy">
      <a className="skip-link" href="#main-content">
        Skip to main content
      </a>

      {/* brief #13: one row at every width. The old header stacked into three
          rows on a phone (lockup, nav, then account) and ate the fold before
          any course was visible. Everything past the lockup collapses into a
          single overflow control below md. */}
      <header className="on-navy sticky top-0 z-40 bg-dacfp-navy text-white shadow-sm">
        <div className="mx-auto flex h-16 max-w-shell items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
          <Link
            to="/dashboard"
            className="shrink-0 rounded-md"
            aria-label="DACFP learning portal — go to dashboard"
          >
            <BrandLockup surface="navy" priority className="h-9 w-auto sm:h-10" />
          </Link>

          <nav aria-label="Primary" className="hidden items-center gap-1 md:flex">
            {navItems.map(({ to, label, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) =>
                  `flex min-h-11 items-center gap-2 rounded-lg px-3 text-sm font-semibold transition-colors ${
                    isActive ? 'bg-white text-dacfp-navy' : 'text-white/80 hover:bg-white/10 hover:text-white'
                  }`
                }
              >
                <Icon className="size-icon-sm" aria-hidden="true" />
                {label}
              </NavLink>
            ))}
          </nav>

          <div className="hidden items-center gap-3 md:flex">
            <p className="max-w-48 truncate text-sm text-white/70" title={session?.user.email}>
              {session?.user.email}
            </p>
            <button
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-white/20 px-3 text-sm font-semibold text-white/80 transition-colors hover:bg-white/10 hover:text-white"
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
                className="inline-flex size-11 items-center justify-center rounded-lg border border-white/20 text-white transition-colors hover:bg-white/10 md:hidden"
                aria-label="Open menu"
              >
                <Menu className="size-icon-md" aria-hidden="true" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel className="truncate font-normal text-muted-foreground">
                {session?.user.email}
              </DropdownMenuLabel>
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
        <div className="brand-strip h-1" />
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
