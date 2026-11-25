# agency-frontend

Web app of the Autonomous Agency — sign in, ask the AI assistants (answers stream in), follow your usage, manage your
account; admins activate new accounts and watch the platform. React 19 + Vite, served by nginx (≈ 10 MiB RAM).

| Screen | What | API (agency-backend) |
|---|---|---|
| Sign in / Create account | front-page hero + form | `POST /api/v1/auth/login`, `/register` |
| Waiting for activation | new accounts until an admin activates them | `GET /api/v1/auth/me` |
| Chat | assistants list + conversation as bubbles, streamed answers | `POST /api/v1/chat` (SSE), `GET /api/v1/topics` |
| Usage | month board: cost per day, this month, today's limits, by assistant, recent questions | `GET /api/v1/dashboard…` |
| Account | profile, change password, download my data | `PUT /api/v1/auth/me/password`, `GET /auth/me/export` |
| Admin → Users | board: Waiting / Active / Disabled — activate, change plan, reset password, disable | `/api/v1/admin/users…` |
| Admin → Overview | cost, people, assistants, models, top users | `GET /api/v1/admin/dashboard…` |

```bash
nvm use 22 && npm install
npm run dev:mock     # http://localhost:5173 with a FAKE API (in memory): any email/password; "admin…" = admin
npm run dev          # http://localhost:5173 (API: public/config.js → http://localhost:8000)
bash ci/test.sh      # typecheck + tests + build (what CI runs)
npm run api:types    # after a backend API change: regenerate src/api/schema.d.ts from ../agency-backend/openapi
```

Image: `ghcr.io/everesto-inc/agency-frontend` (Loop CI). Runtime setting: `API_URL`. Details — design rules, every API
call and its behaviour, deploy — in [CLAUDE.md](CLAUDE.md) and the Tech Docs.
