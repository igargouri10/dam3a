-- Migration 008 removed these policies while hardening the submission RPC.
-- The RPC is SECURITY INVOKER, so authenticated users still need RLS permission
-- to insert and update only their own, unlocked predictions.

drop policy if exists "own predictions insert" on public.predictions;
create policy "own predictions insert"
on public.predictions
for insert
to authenticated
with check (
  auth.uid() = user_id
  and exists (
    select 1
    from public.matches m
    join public.match_prediction_types mpt
      on mpt.match_id = m.id
     and mpt.prediction_type_id = predictions.prediction_type_id
    where m.id = predictions.match_id
      and mpt.enabled = true
      and now() < least(m.kickoff_at, mpt.lock_at)
  )
);

drop policy if exists "own predictions update before kickoff" on public.predictions;
create policy "own predictions update before kickoff"
on public.predictions
for update
to authenticated
using (
  auth.uid() = user_id
  and exists (
    select 1
    from public.matches m
    join public.match_prediction_types mpt
      on mpt.match_id = m.id
     and mpt.prediction_type_id = predictions.prediction_type_id
    where m.id = predictions.match_id
      and mpt.enabled = true
      and now() < least(m.kickoff_at, mpt.lock_at)
  )
)
with check (
  auth.uid() = user_id
  and exists (
    select 1
    from public.matches m
    join public.match_prediction_types mpt
      on mpt.match_id = m.id
     and mpt.prediction_type_id = predictions.prediction_type_id
    where m.id = predictions.match_id
      and mpt.enabled = true
      and now() < least(m.kickoff_at, mpt.lock_at)
  )
);
