import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Ban, Check, KeyRound, MoreHorizontal, Search } from 'lucide-react';
import { useMemo, useState, type FormEvent } from 'react';
import { api, unwrap, type Schemas } from '@/api/client';
import { messageOf } from '@/api/errors';
import { useMe } from '@/auth/AuthContext';
import { Alert, Board, BoardHeader, Button, Card, Label, List, Spinner } from '@/components/ui';
import { date } from '@/lib/format';
import { EmptyCard } from '../UsagePage';

type Account = Schemas['AccountSummary'];
const PLANS = ['free', 'pro'] as const; // config/plans.yaml (none = waiting, internal = service accounts)

/** Accounts as a board: Waiting for activation → Active → Disabled. */
export default function AdminUsersPage() {
  const [q, setQ] = useState('');
  const users = useQuery({ queryKey: ['admin-users'], queryFn: () => unwrap(api.GET('/api/v1/admin/users', { params: { query: { limit: 500 } } })) });

  const lists = useMemo(() => {
    const all = (users.data ?? []).filter(u => u.email.toLowerCase().includes(q.trim().toLowerCase()));
    return {
      waiting: all.filter(u => u.is_active && u.plan === 'none'),
      active: all.filter(u => u.is_active && u.plan !== 'none'),
      disabled: all.filter(u => !u.is_active),
    };
  }, [users.data, q]);

  return (
    <>
      <BoardHeader
        title="Users"
        sub="New accounts wait here until you activate them."
        action={
          <label className="flex h-9 items-center gap-2 rounded-lg bg-white/20 px-3 text-white focus-within:bg-white/30">
            <Search className="size-4" aria-hidden />
            <span className="sr-only">Filter by email</span>
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="Filter by email" className="w-44 bg-transparent text-sm placeholder:text-white/70 outline-none" />
          </label>
        }
      />
      {users.isPending && <Spinner light />}
      {users.error && <Alert>{messageOf(users.error)}</Alert>}
      {users.data && (
        <Board>
          <List title="Waiting for activation" count={lists.waiting.length}>
            {lists.waiting.length === 0 && <EmptyCard>Nobody waiting 🎉</EmptyCard>}
            {lists.waiting.map(u => <UserCard key={u.id} u={u} />)}
          </List>
          <List title="Active" count={lists.active.length}>
            {lists.active.map(u => <UserCard key={u.id} u={u} />)}
          </List>
          <List title="Disabled" count={lists.disabled.length}>
            {lists.disabled.length === 0 && <EmptyCard>None</EmptyCard>}
            {lists.disabled.map(u => <UserCard key={u.id} u={u} />)}
          </List>
        </Board>
      )}
    </>
  );
}

/** Compact card: email, labels, date. Waiting → one Activate button; everything else behind ⋯ (like a card's menu). */
function UserCard({ u }: { u: Account }) {
  const me = useMe();
  const qc = useQueryClient();
  const [menu, setMenu] = useState(false);
  const [reset, setReset] = useState(false);
  const done = () => qc.invalidateQueries({ queryKey: ['admin-users'] });

  const plan = useMutation({
    mutationFn: (p: string) => unwrap(api.PUT('/api/v1/admin/users/{user_id}/plan', { params: { path: { user_id: u.id } }, body: { plan: p } })),
    onSuccess: done,
  });
  const disable = useMutation({
    mutationFn: () => unwrap(api.POST('/api/v1/admin/users/{user_id}/disable', { params: { path: { user_id: u.id } } })),
    onSuccess: done,
  });
  const self = u.id === me.id;
  const service = u.role === 'service';
  const waiting = u.is_active && u.plan === 'none';
  const error = plan.error ?? disable.error;

  return (
    <Card labels={[u.is_active ? (waiting ? 'yellow' : 'green') : 'red', ...(u.role === 'admin' ? ['purple' as const] : [])]}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 break-all font-semibold">{u.email}</div>
        {u.is_active && (
          <button type="button" onClick={() => setMenu(m => !m)} aria-expanded={menu} aria-label={`Actions for ${u.email}`}
            className="-mr-1 -mt-1 inline-flex size-8 shrink-0 items-center justify-center rounded-md text-muted hover:bg-black/5 dark:hover:bg-white/10">
            <MoreHorizontal className="size-4" />
          </button>
        )}
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
        <Label color={waiting ? 'yellow' : u.is_active ? 'green' : 'red'}>{u.plan}</Label>
        {u.role !== 'user' && <Label color="purple">{u.role}</Label>}
        <span className="text-xs text-muted">{self ? 'you · ' : ''}since {date(u.created_at)}</span>
      </div>

      {waiting && (
        <div className="mt-3 flex items-center gap-2">
          <Button busy={plan.isPending && plan.variables === 'free'} onClick={() => plan.mutate('free')} className="min-h-8 px-3">
            <Check className="size-3.5" /> Activate
          </Button>
          <button type="button" onClick={() => plan.mutate('pro')} disabled={plan.isPending} className="text-xs font-semibold text-brand hover:underline">
            as pro
          </button>
        </div>
      )}

      {menu && (
        <div className="mt-3 space-y-1 border-t border-line pt-2">
          {!service && !waiting && PLANS.filter(p => p !== u.plan).map(p => (
            <MenuItem key={p} onClick={() => plan.mutate(p)} busy={plan.isPending}><Check className="size-4" /> Change plan to {p}</MenuItem>
          ))}
          <MenuItem onClick={() => setReset(r => !r)}><KeyRound className="size-4" /> Reset password</MenuItem>
          {!self && (
            <MenuItem danger busy={disable.isPending}
              onClick={() => { if (confirm(`Disable ${u.email}? They are signed out everywhere.`)) disable.mutate(); }}>
              <Ban className="size-4" /> Disable account
            </MenuItem>
          )}
        </div>
      )}
      {reset && <ResetPassword id={u.id} email={u.email} />}
      {error && <div className="mt-2"><Alert>{messageOf(error)}</Alert></div>}
    </Card>
  );
}

function MenuItem({ onClick, children, danger, busy }: { onClick: () => void; children: React.ReactNode; danger?: boolean; busy?: boolean }) {
  return (
    <button type="button" onClick={onClick} disabled={busy}
      className={`flex min-h-9 w-full items-center gap-2 rounded-md px-2 text-left text-sm font-medium hover:bg-black/5 disabled:opacity-50 dark:hover:bg-white/10 ${danger ? 'text-danger' : ''}`}>
      {children}
    </button>
  );
}

function ResetPassword({ id, email }: { id: string; email: string }) {
  const [pw, setPw] = useState(() => suggest());
  const reset = useMutation({
    mutationFn: () => unwrap(api.PUT('/api/v1/admin/users/{user_id}/password', { params: { path: { user_id: id } }, body: { new_password: pw } })),
  });
  const submit = (e: FormEvent) => { e.preventDefault(); reset.mutate(); };

  if (reset.isSuccess) {
    return (
      <div className="mt-3"><Alert tone="ok">
        New password for {email}: <code className="select-all rounded bg-white/60 px-1 dark:bg-black/30">{pw}</code><br />
        Give it to them — they're signed out and can change it under Account.
      </Alert></div>
    );
  }
  return (
    <form onSubmit={submit} className="mt-3 space-y-2 rounded-lg bg-black/5 p-2 dark:bg-white/5">
      <label className="block text-xs font-semibold text-muted" htmlFor={`pw-${id}`}>New password (≥ 10 characters)</label>
      <div className="flex gap-1.5">
        <input id={`pw-${id}`} value={pw} onChange={e => setPw(e.target.value)} minLength={10} required
          className="min-h-9 min-w-0 flex-1 rounded-md border-2 border-line bg-panel px-2 font-mono text-sm focus:border-brand focus:outline-none" />
        <Button type="submit" busy={reset.isPending} className="min-h-9 px-3">Set</Button>
      </div>
      {reset.error && <Alert>{messageOf(reset.error)}</Alert>}
    </form>
  );
}

/** A readable random password (4 groups, no look-alike characters). */
function suggest() {
  const abc = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  const s = Array.from(bytes, b => abc[b % abc.length]).join('');
  return `${s.slice(0, 4)}-${s.slice(4, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}`;
}
