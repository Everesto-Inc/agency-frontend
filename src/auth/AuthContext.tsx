import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api, refreshSession, unwrap, type Schemas } from '@/api/client';
import { tokens } from '@/api/tokens';

export type Me = Schemas['Me'];
type State = { status: 'loading' } | { status: 'anonymous' } | { status: 'signed-in'; me: Me };

type Auth = {
  state: State;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  reloadMe: () => Promise<void>;
};

const Ctx = createContext<Auth | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<State>({ status: 'loading' });
  const qc = useQueryClient();

  const loadMe = useCallback(async () => {
    const me = await unwrap(api.GET('/api/v1/auth/me'));
    setState({ status: 'signed-in', me });
  }, []);

  // start: a stored refresh token → new access token → who am I
  useEffect(() => {
    (async () => {
      if (tokens.refresh() && (await refreshSession())) {
        try { await loadMe(); return; } catch { /* fall through */ }
      }
      setState({ status: 'anonymous' });
    })();
    return tokens.onCleared(() => { qc.clear(); setState({ status: 'anonymous' }); });
  }, [loadMe, qc]);

  const signIn = useCallback(async (path: '/api/v1/auth/login' | '/api/v1/auth/register', email: string, password: string) => {
    const pair = await unwrap(path === '/api/v1/auth/login'
      ? api.POST('/api/v1/auth/login', { body: { email, password } })
      : api.POST('/api/v1/auth/register', { body: { email, password } }));
    tokens.set(pair.access_token, pair.refresh_token);
    await loadMe();
  }, [loadMe]);

  const value = useMemo<Auth>(() => ({
    state,
    login: (e, p) => signIn('/api/v1/auth/login', e, p),
    register: (e, p) => signIn('/api/v1/auth/register', e, p),
    logout: async () => {
      const rt = tokens.refresh();
      if (rt) await api.POST('/api/v1/auth/logout', { body: { refresh_token: rt } }).catch(() => undefined);
      tokens.clear();
    },
    reloadMe: loadMe,
  }), [state, signIn, loadMe]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth outside AuthProvider');
  return v;
}

/** The signed-in user (only inside signed-in routes). */
export function useMe(): Me {
  const { state } = useAuth();
  if (state.status !== 'signed-in') throw new Error('not signed in');
  return state.me;
}

export const isActivated = (me: Me) => me.plan !== 'none';
export const isAdmin = (me: Me) => me.role === 'admin';
