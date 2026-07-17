import { BookOpen, ClipboardList, GraduationCap, LogOut, Users } from 'lucide-react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { IconTile } from './IconTile';

const links = [
  { to: '/admin', label: 'Courses', icon: BookOpen, end: true },
  { to: '/admin/learners', label: 'Learners', icon: Users, end: false },
  { to: '/admin/audit', label: 'Audit trail', icon: ClipboardList, end: false },
];

export function AdminShell() {
  const { session, logout } = useAuth();
  const navigate = useNavigate();
  return (
    <div className="min-h-dvh bg-dacfp-wash">
      <a className="skip-link" href="#main-content">Skip to admin content</a>
      <header className="on-navy border-b border-white/10 bg-dacfp-navy text-white">
        <div className="mx-auto flex max-w-shell flex-col gap-4 px-4 py-4 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8">
          <div className="flex items-center gap-3">
            <IconTile icon={GraduationCap} size="md" tone="on-navy" />
            <div><p className="font-bold">DACFP LMS</p><p className="text-xs font-semibold uppercase tracking-eyebrow text-white/65">Operator console</p></div>
            {/* gold-hi, not raw gold: this is small bold text on a navy ground,
                where raw gold is 3.80:1 (large-text/UI only). gold-hi is 8.30:1. */}
            <span className="rounded-md border border-dacfp-gold/60 bg-dacfp-gold/15 px-2 py-1 text-xs font-bold text-dacfp-gold-hi">Operator</span>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <nav aria-label="Admin" className="flex flex-wrap gap-1">
              {links.map(({ to, label, icon: Icon, end }) => (
                <NavLink key={to} end={end} to={to} className={({ isActive }) => `flex min-h-11 items-center gap-2 rounded-lg px-3 text-sm font-bold ${isActive ? 'bg-white text-dacfp-navy' : 'text-white/75 hover:bg-white/10 hover:text-white'}`}>
                  <Icon className="size-icon-sm" aria-hidden="true" />{label}
                </NavLink>
              ))}
            </nav>
            <button className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-white/20 px-3 text-sm font-bold" type="button" onClick={() => void logout().then(() => navigate('/login', { replace: true }))}>
              <LogOut className="size-icon-sm" aria-hidden="true" /> Sign out {session?.user.email}
            </button>
          </div>
        </div>
        <div className="brand-strip h-1" />
      </header>
      {/* #main-content, matching AppShell: RouteFocus (brief #11) targets one id
          across both shells, so admin route changes move focus too. */}
      <main id="main-content" className="mx-auto max-w-shell px-4 py-8 sm:px-6 lg:px-8" tabIndex={-1}><Outlet /></main>
    </div>
  );
}
