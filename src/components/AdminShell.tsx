import { BookOpen, ClipboardList, LogOut, Menu, Users } from 'lucide-react';
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
import { BrandLockup } from './BrandLockup';

const links = [
  { to: '/admin', label: 'Courses', icon: BookOpen, end: true },
  { to: '/admin/learners', label: 'Learners', icon: Users, end: false },
  { to: '/admin/audit', label: 'Audit trail', icon: ClipboardList, end: false },
];

export function AdminShell() {
  const { session, logout } = useAuth();
  const navigate = useNavigate();
  const signOut = () => void logout().then(() => navigate('/login', { replace: true }));

  return (
    <div className="min-h-dvh bg-dacfp-wash">
      <a className="skip-link" href="#main-content">Skip to admin content</a>
      {/* Same one-row compressed chrome as the learner shell (O2 brief #13), so
          the admin reads as the same product's back office. */}
      <header className="on-navy sticky top-0 z-40 bg-dacfp-navy text-white shadow-sm">
        <div className="mx-auto flex h-16 max-w-shell items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <Link to="/admin" className="shrink-0 rounded-md" aria-label="DACFP operator console — courses">
              <BrandLockup surface="navy" priority className="h-9 w-auto" />
            </Link>
            {/* gold-hi, not raw gold: small bold text on navy is 8.30:1 (raw
                gold is 3.80:1, large-text/UI only). */}
            <span className="hidden shrink-0 rounded-md border border-dacfp-gold/60 bg-dacfp-gold/15 px-2 py-1 text-xs font-bold text-dacfp-gold-hi sm:inline">
              Operator
            </span>
          </div>

          <nav aria-label="Admin" className="hidden items-center gap-1 md:flex">
            {links.map(({ to, label, icon: Icon, end }) => (
              <NavLink key={to} end={end} to={to} className={({ isActive }) => `flex min-h-11 items-center gap-2 rounded-lg px-3 text-sm font-bold transition-colors ${isActive ? 'bg-white text-dacfp-navy' : 'text-white/75 hover:bg-white/10 hover:text-white'}`}>
                <Icon className="size-icon-sm" aria-hidden="true" />{label}
              </NavLink>
            ))}
          </nav>

          <div className="hidden items-center gap-3 md:flex">
            <p className="max-w-40 truncate text-sm text-white/70" title={session?.user.email}>{session?.user.email}</p>
            <button className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-white/20 px-3 text-sm font-bold transition-colors hover:bg-white/10" type="button" onClick={signOut} aria-label={`Sign out${session?.user.email ? ` ${session.user.email}` : ''}`}>
              <LogOut className="size-icon-sm" aria-hidden="true" /> Sign out
            </button>
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button type="button" className="inline-flex size-11 items-center justify-center rounded-lg border border-white/20 text-white transition-colors hover:bg-white/10 md:hidden" aria-label="Open menu">
                <Menu className="size-icon-md" aria-hidden="true" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel className="truncate font-normal text-muted-foreground">{session?.user.email}</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {links.map(({ to, label, icon: Icon }) => (
                <DropdownMenuItem key={to} asChild className="min-h-11">
                  <Link to={to}><Icon className="size-icon-sm" aria-hidden="true" />{label}</Link>
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem className="min-h-11" onSelect={signOut}>
                <LogOut className="size-icon-sm" aria-hidden="true" />Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <div className="brand-strip h-1" />
      </header>
      {/* #main-content, matching AppShell: RouteFocus (brief #11) targets one id
          across both shells, so admin route changes move focus too. */}
      <main id="main-content" className="mx-auto max-w-shell px-4 py-8 sm:px-6 lg:px-8" tabIndex={-1}><Outlet /></main>
    </div>
  );
}
