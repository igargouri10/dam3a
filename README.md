# DAM3A

A responsive football prediction MVP built from the project brief. It currently runs in demo mode, with a Supabase-ready schema and a deliberately isolated football-provider boundary.

## Run locally

```powershell
cd C:\Users\igarg\Documents\Codex\2026-08-10\explore\outputs\football-prediction-platform
npm.cmd install
npm.cmd run dev
```

Open `http://localhost:3000`. Run checks with `npm.cmd test` and `npm.cmd run build`.

## What works

- Dashboard with upcoming and live match states
- Responsive match prediction experience with six configurable question types
- Email/password account creation and sign-in using Supabase Auth
- Secure HTTP-only session cookies with refresh-token rotation
- Persistent prediction upserts through one atomic PostgreSQL function
- Prediction API validation plus server and database kickoff enforcement
- Separate, testable evaluators with explicit void/tie handling
- Leaderboard and history views
- Provider interface and guarded API-Football client (normalization intentionally waits for a verified real response)
- Validated API-Football fixture normalizer and secured Premier League sync endpoint
- Final event/statistics normalization and idempotent completed-match scoring
- Database-derived leaderboard, accuracy, and private prediction history
- Database-driven fixture pages and match-specific lineup prediction options
- Shared live match centre with quota-aware polling, timelines, and statistics
- PostgreSQL schema, constraints, RLS policies, configurable points, and idempotent result keys

## Connect real services

1. Create a Supabase project and run `supabase/migrations/001_initial.sql`, then `002_auth_and_prediction_rpc.sql`.
2. Copy `.env.example` to `.env.local` and add credentials.
3. Import fixtures and create `match_prediction_types` rows. Demo match IDs are sent as provider IDs, so imported records must use the corresponding provider ID or the UI must be switched to database fixtures.
4. Run `003_sync_constraints.sql`, then set `API_FOOTBALL_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, and a strong `SYNC_SECRET`.
5. Sync a narrow date range with `POST /api/sync/fixtures?season=2026&from=2026-08-01&to=2026-08-31` and header `Authorization: Bearer <SYNC_SECRET>`. The league is fixed to API-Football Premier League ID 39 for V1.
6. Run `004_results_and_scoring.sql`. Finalize a finished fixture with `POST /api/finalize/<provider-fixture-id>` using the same authorization header. Re-running it updates the same result rows and never duplicates points.
7. Run `005_leaderboard_and_history.sql` to enable live leaderboard and authenticated history views.
8. Run `006_fixtures_and_lineups.sql`. Sync lineups with `POST /api/sync/lineups/<provider-fixture-id>` using the sync authorization header.
9. Run `007_live_match_experience.sql`. Call `POST /api/sync/live` once per minute while fixtures are active and `POST /api/sync/live/<provider-id>` for details. Browsers poll only `/api/live`.
10. Run `008_release_hardening.sql`, configure the scheduled job, and follow `SETUP_CHECKLIST.md` for production acceptance.

Own goals are excluded from player goalscorer questions. The first subsequent eligible scorer wins `FIRST_SCORER`; if there is none, that question is void. Missing paired provider statistics also void the affected category.

The UI never calls the football provider directly. Permanent scoring should only run against finalized normalized data.
