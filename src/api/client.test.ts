import { authFetch, refreshSession } from './client';
import { tokens } from './tokens';

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const pair = (n: number) => ({ access_token: `a${n}`, refresh_token: `r${n}`, expires_in: 900, plan: 'free', token_type: 'bearer' });

describe('authFetch', () => {
  beforeEach(() => { localStorage.clear(); tokens.set('a0', 'r0'); });
  afterEach(() => vi.unstubAllGlobals());

  it('sends the access token, refreshes once on 401 and retries with the new one', async () => {
    const seen: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo, init?: RequestInit) => {
      const req = input instanceof Request ? input : new Request(input, init);
      if (req.url.endsWith('/auth/refresh')) return json(200, pair(1));
      seen.push(req.headers.get('authorization') ?? '');
      return seen.length === 1 ? json(401, { error: { code: 'UNAUTHORIZED', message: 'expired' } }) : json(200, { ok: true });
    }));
    const res = await authFetch(new Request('http://api/api/v1/auth/me'));
    expect(res.status).toBe(200);
    expect(seen).toEqual(['Bearer a0', 'Bearer a1']);
    expect(tokens.refresh()).toBe('r1');
  });

  it('parallel 401s share ONE refresh (a refresh token works once)', async () => {
    const refresh = vi.fn(async () => json(200, pair(2)));
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo) => (String(input instanceof Request ? input.url : input).endsWith('/auth/refresh') ? refresh() : json(200, {}))));
    await Promise.all([refreshSession(), refreshSession(), refreshSession()]);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('a rejected refresh ends the session', async () => {
    const cleared = vi.fn();
    const off = tokens.onCleared(cleared);
    vi.stubGlobal('fetch', vi.fn(async () => json(401, {})));
    expect(await refreshSession()).toBe(false);
    expect(tokens.refresh()).toBeNull();
    expect(cleared).toHaveBeenCalled();
    off();
  });
});
