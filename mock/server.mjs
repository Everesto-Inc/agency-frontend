// Fake agency API for local UI work — `npm run dev:mock`. In memory only: nothing is stored, a restart forgets all.
//   Login: ANY email + password. Emails starting with "admin" → admin (plan pro); others → active user (plan free).
//   Create account → plan "none" (waiting for activation) → activate it as admin on Admin → Users.
//   Env: MOCK_PORT (default 8000), MOCK_SLOW=1 (slower streaming, to watch the typing bubble).
import http from 'node:http';

const PORT = Number(process.env.MOCK_PORT ?? 8000);
const SLOW = process.env.MOCK_SLOW === '1';
const sleep = ms => new Promise(r => setTimeout(r, ms));
let seq = 0;
const uid = () => `00000000-0000-4000-8000-${String(++seq).padStart(12, '0')}`;
const day = d => `2026-11-${String(d).padStart(2, '0')}T09:00:00Z`;

// ---- in-memory accounts ----------------------------------------------------------------------------------------
const users = new Map(); // email → account
const add = (email, plan, role = 'user', active = true, created = day(20)) =>
  users.set(email, { id: uid(), email, plan, role, is_active: active, created_at: created, plan_expires_at: null });
add('admin@everesto.live', 'pro', 'admin', true, day(1));
add('maya@example.com', 'free', 'user', true, day(10));
add('jules@shop.fr', 'pro', 'user', true, day(12));
add('nora@startup.io', 'none', 'user', true, day(24));
add('leo.martin@mail.com', 'none', 'user', true, day(25));
add('evals@agency.internal', 'internal', 'service', true, day(2));
add('spam@bot.xyz', 'none', 'user', false, day(21));

const PLAN_NAMES = { none: 'No subscription', free: 'Free', pro: 'Pro', internal: 'Internal' };
const TOPICS = [
  { topic: 'ev_research', display_name: 'EV Helper', description: 'Range, charging and real cost of electric cars', framework: 'langgraph', plans: ['free', 'pro', 'internal'] },
  { topic: 'product_finder', display_name: 'Product Finder', description: 'Finds shops and the cheapest verified offer', framework: 'crewai', plans: ['pro', 'internal'] },
  { topic: 'finance', display_name: 'Finance Analyst', description: 'A small team of analysts looks at a stock', framework: 'autogen', plans: ['pro', 'internal'] },
];
const meOf = u => ({
  id: u.id, email: u.email, role: u.role, plan: u.plan, plan_display_name: PLAN_NAMES[u.plan] ?? u.plan,
  entitled_topics: TOPICS.filter(t => t.plans.includes(u.plan)).map(t => t.topic), max_model_tier: u.plan === 'pro' ? 'high' : 'low',
});

// token = "mock." + base64(email) — fine for a fake
const tokenFor = u => `mock.${Buffer.from(u.email).toString('base64url')}`;
const userOf = req => {
  const t = (req.headers.authorization ?? '').replace(/^Bearer /, '') || '';
  if (!t.startsWith('mock.')) return null;
  const u = users.get(Buffer.from(t.slice(5), 'base64url').toString());
  return u?.is_active ? u : null;
};
const pairFor = u => ({ access_token: tokenFor(u), refresh_token: tokenFor(u), expires_in: 900, plan: u.plan, token_type: 'bearer' });

// ---- in-memory chat history (per user email) ---------------------------------------------------------------------
const convs = new Map(); // email → Map(id → { id, title, pinned, turns, last_topic, created_at, updated_at, messages })
const convsOf = u => { if (!convs.has(u.email)) convs.set(u.email, new Map()); return convs.get(u.email); };
const ago = h => new Date(Date.now() - h * 3600_000).toISOString();
const seedFor = u => {
  const m = convsOf(u);
  if (m.size) return;
  [
    ['Charging cost of a Tesla Model 3 at home', 'ev_research', 1, true],
    ['Best price for an iPad Air M2', 'product_finder', 3, false],
    ['Is NVIDIA overvalued?', 'finance', 26, false],
    ['Kia EV6 vs Ioniq 5 range in winter', 'ev_research', 80, false],
    ['Cheapest Dyson V15 in Germany', 'product_finder', 400, false],
  ].forEach(([title, topic, h, pinned], i) => {
    const id = `seed${i}${u.id.slice(-4)}`;
    m.set(id, { id, title, pinned, turns: 1, last_topic: topic, created_at: ago(h), updated_at: ago(h), messages: [
      { request_id: `${id}-1`, topic, prompt: title + '?', answer: i === 4 ? null : ANSWERS[topic], status: 'success', created_at: ago(h), total_tokens: 8800, cost_usd: 0.0031, models: ['gemini-2.5-flash'] },
    ].map(x => (i === 4 ? { ...x, prompt: null } : x)) });
  });
};
const summary = ({ messages, ...c }) => c;

// ---- sample usage ----------------------------------------------------------------------------------------------
const totals = (c, r, t) => ({ cost_usd: c, runs: r, total_tokens: t, prompt_tokens: Math.round(t * 0.7), completion_tokens: Math.round(t * 0.3), llm_calls: r * 3, cached_runs: 2 });
const daily = Array.from({ length: 25 }, (_, i) => ({ day: `2026-11-${String(i + 1).padStart(2, '0')}`, cost_usd: +(Math.abs(Math.sin(i / 2.3)) * 0.4 + 0.05).toFixed(3), runs: 3 + (i % 5), total_tokens: 20000 + i * 900, llm_calls: 9, by_topic: {} }));
const byTopic = [
  { topic: 'ev_research', display_name: 'EV Helper', kind: 'agent', share_of_cost: 0.52, avg_cost_per_run: 0.031, totals: totals(2.41, 77, 812000) },
  { topic: 'product_finder', display_name: 'Product Finder', kind: 'agent', share_of_cost: 0.33, avg_cost_per_run: 0.027, totals: totals(1.52, 56, 540000) },
  { topic: 'finance', display_name: 'Finance Analyst', kind: 'agent', share_of_cost: 0.15, avg_cost_per_run: 0.045, totals: totals(0.69, 15, 230000) },
];
const months = { current: '2026-11', months: [{ month: '2026-11', label: 'November 2026', has_data: true, is_current: true }, { month: '2026-10', label: 'October 2026', has_data: true, is_current: false }] };
const runs = { runs: 148, successful: 141, failed: 7, success_rate: 0.953, cache_hit_rate: 0.12, avg_latency_ms: 8400, positive_feedback: 12, negative_feedback: 2 };
const period = { month: '2026-11', label: 'November 2026', start: '2026-11-01', end: '2026-11-30', days: 30, is_current: true };
const recent = ['ev_research', 'product_finder', 'finance', 'ev_research'].map((t, i) => ({ request_id: `r${i}`, topic: t, status: i === 2 ? 'error' : 'success', created_at: `2026-11-24T1${i}:2${i}:00Z`, total_tokens: 9000 + i * 1300, prompt_tokens: 6000, completion_tokens: 3000, cost_usd: 0.021 + i * 0.008, llm_calls: 3, latency_ms: 7000, cache_hit: i === 3, feedback_score: null }));
const models = [
  ['gemini-2.5-flash', 'medium', 2900, 21.3, 0.004], ['gemini-2.5-flash-lite', 'low', 5100, 6.1, 0.002], ['gemini-2.5-pro', 'high', 310, 11, 0.01],
].map(([model, tier, calls, cost_usd, error_rate]) => ({ model, tier, calls, cost_usd, error_rate, cache_hit_rate: 0.1, share_of_cost: cost_usd / 38.4, prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 }));

const ANSWERS = {
  ev_research: `**Hyundai Ioniq 5 (2024), Germany**\n\n| Version | Battery | WLTP range |\n|---|---|---|\n| Standard | 63 kWh | 384 km |\n| Long Range RWD | 84 kWh | 570 km |\n\nCharging 10→80 % takes about **18 minutes** on a 350 kW charger. At German home prices (≈ 0.36 €/kWh) a full charge of the 84 kWh battery costs about **27 €**.`,
  product_finder: `Cheapest verified offers for **Sony WH-1000XM5** in France:\n\n1. **279 €** — shop A (in stock, free delivery)\n2. **289 €** — shop B (2–3 days)\n3. **299 €** — shop C\n\nPrices were checked on the shop pages a minute ago.`,
  finance: `**Apple (AAPL)** trades at about **31× earnings**, above the peer median (~24×).\n\n- Strong cash flow and buybacks support the premium.\n- Growth is slower than the multiple suggests.\n\n_Not investment advice._`,
};
const route = prompt => (/stock|share|price.*(apple|aapl)|invest|earnings/i.test(prompt) ? 'finance' : /cheap|price|buy|shop|offer/i.test(prompt) ? 'product_finder' : 'ev_research');

// ---- http ------------------------------------------------------------------------------------------------------
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };
const send = (res, status, body) => {
  res.writeHead(status, { ...CORS, ...(body === undefined ? {} : { 'content-type': 'application/json' }) });
  res.end(body === undefined ? undefined : JSON.stringify(body));
};
const fail = (res, status, code, message) => send(res, status, { error: { code, message, request_id: null, details: null } });
const body = req => new Promise(r => { let s = ''; req.on('data', c => (s += c)); req.on('end', () => { try { r(JSON.parse(s || '{}')); } catch { r({}); } }); });

http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x');
  const p = u.pathname;
  const m = req.method;
  if (m === 'OPTIONS') return send(res, 204);
  await sleep(120); // feel a bit like a network

  // auth (no passwords checked — it's a fake)
  if (m === 'POST' && p === '/api/v1/auth/login') {
    const { email = '' } = await body(req);
    const e = email.toLowerCase();
    if (!users.has(e)) add(e, e.startsWith('admin') ? 'pro' : 'free', e.startsWith('admin') ? 'admin' : 'user', true, day(25));
    const acc = users.get(e);
    if (!acc.is_active) return fail(res, 401, 'UNAUTHORIZED', 'Invalid email or password');
    return send(res, 200, pairFor(acc));
  }
  if (m === 'POST' && p === '/api/v1/auth/register') {
    const { email = '' } = await body(req);
    const e = email.toLowerCase();
    if (users.has(e)) return fail(res, 409, 'CONFLICT', 'Email already registered');
    add(e, 'none', 'user', true, day(25));
    return send(res, 201, pairFor(users.get(e)));
  }
  if (m === 'POST' && p === '/api/v1/auth/refresh') {
    const { refresh_token = '' } = await body(req);
    const acc = userOf({ headers: { authorization: `Bearer ${refresh_token}` } });
    return acc ? send(res, 200, pairFor(acc)) : fail(res, 401, 'UNAUTHORIZED', 'Session expired');
  }
  if (m === 'POST' && p === '/api/v1/auth/logout') return send(res, 204);

  const me = userOf(req);
  if (!me) return fail(res, 401, 'UNAUTHORIZED', 'Not signed in');

  if (m === 'GET' && p === '/api/v1/auth/me') return send(res, 200, meOf(me));
  if (m === 'PUT' && p === '/api/v1/auth/me/password') return send(res, 204);
  if (m === 'GET' && p === '/api/v1/auth/me/export') return send(res, 200, { account: meOf(me), note: 'mock export' });
  if (m === 'GET' && p === '/api/v1/topics') {
    return send(res, 200, TOPICS.map(({ plans, ...t }) => ({ ...t, entitled: plans.includes(me.plan), run_path: '', docs_path: '', daily_request_limit: null })));
  }
  if (m === 'GET' && p.endsWith('/dashboard/months')) return send(res, 200, months);
  if (m === 'GET' && p === '/api/v1/dashboard') {
    return send(res, 200, { account: { id: me.id, email: me.email, plan: me.plan }, period, currency: 'USD', totals: totals(4.62, 148, 1582000), previous_month: totals(3.9, 120, 1300000), change: { cost_usd_pct: 18.5, runs_pct: 23.3, total_tokens_pct: 21.7 }, runs, daily, by_topic: byTopic, recent_runs: recent, today: { tokens: 31200, token_limit: 50000, cost_usd: 0.031, cost_limit_usd: 0.05, by_topic: {} } });
  }
  if (m === 'POST' && p === '/api/v1/chat') {
    if (me.plan === 'none') return fail(res, 403, 'SUBSCRIPTION_REQUIRED', 'Your account is waiting for activation');
    const { prompt = '', topic, session_id = 'default' } = await body(req);
    seedFor(me);
    const hist = convsOf(me);
    // follow-ups without a clear keyword stay with the conversation's assistant
    const t = topic ?? (/stock|share|invest|earnings|valu|cheap|price|buy|shop|offer|range|battery|charg|ev\b/i.test(prompt) ? route(prompt) : hist.get(session_id)?.last_topic ?? route(prompt));
    const now = new Date().toISOString();
    const conv = hist.get(session_id) ?? { id: session_id, title: prompt.replace(/\s+/g, ' ').slice(0, 80), pinned: false, turns: 0, created_at: now, messages: [] };
    Object.assign(conv, { turns: conv.turns + 1, last_topic: t, updated_at: now });
    conv.messages.push({ request_id: `m${Date.now()}`, topic: t, prompt, answer: ANSWERS[t], status: 'success', created_at: now, total_tokens: 9087, cost_usd: 0.0035, models: ['gemini-2.5-flash', 'gemini-2.5-flash-lite'] });
    hist.set(session_id, conv);
    res.writeHead(200, { ...CORS, 'content-type': 'text/event-stream', 'cache-control': 'no-store' });
    const ev = (name, data) => res.write(`event: ${name}\ndata: ${JSON.stringify(data)}\n\n`);
    ev('routed', { topic: t, confidence: 0.94, method: topic ? 'explicit' : 'keywords' });
    for (const step of ['Understanding the question', 'Searching the web', 'Checking the facts']) {
      ev('status', { type: 'status', content: step, data: {} });
      await sleep(SLOW ? 2200 : 900);
    }
    for (const chunk of ANSWERS[t].match(/[\s\S]{1,6}/g)) { ev('token', { type: 'token', content: chunk, data: {} }); await sleep(SLOW ? 45 : 18); }
    ev('usage', { type: 'usage', content: '', data: { total_tokens: 9087, cost_usd: 0.0035, models: [{ model: 'gemini-2.5-flash', calls: 2 }, { model: 'gemini-2.5-flash-lite', calls: 1 }] } });
    ev('done', { type: 'done', content: '', data: { status: 'success', request_id: 'mock' } });
    return res.end();
  }

  // chat history
  if (p === '/api/v1/conversations' && m === 'GET') {
    seedFor(me);
    const q = (u.searchParams.get('q') ?? '').toLowerCase();
    const list = [...convsOf(me).values()].filter(c => !q || c.title.toLowerCase().includes(q))
      .sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updated_at.localeCompare(a.updated_at));
    return send(res, 200, list.map(summary));
  }
  const conv = p.match(/^\/api\/v1\/conversations\/([^/]+)$/);
  if (conv) {
    seedFor(me);
    const c = convsOf(me).get(conv[1]);
    if (!c) return fail(res, 404, 'NOT_FOUND', 'Conversation not found');
    if (m === 'GET') return send(res, 200, c);
    if (m === 'PATCH') { const b = await body(req); if (b.title) c.title = b.title; if (b.pinned != null) c.pinned = b.pinned; return send(res, 200, summary(c)); }
    if (m === 'DELETE') { convsOf(me).delete(conv[1]); return send(res, 204); }
  }

  // admin
  if (p.startsWith('/api/v1/admin/') && me.role !== 'admin') return fail(res, 403, 'FORBIDDEN', 'Admins only');
  if (m === 'GET' && p === '/api/v1/admin/users') {
    const plan = u.searchParams.get('plan');
    return send(res, 200, [...users.values()].filter(x => !plan || x.plan === plan).sort((a, b) => b.created_at.localeCompare(a.created_at)));
  }
  const target = p.match(/^\/api\/v1\/admin\/users\/([^/]+)\/(plan|password|disable)$/);
  if (target) {
    const acc = [...users.values()].find(x => x.id === target[1]);
    if (!acc) return fail(res, 404, 'NOT_FOUND', 'User not found');
    const b = await body(req);
    if (target[2] === 'plan') { acc.plan = b.plan; return send(res, 200, { id: acc.id, plan: acc.plan, plan_expires_at: null }); }
    if (target[2] === 'disable') { acc.is_active = false; return send(res, 204); }
    return send(res, 204); // password: nothing to store in a fake
  }
  if (m === 'GET' && p === '/api/v1/admin/dashboard') {
    const all = [...users.values()];
    const by_plan = all.reduce((a, x) => ({ ...a, [x.plan]: (a[x.plan] ?? 0) + 1 }), {});
    return send(res, 200, { period, currency: 'USD', totals: totals(38.4, 1210, 13100000), previous_month: totals(30, 900, 10000000), change: { cost_usd_pct: 28, runs_pct: 34, total_tokens_pct: 31 }, runs, daily, by_topic: byTopic, by_model: models, top_users: all.filter(x => x.plan !== 'none').slice(0, 4).map((x, i) => ({ user_id: x.id, email: x.email, plan: x.plan, cost_usd: 9 - i * 2, topics: {} })), users: { total: all.length, active: all.filter(x => x.is_active).length, disabled: all.filter(x => !x.is_active).length, new_signups: 3, by_plan } });
  }
  fail(res, 404, 'NOT_FOUND', `mock: no ${m} ${p}`);
}).listen(PORT, () => console.log(`mock agency API on http://localhost:${PORT} — any email/password; "admin…" = admin`));
