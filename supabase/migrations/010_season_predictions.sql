create table if not exists public.season_predictions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  competition_id uuid not null references public.competitions(id) on delete cascade,
  prediction_code text not null check (prediction_code in ('FINAL_TABLE','WINNER','MOST_CLEAN_SHEETS','TOP_SCORER','TOP_ASSISTER')),
  value_json jsonb not null,
  status prediction_status not null default 'PENDING',
  points_awarded integer not null default 0,
  submitted_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, competition_id, prediction_code)
);

alter table public.season_predictions enable row level security;

create policy "own season predictions read" on public.season_predictions
for select to authenticated using (auth.uid() = user_id);

create policy "own season predictions insert" on public.season_predictions
for insert to authenticated with check (
  auth.uid() = user_id and now() < (
    select min(m.kickoff_at) from public.matches m where m.competition_id = season_predictions.competition_id
  )
);

create policy "own season predictions update before first match" on public.season_predictions
for update to authenticated
using (auth.uid() = user_id and now() < (select min(m.kickoff_at) from public.matches m where m.competition_id = season_predictions.competition_id))
with check (auth.uid() = user_id and now() < (select min(m.kickoff_at) from public.matches m where m.competition_id = season_predictions.competition_id));

create or replace function public.get_season_prediction_context(competition_provider_id text, competition_season integer)
returns jsonb language sql stable security definer set search_path = public as $$
  with target as (
    select c.id, c.name from competitions c
    where c.provider = 'api-football' and c.provider_id = competition_provider_id and c.season = competition_season
    limit 1
  ), club_rows as (
    select distinct t.provider_id, t.name, t.short_name, t.logo_url
    from target c join matches m on m.competition_id = c.id
    join teams t on t.id in (m.home_team_id, m.away_team_id)
  )
  select jsonb_build_object(
    'available', exists(select 1 from target),
    'competition', (select name from target),
    'lockAt', (select min(m.kickoff_at) from matches m join target t on t.id = m.competition_id),
    'locked', coalesce(now() >= (select min(m.kickoff_at) from matches m join target t on t.id = m.competition_id), false),
    'teams', coalesce((select jsonb_agg(jsonb_build_object('id',provider_id,'name',name,'shortName',short_name,'logoUrl',logo_url) order by name) from club_rows), '[]'::jsonb),
    'picks', coalesce((select jsonb_object_agg(sp.prediction_code, sp.value_json) from season_predictions sp join target t on t.id=sp.competition_id where sp.user_id=auth.uid()), '{}'::jsonb)
  );
$$;

grant execute on function public.get_season_prediction_context(text, integer) to anon, authenticated;

create or replace function public.submit_season_predictions(competition_provider_id text, competition_season integer, prediction_payload jsonb)
returns integer language plpgsql security invoker set search_path = public as $$
declare
  target_competition competitions%rowtype;
  first_kickoff timestamptz;
  item record;
  answer jsonb;
  team_count integer;
  saved integer := 0;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into target_competition from competitions where provider='api-football' and provider_id=competition_provider_id and season=competition_season limit 1;
  if not found then raise exception 'Competition fixtures must be synced first'; end if;
  select min(kickoff_at) into first_kickoff from matches where competition_id=target_competition.id;
  if first_kickoff is null then raise exception 'Competition fixtures must be synced first'; end if;
  if now() >= first_kickoff then raise exception 'Season predictions are locked'; end if;
  if jsonb_typeof(prediction_payload) <> 'object' then raise exception 'Invalid season predictions'; end if;

  for item in select key, value from jsonb_each(prediction_payload) loop
    if competition_provider_id in ('39','140') and item.key not in ('FINAL_TABLE','MOST_CLEAN_SHEETS','TOP_SCORER','TOP_ASSISTER') then raise exception 'Prediction is unavailable for this competition'; end if;
    if competition_provider_id = '2' and item.key not in ('WINNER','MOST_CLEAN_SHEETS','TOP_SCORER','TOP_ASSISTER') then raise exception 'Prediction is unavailable for this competition'; end if;
    if competition_provider_id not in ('39','140','2') then raise exception 'Season predictions are unavailable for this competition'; end if;
    answer := item.value;

    if item.key = 'FINAL_TABLE' then
      select count(distinct t.id) into team_count from matches m join teams t on t.id in (m.home_team_id,m.away_team_id) where m.competition_id=target_competition.id;
      if jsonb_typeof(answer) <> 'array' or jsonb_array_length(answer) <> team_count or
         (select count(distinct value) from jsonb_array_elements_text(answer)) <> team_count or
         exists(select 1 from jsonb_array_elements_text(answer) as x(value) where not exists(select 1 from matches m join teams t on t.id in(m.home_team_id,m.away_team_id) where m.competition_id=target_competition.id and t.provider_id=x.value))
      then raise exception 'Final table must rank every club exactly once'; end if;
    elsif item.key in ('WINNER','MOST_CLEAN_SHEETS') then
      if jsonb_typeof(answer) <> 'string' or not exists(select 1 from matches m join teams t on t.id in(m.home_team_id,m.away_team_id) where m.competition_id=target_competition.id and t.provider_id=answer#>>'{}') then raise exception 'Select a valid club'; end if;
    elsif item.key in ('TOP_SCORER','TOP_ASSISTER') then
      if jsonb_typeof(answer) <> 'string' or length(trim(answer#>>'{}')) < 2 then raise exception 'Enter a player name'; end if;
    end if;

    insert into season_predictions(user_id,competition_id,prediction_code,value_json)
    values(auth.uid(),target_competition.id,item.key,answer)
    on conflict(user_id,competition_id,prediction_code) do update set value_json=excluded.value_json,updated_at=now();
    saved := saved + 1;
  end loop;
  return saved;
end;
$$;

revoke all on function public.submit_season_predictions(text, integer, jsonb) from public, anon;
grant execute on function public.submit_season_predictions(text, integer, jsonb) to authenticated;
