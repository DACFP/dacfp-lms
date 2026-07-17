import { BookOpen, ClipboardList, GraduationCap, LogOut, Users } from 'lucide-react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

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
      <a className="skip-link" href="#admin-main">Skip to admin content</a>
      <header className="border-b border-white/10 bg-brand-navy text-white">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-4 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8">
          <div className="flex items-center gap-3">
            <div className="grid size-11 place-items-center rounded-xl bg-white/10"><GraduationCap aria-hidden="true" /></div>
            <div><p className="font-bold">DACFP LMS</p><p className="text-xs font-semibold uppercase tracking-[0.14em] text-white/65">Operator console</p></div>
            <span className="rounded-md border border-brand-gold/60 bg-brand-gold/15 px-2 py-1 text-xs font-bold text-brand-gold">Operator</span>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <nav aria-label="Admin" className="flex flex-wrap gap-1">
              {links.map(({ to, label, icon: Icon, end }) => (
                <NavLink key={to} end={end} to={to} className={({ isActive }) => `flex min-h-11 items-center gap-2 rounded-lg px-3 text-sm font-bold ${isActive ? 'bg-white text-brand-navy' : 'text-white/75 hover:bg-white/10 hover:text-white'}`}>
                  <Icon size={17} aria-hidden="true" />{label}
                </NavLink>
              ))}
            </nav>
            <button className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-white/20 px-3 text-sm font-bold" type="button" onClick={() => void logout().then(() => navigate('/login', { replace: true }))}>
              <LogOut size={17} aria-hidden="true" /> Sign out {session?.user.email}
            </button>
          </div>
        </div>
        <div className="h-1 bg-gradient-to-r from-brand-royal via-brand-royal-bright to-brand-gold" />
      </header>
      <main id="admin-main" className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8" tabIndex={-1}><Outlet /></main>
    </div>
  );
}
