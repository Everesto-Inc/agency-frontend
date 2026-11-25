import { Download } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { api, unwrap } from '@/api/client';
import { messageOf } from '@/api/errors';
import { isAdmin, useAuth, useMe } from '@/auth/AuthContext';
import { Alert, Board, BoardHeader, Button, Card, Input, Label, List } from '@/components/ui';

export default function AccountPage() {
  const me = useMe();
  return (
    <>
      <BoardHeader title="Account" sub={me.email} />
      <Board>
        <List title="Profile">
          <Card labels={['blue']}>
            <dl className="space-y-2 text-sm">
              <Row k="Email"><span className="break-all">{me.email}</span></Row>
              <Row k="Plan"><Label color={me.plan === 'none' ? 'yellow' : 'green'}>{me.plan_display_name}</Label></Row>
              <Row k="Role">{isAdmin(me) ? <Label color="purple">admin</Label> : me.role}</Row>
              <Row k="Assistants">{me.entitled_topics.length ? me.entitled_topics.join(', ') : 'none yet'}</Row>
            </dl>
          </Card>
        </List>
        <List title="Password"><PasswordCard /></List>
        <List title="Your data"><ExportCard /></List>
      </Board>
    </>
  );
}

function Row({ k, children }: { k: string; children: React.ReactNode }) {
  return <div className="flex justify-between gap-3"><dt className="text-muted">{k}</dt><dd className="text-right font-medium">{children}</dd></div>;
}

function PasswordCard() {
  const { logout } = useAuth();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      await unwrap(api.PUT('/api/v1/auth/me/password', { body: { current_password: current, new_password: next } }));
      setDone(true);
      setTimeout(logout, 2500); // every session was revoked — sign in again with the new password
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card labels={['orange']}>
      {done ? <Alert tone="ok">Password changed. Signing you out — sign in with the new one.</Alert> : (
        <form onSubmit={submit} className="space-y-3">
          <Input label="Current password" type="password" autoComplete="current-password" required value={current} onChange={e => setCurrent(e.target.value)} />
          <Input label="New password" type="password" autoComplete="new-password" minLength={10} required hint="At least 10 characters. You'll be signed out everywhere." value={next} onChange={e => setNext(e.target.value)} />
          {error && <Alert>{error}</Alert>}
          <Button type="submit" busy={busy} className="w-full">Change password</Button>
        </form>
      )}
    </Card>
  );
}

function ExportCard() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const download = async () => {
    setBusy(true); setError(null);
    try {
      const data = await unwrap(api.GET('/api/v1/auth/me/export'));
      const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
      const a = Object.assign(document.createElement('a'), { href: url, download: 'agency-my-data.json' });
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card labels={['green']}>
      <p className="text-sm text-muted">Everything the agency stores about you — account, questions, usage — as one JSON file.</p>
      {error && <div className="mt-3"><Alert>{error}</Alert></div>}
      <Button variant="subtle" onClick={download} busy={busy} className="mt-3 w-full bg-black/5 dark:bg-white/10"><Download className="size-4" /> Download my data</Button>
    </Card>
  );
}
