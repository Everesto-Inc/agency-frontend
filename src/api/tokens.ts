/**
 * Session tokens. The access token (15 min) lives only in memory; the refresh token (rotating, revocable)
 * in localStorage so a reload keeps you signed in. A strict CSP (nginx) limits what any script could read.
 */
const REFRESH_KEY = 'agency.refresh';

let access: string | null = null;
const listeners = new Set<() => void>();

export const tokens = {
  access: () => access,
  refresh: () => {
    try { return localStorage.getItem(REFRESH_KEY); } catch { return null; }
  },
  set(accessToken: string, refreshToken: string) {
    access = accessToken;
    try { localStorage.setItem(REFRESH_KEY, refreshToken); } catch { /* private mode: session only */ }
  },
  clear() {
    access = null;
    try { localStorage.removeItem(REFRESH_KEY); } catch { /* ignore */ }
    listeners.forEach(l => l());
  },
  /** Called when the session ends (logout, refresh rejected) — the app goes back to the login page. */
  onCleared(l: () => void) {
    listeners.add(l);
    return () => { listeners.delete(l); };
  },
};
