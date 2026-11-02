# DAM3A

A football prediction web app. Players predict match outcomes and player events, build a fantasy squad, follow live matches, and compare results on leaderboards and an analytics page. Live: https://football-prediction-platform-live.vercel.app

Stack: Next.js 16, React 19, TypeScript, Supabase (Auth and PostgreSQL), Zod, Vitest, deployed on Vercel. Match data comes from API-Football through one isolated provider layer, so the browser never calls it directly.

## What it does

- **Predictions:** six configurable question types per match, each with its own evaluator and explicit void and tie handling. Predictions lock at kickoff, enforced in both the server code and the database.
- **Scoring:** completed matches are scored by an idempotent finalize step, so re-running it never double-counts points.
- **Live match centre:** shared timelines and statistics with quota-aware polling.
- **Season picks and fantasy:** season-long predictions, fantasy squads with a price catalog, transfer deadlines and automated scoring, and public fantasy teams.
- **Competitions and analytics:** competition pages with team membership and official standings, plus a public analytics explorer for player and match statistics.
- **Accounts:** email and password sign-in through Supabase Auth, HTTP-only session cookies, profiles, history and a private prediction library.

When Supabase is not configured or has no fixtures yet, the app falls back to built-in demo matches so the interface can still be explored.

## Pages and API routes

Pages: dashboard, `matches/[id]`, `live`, `leaderboard`, `history`, `my-predictions`, `profile`, `season-picks`, `fantasy` (teams, prices), `competitions/[slug]`, `analytics`, `auth`.

API routes under `src/app/api`: `predictions`, `season-predictions`, `profile`, `fantasy`, `live`, `analytics`, `health`, plus secured `sync`, `finalize` and `cron`.

## Run locally

```powershell
npm.cmd install
Copy-Item .env.example .env.local   # then fill in the values
npm.cmd run dev
```

Open http://localhost:3000, and http://localhost:3000/api/health to see which services are configured. Run `npm.cmd test` for the tests and `npm.cmd run check` for tests plus a production build.

| Variable | Purpose |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase project, safe for the browser |
| `SUPABASE_SERVICE_ROLE_KEY` | Server only. Never expose it |
| `API_FOOTBALL_KEY`, `API_FOOTBALL_BASE_URL` | Football data provider |
| `SYNC_SECRET`, `CRON_SECRET` | Bearer secrets protecting the sync and cron routes |

Never commit real values. `.env.local` is git-ignored.

## Database

Run the files in `supabase/migrations` in numeric order, `001` to `026`, in the Supabase SQL Editor. They create the schema, row-level security policies, scoring and leaderboard functions, fixtures and lineups, the live match tables, fantasy squads and scoring, and the analytics and standings tables. Later files are written to be safe to run again.

## Data sync

Vercel cron jobs, defined in `vercel.json`, call routes that require `Authorization: Bearer $CRON_SECRET`:

| Route | Schedule (UTC) |
|---|---|
| `/api/cron/catalog` | daily 03:17 |
| `/api/cron/matches` | daily 04:00 |
| `/api/cron/analytics` | daily 04:30 |

This is the Vercel Hobby fallback; upgrading the plan allows more frequent live updates. Optional provider calls stop when fewer than 150 daily API requests remain. Details are in [docs/AUTOMATED_DATA_SYNC.md](docs/AUTOMATED_DATA_SYNC.md), and the first-time setup order is in [SETUP_CHECKLIST.md](SETUP_CHECKLIST.md).

## Tests and CI

Eight Vitest files cover scoring, kickoff locking, provider normalizers, lineups, fantasy stats and prices, and competitions. GitHub Actions runs install, tests and a production build on every push.

## Limitations

- Live data depends on the provider's daily quota and on the cron frequency your Vercel plan allows.
- Own goals are excluded from player goalscorer questions. If no eligible scorer exists, that question is void, as is a category with missing paired statistics.
- Permanent scoring should run only against finalized, normalized data.
- The package name is `kickoff-picks` and the setup checklist uses that name; the product name is DAM3A.
