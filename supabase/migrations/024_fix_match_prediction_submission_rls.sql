-- The submission RPC performs its own authentication, availability, value,
-- and kickoff-lock validation. Run the final upsert as the function owner so
-- the same write is not rejected a second time by table RLS.
alter function public.submit_predictions(jsonb) security definer;
alter function public.submit_predictions(jsonb) set search_path = public;

revoke all on function public.submit_predictions(jsonb) from public, anon;
grant execute on function public.submit_predictions(jsonb) to authenticated;

notify pgrst, 'reload schema';
