import { useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { messageOf } from '@/api/errors';
import { useAuth } from '@/auth/AuthContext';
import { Brand } from '@/components/Layout';
import { Alert, Button, Input } from '@/components/ui';

const ASSISTANTS = [
  { name: 'EV Helper', line: 'Range, charging and real cost of an electric car — for your country.', color: 'bg-label-green' },
  { name: 'Product Finder', line: 'Finds shops, checks prices, ranks the best offer.', color: 'bg-label-yellow' },
  { name: 'Finance Analyst', line: 'A small team of analysts looks at a stock for you.', color: 'bg-label-purple' },
];

export function AuthPage({ mode }: { mode: 'login' | 'register' }) {
  const { login, register } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isLogin = mode === 'login';

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await (isLogin ? login(email, password) : register(email, password));
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="board-bg min-h-dvh text-white">
      <header className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
        <Brand />
        <Link to={isLogin ? '/register' : '/login'} className="rounded-lg bg-white/15 px-3 py-2 text-sm font-semibold hover:bg-white/25">
          {isLogin ? 'Create account' : 'Sign in'}
        </Link>
      </header>

      <main className="mx-auto grid max-w-6xl items-center gap-10 px-4 pb-12 pt-6 sm:px-6 md:grid-cols-[1.1fr_1fr] md:pt-12">
        <section>
          <h1 className="text-4xl font-extrabold leading-tight tracking-tight sm:text-5xl">
            Ask once.<br />The right assistant answers.
          </h1>
          <p className="mt-4 max-w-lg text-lg text-white/85">
            One question box, several specialist AI assistants behind it. Every answer shows what it cost.
          </p>
          {/* the assistants as a mini board */}
          <div className="mt-8 hidden max-w-lg rounded-2xl bg-white/12 p-3 backdrop-blur-sm sm:block" aria-hidden>
            <div className="mb-2 px-1 text-sm font-semibold text-white/90">Assistants</div>
            <div className="grid gap-2">
              {ASSISTANTS.map((a, i) => (
                <div key={a.name} className="card p-3 text-ink" style={{ transform: `rotate(${[-0.6, 0.4, -0.2][i]}deg)` }}>
                  <span className={`mb-1.5 block h-2 w-10 rounded-full ${a.color}`} />
                  <div className="font-semibold">{a.name}</div>
                  <div className="text-sm text-muted">{a.line}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="card mx-auto w-full max-w-md p-6 text-ink shadow-[var(--shadow-lift)] sm:p-8">
          <h2 className="text-2xl font-bold">{isLogin ? 'Welcome back' : 'Create your account'}</h2>
          <p className="mt-1 text-sm text-muted">
            {isLogin ? 'Sign in to continue.' : 'An admin activates new accounts before the first question.'}
          </p>
          <form onSubmit={submit} className="mt-6 space-y-4">
            <Input label="Email" type="email" autoComplete="email" required value={email} onChange={e => setEmail(e.target.value)} />
            <Input
              label="Password" type="password" required minLength={isLogin ? undefined : 10}
              autoComplete={isLogin ? 'current-password' : 'new-password'}
              hint={isLogin ? undefined : 'At least 10 characters.'}
              value={password} onChange={e => setPassword(e.target.value)}
            />
            {error && <Alert>{error}</Alert>}
            <Button type="submit" busy={busy} className="w-full">{isLogin ? 'Sign in' : 'Create account'}</Button>
          </form>
          <p className="mt-6 text-center text-sm text-muted">
            {isLogin ? 'New here? ' : 'Already have an account? '}
            <Link to={isLogin ? '/register' : '/login'} className="font-semibold text-brand hover:underline">
              {isLogin ? 'Create an account' : 'Sign in'}
            </Link>
          </p>
        </section>
      </main>
    </div>
  );
}
