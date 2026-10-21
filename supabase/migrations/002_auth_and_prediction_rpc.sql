-- Create a profile for every new Supabase Auth user.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles(id, username)
  values (new.id, coalesce(nullif(new.raw_user_meta_data->>'username',''), split_part(new.email,'@',1) || '-' || left(new.id::text,6)));
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute procedure public.handle_new_user();

-- One authenticated, atomic write boundary. The database checks kickoff time again,
-- so a forged or delayed browser request cannot submit a late prediction.
create or replace function public.submit_predictions(prediction_payload jsonb)
returns integer language plpgsql security invoker set search_path = public as $$
declare
  item jsonb;
  target_match matches%rowtype;
  target_type prediction_types%rowtype;
  availability match_prediction_types%rowtype;
  saved integer := 0;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if jsonb_typeof(prediction_payload) <> 'array' or jsonb_array_length(prediction_payload) = 0 then raise exception 'At least one prediction is required'; end if;

  for item in select * from jsonb_array_elements(prediction_payload)
  loop
    select * into target_match from matches where provider_id = item->>'matchId';
    if not found then raise exception 'Match not found'; end if;
    select * into target_type from prediction_types where code = item->>'type' and enabled = true;
    if not found then raise exception 'Prediction type is unavailable'; end if;
    select * into availability from match_prediction_types where match_id=target_match.id and prediction_type_id=target_type.id and enabled=true;
    if not found then raise exception 'Prediction is not enabled for this match'; end if;
    if now() >= least(target_match.kickoff_at, availability.lock_at) then raise exception 'Predictions are locked for this match'; end if;

    insert into predictions(user_id,match_id,prediction_type_id,value_json)
    values(auth.uid(),target_match.id,target_type.id,item->'value')
    on conflict(user_id,match_id,prediction_type_id) do update
      set value_json=excluded.value_json, updated_at=now()
      where now() < (select least(m.kickoff_at,mpt.lock_at) from matches m join match_prediction_types mpt on mpt.match_id=m.id where m.id=excluded.match_id and mpt.prediction_type_id=excluded.prediction_type_id);
    if not found then raise exception 'Predictions are locked for this match'; end if;
    saved := saved + 1;
  end loop;
  return saved;
end;
$$;

revoke all on function public.submit_predictions(jsonb) from public;
grant execute on function public.submit_predictions(jsonb) to authenticated;

-- Public app data is read-only; user-owned predictions remain protected by RLS.
alter table competitions enable row level security; alter table competition_rounds enable row level security;
alter table teams enable row level security; alter table matches enable row level security;
alter table prediction_types enable row level security; alter table match_prediction_types enable row level security;
create policy "competitions readable" on competitions for select using (true);
create policy "rounds readable" on competition_rounds for select using (true);
create policy "teams readable" on teams for select using (true);
create policy "matches readable" on matches for select using (true);
create policy "prediction types readable" on prediction_types for select using (enabled=true);
create policy "match questions readable" on match_prediction_types for select using (enabled=true);
