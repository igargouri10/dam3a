# DAM3A automated football-data sync

## Production schedules

- `/api/cron/matches`: daily at 04:00 UTC on the Vercel Hobby fallback. Change this to `*/3 * * * *` after upgrading the Vercel project to Pro. It fetches configured live competitions, refreshes events and team/player statistics, syncs nearby lineups, finalizes completed predictions, and recalculates Fantasy gameweeks.
- `/api/cron/catalog`: daily at 03:17 UTC. Refreshes a rolling fixture window from two days ago through sixty days ahead. Team membership is refreshed each Sunday.

Both routes require `Authorization: Bearer $CRON_SECRET`. Vercel supplies this header to configured Cron Jobs.

## Quota protection

API-Football response limit headers are captured in each job result. Optional calls stop when fewer than 150 daily requests remain. With no live matches, the live job uses 480 requests per day; detailed calls are made only for currently live fixtures.

## Deployment

1. Run `supabase/migrations/022_automated_fantasy_scoring.sql` in the Supabase SQL Editor.
2. Deploy the current project to Vercel so the updated `vercel.json` schedules are registered.
3. Confirm `API_FOOTBALL_KEY`, `API_FOOTBALL_BASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SYNC_SECRET`, and `CRON_SECRET` exist in the Vercel Production environment.
4. Inspect Vercel Cron Jobs and Runtime Logs after deployment.

## Manual verification

```powershell
$cronSecret = ((Get-Content .env.local | Where-Object { $_ -match '^CRON_SECRET=' }) -replace '^CRON_SECRET=', '').Trim()
$headers = @{ Authorization = "Bearer $cronSecret" }

Invoke-RestMethod -Method Get -Uri "https://football-prediction-platform-live.vercel.app/api/cron/catalog" -Headers $headers
Invoke-RestMethod -Method Get -Uri "https://football-prediction-platform-live.vercel.app/api/cron/matches" -Headers $headers
```

The response includes the latest API-Football quota values and any per-fixture errors.
