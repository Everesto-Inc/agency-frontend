# Autonomous Agency — web app

The face of the agency: people sign up, **wait for an admin to activate them**, then ask questions that the right
assistant answers (streamed, with the cost shown). Admins activate accounts and watch cost and usage.

## Screens

| Screen | For | Backend calls |
|---|---|---|
| Sign in / Create account | everyone | `POST /api/v1/auth/login` · `/register` |
| Waiting for activation | new accounts (plan `none`) | `GET /api/v1/auth/me` |
| Chat | activated accounts | `GET /api/v1/topics` · `POST /api/v1/chat` (server-sent events) |
| Usage | activated accounts | `GET /api/v1/dashboard/months` · `GET /api/v1/dashboard?month=` |
| Account | everyone signed in | `PUT /api/v1/auth/me/password` · `GET /api/v1/auth/me/export` |
| Admin → Users | admins | `GET /api/v1/admin/users` · `PUT …/plan` · `PUT …/password` · `POST …/disable` |
| Admin → Overview | admins | `GET /api/v1/admin/dashboard/months` · `GET /api/v1/admin/dashboard?month=` |

## How it talks to the backend

- **Sign-in**: the backend returns an access token (15 min, kept in memory) and a rotating refresh token (kept in the
  browser). When the access token expires, the app refreshes once and repeats the request — you stay signed in.
- **Chat** streams: `routed` (which assistant) → `status` (what it's doing) → `token` (the answer, piece by piece)
  → `usage` (tokens, cost) → `done`. While waiting the app shows a typing bubble with a playful word.
- **Activation**: accounts on plan `none` see "Waiting for activation"; admins move them to *Active* on the Users board.
- No secrets in the app. The backend address comes from the container setting `API_URL`.

## Run and deploy

- Locally: `npm install && npm run dev` → <http://localhost:5173> (the backend must allow that origin in CORS).
- CI: Loop builds `ghcr.io/everesto-inc/agency-frontend:sha-<7>` (tests, build, Semgrep, Trivy).
- Deploy with Backstage *Create deployment*: port **8080**, health **/healthz**, config `API_URL`.
