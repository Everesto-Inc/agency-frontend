import { Clock, RefreshCw } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { useAuth, useMe } from '@/auth/AuthContext';
import { Alert, Button } from '@/components/ui';

/** Signed in, but plan "none": an admin has to activate the account first. */
export default function PendingPage() {
  const me = useMe();
  const { reloadMe } = useAuth();
  const [busy, setBusy] = useState(false);
  const [still, setStill] = useState(false);

  const check = async () => {
    setBusy(true);
    try { await reloadMe(); setStill(true); } finally { setBusy(false); }
  };

  return (
    <div className="mx-auto mt-6 max-w-lg">
      <div className="list-col p-2">
        <h2 className="px-2 pb-2 pt-1 text-sm font-semibold">Waiting for activation</h2>
        <article className="card p-5 sm:p-6">
          <span className="mb-3 flex gap-1"><span className="h-2 w-10 rounded-full bg-label-yellow" /><span className="h-2 w-10 rounded-full bg-label-blue" /></span>
          <div className="flex items-start gap-3">
            <Clock className="mt-0.5 size-6 shrink-0 text-brand" aria-hidden />
            <div>
              <h1 className="text-lg font-bold">Your account is almost ready</h1>
              <p className="mt-1 text-sm text-muted">
                Every new account is checked by an admin before it can ask questions.
                You're signed in as <strong className="text-ink">{me.email}</strong> — as soon as an admin
                activates you, the assistants appear here.
              </p>
            </div>
          </div>
          {still && <div className="mt-4"><Alert tone="info">Not activated yet — try again a little later.</Alert></div>}
          <div className="mt-5 flex flex-wrap gap-2">
            <Button onClick={check} busy={busy}><RefreshCw className="size-4" /> Check again</Button>
            <Link to="/account" className="inline-flex min-h-10 items-center rounded-lg px-4 text-sm font-semibold hover:bg-black/5 dark:hover:bg-white/10">Account settings</Link>
          </div>
        </article>
      </div>
    </div>
  );
}
