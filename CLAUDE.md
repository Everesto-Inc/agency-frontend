# CLAUDE.md — agency-frontend

> Web app of the Autonomous Agency. Parent `oracle/CLAUDE.md` applies (free tier only, ARM images, ArgoCD deploys
> everything). Backend: sibling repo `../agency-backend` (its `CLAUDE.md`/docs describe the services).

## Why it exists

The agency backend answers questions with several specialist AI assistants (EV Helper, Product Finder, Finance
Analyst) behind one public API, and tracks every token and cent. This app is the face of it:

- **people**: sign up, wait for activation, ask questions (answers stream in), see what they used, manage their account
- **admins**: activate new accounts, reset passwords, disable accounts, watch cost / people / assistants / models

Rule from the platform: **every new account must be activated by an admin** before it can use anything.

## Stack (and why)

| Piece | Choice | Why |
|---|---|---|
| App | React 19 + TypeScript + **Vite** (SPA) | everything is behind login → no SSR needed; static files are the fastest and smallest |
| Serve | **nginx-unprivileged** inside the image (port 8080) | ~10 MiB RAM on the tenant node; caching, gzip, CSP headers, SPA fallback |
| Styling | **Tailwind CSS 4** + own components (`src/components/ui.tsx`) | design tokens in `src/index.css` |
| Data | **TanStack Query** + **openapi-fetch** typed from the backend's OpenAPI | types can't drift from the API |
| Routing | react-router (declarative), one lazy chunk per screen | the login page loads ~100 KB gzipped |
| Charts / answers | Recharts (lazy, usage screens only) · react-markdown + remark-gfm (chat only) | heavy libs never on the first page |

## Design language — a board, not a template

Inspired by kanban boards (Trello-like **language**, never its name, logo or fonts):

- **Gradient board** backdrop (`board-bg`: brand blue → violet), header bar of dark glass on top.
- **Lists** (`list-col`, light grey columns) holding **cards** (`card`: white, rounded, slight shadow, lift on hover).
- Coloured **labels** (`Label`, the 6 `label-*` colours) for plan, role, status, assistant.
- Screens are boards where it fits: Users = *Waiting for activation / Active / Disabled*; Usage + Overview = lists of
  metric cards; Account = Profile / Password / Your data; Chat = an Assistants list + one wide conversation list.
- **Chat is iMessage-like**: my question = blue bubble right, answer = white bubble left with the assistant's label;
  while waiting, a **typing bubble** (3 bouncing dots + a rotating playful word from our own list in
  `src/components/Thinking.tsx` — never copy another product's words) + the backend's real step underneath;
  while streaming, a blinking caret.
- Own logo (`Logo` in `Layout.tsx`, `public/favicon.svg`), system font stack, light + dark (`html.dark`).
- Mobile first: lists stack on phones, sit side by side (scroll sideways) from `md`; bottom tab bar on phones,
  tabs in the header from `md`; touch targets ≥ 40 px; inputs 16 px on phones (no iOS zoom);
  `prefers-reduced-motion` turns the animations off.
- Don't: generic centered-card SaaS look, purple-gradient-everything, emoji-heavy copy, stock illustrations.

## Backend API it uses (agency-backend, edge gateway)

Base URL = `API_URL` (runtime, see Deploy). Spec: `../agency-backend/openapi/edge-gateway.json`
→ types in `src/api/schema.d.ts` (`npm run api:types` — rerun after any backend API change, commit the result).

| Area | Endpoint | Used by |
|---|---|---|
| Auth | `POST /api/v1/auth/register` · `/login` → `TokenPair {access_token, refresh_token, expires_in, plan}` | AuthPage |
| | `POST /api/v1/auth/refresh {refresh_token}` → new pair (**rotating**: a refresh token works once) | `api/client.ts` |
| | `POST /api/v1/auth/logout {refresh_token}` | sign out |
| Me | `GET /api/v1/auth/me` → `{id, email, role, plan, plan_display_name, entitled_topics, max_model_tier}` | everywhere |
| | `PUT /api/v1/auth/me/password {current_password, new_password}` → 204, revokes every session | Account |
| | `GET /api/v1/auth/me/export` → all my data (JSON) | Account |
| Chat | `POST /api/v1/chat {prompt, session_id?, topic?, stream: true}` → **SSE** | Chat |
| | `GET /api/v1/topics` → assistants + `entitled` for my plan | Chat |
| Usage | `GET /api/v1/dashboard/months` → `GET /api/v1/dashboard?month=YYYY-MM` | Usage |
| Admin | `GET /api/v1/admin/users?plan=none` (waiting for activation) · `PUT /admin/users/{id}/plan {plan}` (activate) · `PUT /admin/users/{id}/password {new_password}` (reset) · `POST /admin/users/{id}/disable` | Admin → Users |
| | `GET /api/v1/admin/dashboard/months` → `GET /api/v1/admin/dashboard?month=` (cost, users, by topic/model, top users) | Admin → Overview |

Behaviour to respect:

- **Tokens**: access token (15 min) in memory only; refresh token in `localStorage` (`agency.refresh`). On 401 the
  client refreshes **once** (parallel 401s share one refresh) and retries; a rejected refresh ends the session.
- **Activation**: a new account has plan `none` → can log in, `/auth/me`, change password; chat returns
  "subscription required". The app shows `PendingPage` instead of chat; admins see it under Users.
- **Roles**: `role=admin` → admin screens + `/api/v1/admin/*` (backend enforces it; the UI only hides).
- **Plans**: `none` (waiting) · `free` · `pro` · `internal` (service accounts). Daily token/cost limits per plan.
- **SSE events** (`event:` name, `data:` JSON): `routed {topic, confidence, method}` → `status {content}` →
  `token {content}` (append) → `usage {data.total_tokens, data.cost_usd}` → `done {data.status, data.request_id}`;
  `error {content, data.code}` on failure. Parser: `parseSse` in `src/api/chatStream.ts` (tested).
- **Errors**: always `{error: {code, message, request_id, details}}` → `ApiError` (`src/api/errors.ts`).
- **CORS**: the backend's `CORS_ALLOWED_ORIGINS` must contain this app's URL (dev: `http://localhost:5173`).
- No email is sent anywhere — "forgot password" = an admin sets a new one.

## Run locally

```bash
nvm use 22
npm install
npm run dev:mock                # app + FAKE API (mock/server.mjs, in memory, nothing saved): any email/password
                                #   signs in; emails starting with "admin" = admin; "Create account" = waiting for activation
npm run dev                     # http://localhost:5173 — API from public/config.js (default http://localhost:8000)
npm test                        # vitest
bash ci/test.sh                 # what CI runs: typecheck + tests + build + entry-chunk budget (in node:22 via Docker)
```

Backend locally: `../agency-backend` → `docker compose up -d`; add `http://localhost:5173` to its CORS origins.

## Deploy

- **Image**: `ghcr.io/everesto-inc/agency-frontend:sha-<7>`, linux/arm64, built by **Loop** (`.github/workflows/ci.yml`).
- **Runtime config**: env `API_URL` → nginx renders `/config.js` and the CSP `connect-src` at container start.
  Same image in dev and prod. **No secrets** — everything here reaches the browser.
- **Backstage**: import the repo into DevOps Space **orchid** (Import repository), then *Create deployment*:
  port **8080**, health path **`/healthz`**, config `API_URL`, public URL on → `https://agency-frontend-dev.everesto.live`.
  It's small (≈ 10–20 MiB) → stays on the **argocd worker** (default placement; only big apps go to the control-plane).
- After the frontend has its URL, the backend's `CORS_ALLOWED_ORIGINS` (Infisical) must include it.

## Code map

| Path | What |
|---|---|
| `src/api/` | `client.ts` (typed client, token refresh), `chatStream.ts` (SSE), `errors.ts`, `tokens.ts`, `schema.d.ts` (generated) |
| `src/auth/AuthContext.tsx` | session state, login / register / logout, `isActivated`, `isAdmin` |
| `src/components/` | `ui.tsx` (Button, Input, Card, List, Board, Label, Metric, …), `Layout.tsx`, `Thinking.tsx`, `DailyChart.tsx`, `MonthPicker.tsx` |
| `src/pages/` | `AuthPage`, `PendingPage`, `ChatPage`, `UsagePage`, `AccountPage`, `admin/AdminUsersPage`, `admin/AdminOverviewPage` |
| `nginx/` | `default.conf.template` (routes, caching, `/config.js`, `/healthz`), `security-headers.inc.template` (CSP etc.) |
| `ci/test.sh` | CI test command |
| `mock/` | fake API for local UI work (`npm run dev:mock`) — keep it in sync when the backend API changes |

## Gotchas

- `add_header` in an nginx `location` drops the server-level ones → every location includes `security-headers.inc`.
- Keep heavy libraries out of the first page: import them only from lazy screens (CI fails if the entry chunk > 130 KB gz).
- Packages are installed with `npm install --before=<date ≥ 2 weeks ago>` (no brand-new releases); TypeScript stays on 5.x
  (openapi-typescript needs it).
- Never commit `.env` files; `public/config.js` is the local-dev default only (the image serves its own).
