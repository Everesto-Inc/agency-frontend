import createClient from 'openapi-fetch';
import { apiUrl } from '@/config';
import type { components, paths } from './schema';
import { ApiError } from './errors';
import { tokens } from './tokens';

export type Schemas = components['schemas'];

let refreshing: Promise<boolean> | null = null;

/** One refresh at a time: parallel 401s wait for the same rotation (a refresh token works only once). */
export function refreshSession(): Promise<boolean> {
  const rt = tokens.refresh();
  if (!rt) return Promise.resolve(false);
  refreshing ??= (async () => {
    try {
      const res = await fetch(`${apiUrl}/api/v1/auth/refresh`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ refresh_token: rt }),
      });
      if (!res.ok) { tokens.clear(); return false; }
      const pair = (await res.json()) as Schemas['TokenPair'];
      tokens.set(pair.access_token, pair.refresh_token);
      return true;
    } catch {
      return false; // offline: keep the session, try again later
    } finally {
      refreshing = null;
    }
  })();
  return refreshing;
}

/** fetch with the access token; on 401 refresh once and retry (except for the auth calls themselves). */
export async function authFetch(input: Request): Promise<Response> {
  const retry = input.clone();
  const send = (req: Request) => {
    const t = tokens.access();
    if (t) req.headers.set('authorization', `Bearer ${t}`);
    return fetch(req);
  };
  const res = await send(input);
  if (res.status !== 401 || new URL(input.url).pathname.startsWith('/api/v1/auth/login')) return res;
  return (await refreshSession()) ? send(retry) : res;
}

export const api = createClient<paths>({ baseUrl: apiUrl, fetch: authFetch });

/** openapi-fetch result → data, or throw ApiError (for TanStack Query). */
export async function unwrap<T>(p: Promise<{ data?: T; error?: unknown; response: Response }>): Promise<T> {
  const { data, response } = await p;
  if (!response.ok) throw await ApiError.from(response.clone());
  return data as T;
}
