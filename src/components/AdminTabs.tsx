import clsx from 'clsx';
import { FlaskConical, Gauge, Settings2, ShieldAlert, Shield, Users } from 'lucide-react';
import { NavLink } from 'react-router';

const TABS = [
  { to: '/admin', label: 'Overview', icon: Shield, end: true },
  { to: '/admin/users', label: 'Users', icon: Users },
  { to: '/admin/guardrails', label: 'Guardrails', icon: ShieldAlert },
  { to: '/admin/quality', label: 'Quality', icon: Gauge },
  { to: '/admin/settings', label: 'Settings', icon: Settings2 },
  { to: '/admin/experiments', label: 'Experiments', icon: FlaskConical },
];

/** The admin pages, as chips under the board header (one "Admin" item in the main nav). */
export function AdminTabs() {
  return (
    <nav className="-mx-1 mb-3 flex gap-1.5 overflow-x-auto px-1 pb-1" aria-label="Admin">
      {TABS.map(({ to, label, icon: Icon, end }) => (
        <NavLink key={to} to={to} end={end} className={({ isActive }) => clsx(
          'inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-sm font-semibold transition',
          isActive ? 'bg-white text-ink shadow' : 'bg-white/20 text-white hover:bg-white/30',
        )}><Icon className="size-4" />{label}</NavLink>
      ))}
    </nav>
  );
}
