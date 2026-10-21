# Kickoff Picks — final manual setup

Complete these steps in order. Never paste a service-role key or API-Football key into chat, source control, or any variable beginning with `NEXT_PUBLIC_`.

## 1. Finish the database

In the Supabase SQL Editor, run these files in numerical order:

1. `supabase/migrations/003_sync_constraints.sql`
2. `supabase/migrations/004_results_and_scoring.sql`
3. `supabase/migrations/005_leaderboard_and_history.sql`
4. `supabase/migrations/006_fixtures_and_lineups.sql`
5. `supabase/migrations/007_live_match_experience.sql`
6. `supabase/migrations/008_release_hardening.sql`

Each should report success. Do not rerun `001` or `002` if they already succeeded.

## 2. Collect credentials

From Supabase, copy the project URL, publishable/anon key, and service-role key. From API-Football, copy the API key. Generate two different random secrets of at least 32 characters for `SYNC_SECRET` and `CRON_SECRET`.

## 3. Configure local development

Copy `.env.example` to `.env.local`, fill every value, and run. The current Supabase publishable key belongs in `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (the app also accepts the legacy `NEXT_PUBLIC_SUPABASE_ANON_KEY`):

```powershell
npm.cmd run check
npm.cmd run dev
```

Open `http://localhost:3000/api/health`. Every check should say `configured`; the overall status should be `ready`.

## 4. Test accounts

Create two accounts at `/auth/sign-up`. If Supabase email confirmation is enabled, confirm both. Verify sign-in, sign-out, and a row for each account in `public.profiles`.

## 5. Import fixtures

With the local server running, replace the secret and dates below:

```powershell
$headers = @{ Authorization = "Bearer YOUR_SYNC_SECRET" }
Invoke-RestMethod -Method Post -Headers $headers -Uri "http://localhost:3000/api/sync/fixtures?season=2026&from=2026-08-01&to=2026-08-31"
```

Reload the homepage and verify database fixtures replace preview fixtures.

## 6. Verify predictions

Choose a future match, submit multiple predictions, reload, and submit an edit. In Supabase, confirm one row per user/match/type. Confirm another user cannot read or modify those rows. Test deadline boundaries only with a temporary test fixture.

## 7. Verify lineups and live data

When the provider publishes a lineup:

```powershell
Invoke-RestMethod -Method Post -Headers $headers -Uri "http://localhost:3000/api/sync/lineups/PROVIDER_FIXTURE_ID"
```

Verify player questions show only players from that match. During a live fixture, call `/api/sync/live`, then `/api/sync/live/PROVIDER_FIXTURE_ID`, and inspect `/live`.

## 8. Verify final scoring

After a fixture is final:

```powershell
Invoke-RestMethod -Method Post -Headers $headers -Uri "http://localhost:3000/api/finalize/PROVIDER_FIXTURE_ID"
```

Call it twice. The second run must not create duplicate `prediction_results`. Confirm leaderboard points and history update.

## 9. Deploy to Vercel

Push this directory to a private GitHub repository, import it into Vercel, and add every `.env.local` value to Vercel environment variables. Deploy and check `/api/health`. Vercel reads `vercel.json` for scheduled sync. Confirm your plan supports its five-minute schedule; otherwise use an external scheduler to call `/api/cron/matches` with `Authorization: Bearer CRON_SECRET`.

## 10. Production acceptance test

With two test accounts, complete: sign in → see imported fixture → submit/edit predictions → verify kickoff lock → observe live page → finalize match → confirm history and leaderboard. Invite friends only after this passes.
