import clsx from 'clsx';
import { BarChart3, LogOut, MessageSquare, Moon, Shield, Sun, User } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { NavLink, Outlet } from 'react-router';
import { isActivated, isAdmin, useAuth, useMe } from '@/auth/AuthContext';
import { Label } from './ui';

type Item = { to: string; label: string; icon: ReactNode; end?: boolean };

function useTheme() {
  const [dark, setDark] = useState(() => document.documentElement.classList.contains('dark'));
  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
    try { localStorage.setItem('agency.theme', dark ? 'dark' : 'light'); } catch { /* ignore */ }
  }, [dark]);
  return [dark, () => setDark(d => !d)] as const;
}

/** App frame: a header bar over the gradient board; tabs in the header (tablet/desktop) or at the bottom (phone). */
export function Layout() {
  const me = useMe();
  const { logout } = useAuth();
  const [dark, toggle] = useTheme();
  const items: Item[] = [
    ...(isActivated(me) ? [
      { to: '/', label: 'Chat', icon: <MessageSquare className="size-5" />, end: true },
      { to: '/usage', label: 'Usage', icon: <BarChart3 className="size-5" /> },
    ] : []),
    { to: '/account', label: 'Account', icon: <User className="size-5" /> },
    ...(isAdmin(me) ? [
      { to: '/admin', label: 'Admin', icon: <Shield className="size-5" /> },   // tabs inside: AdminTabs
    ] : []),
  ];

  return (
    <div className="board-bg flex min-h-dvh flex-col">
      <header className="sticky top-0 z-20 flex h-14 items-center gap-2 bg-black/25 px-3 text-white backdrop-blur-md sm:px-4">
        <Brand />
        <nav className="ml-4 hidden items-center gap-1 md:flex" aria-label="Main">
          {items.map(i => (
            <NavLink key={i.to} to={i.to} end={i.end} className={({ isActive }) => clsx(
              'flex h-9 items-center gap-2 rounded-lg px-3 text-sm font-semibold transition',
              isActive ? 'bg-white text-ink' : 'text-white/90 hover:bg-white/20',
            )}>{i.icon}{i.label}</NavLink>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-1">
          <span className="mr-1 hidden items-center gap-2 lg:flex">
            <span className="max-w-48 truncate text-sm text-white/90" title={me.email}>{me.email}</span>
            <Label color={isActivated(me) ? 'green' : 'yellow'}>{me.plan_display_name}</Label>
            {isAdmin(me) && <Label color="purple">admin</Label>}
          </span>
          <IconButton label={dark ? 'Light mode' : 'Dark mode'} onClick={toggle}>{dark ? <Sun className="size-4" /> : <Moon className="size-4" />}</IconButton>
          <IconButton label="Sign out" onClick={logout}><LogOut className="size-4" /></IconButton>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1400px] flex-1 px-3 py-4 pb-24 sm:px-5 md:pb-6">
        <Outlet />
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-20 flex bg-panel pb-[env(safe-area-inset-bottom)] shadow-[0_-1px_0_var(--color-line)] md:hidden" aria-label="Main">
        {items.map(i => (
          <NavLink key={i.to} to={i.to} end={i.end} className={({ isActive }) => clsx(
            'flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-semibold',
            isActive ? 'text-brand' : 'text-muted',
          )}>{i.icon}{i.label}</NavLink>
        ))}
      </nav>
    </div>
  );
}

export function Brand({ big }: { big?: boolean }) {
  return (
    <div className={clsx('flex items-center gap-2 font-extrabold tracking-tight', big ? 'text-2xl' : 'text-lg')}>
      <Logo className={big ? 'size-9' : 'size-7'} />
      <span>agency</span>
    </div>
  );
}

/** Own mark: three stacked cards. */
export function Logo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <rect width="32" height="32" rx="8" fill="white" fillOpacity=".95" />
      <rect x="6" y="7" width="8" height="18" rx="2.5" fill="#1f5bd8" />
      <rect x="18" y="7" width="8" height="11" rx="2.5" fill="#7b3fe4" />
    </svg>
  );
}

function IconButton({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" onClick={onClick} aria-label={label} title={label}
      className="inline-flex size-9 items-center justify-center rounded-lg text-white/90 hover:bg-white/20">
      {children}
    </button>
  );
}
