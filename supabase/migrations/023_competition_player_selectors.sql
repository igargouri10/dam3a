-- Competition-scoped player selectors for season scorer and assister picks.
create table if not exists public.season_prediction_players(
  competition_id uuid not null references public.competitions(id)on delete cascade,
  provider_player_id text not null,
  team_provider_id text not null,
  name text not null,
  position text not null check(position in('GK','DEF','MID','FWD')),
  updated_at timestamptz not null default now(),
  primary key(competition_id,provider_player_id,team_provider_id)
);
alter table public.season_prediction_players enable row level security;
drop policy if exists "season prediction players readable" on public.season_prediction_players;
create policy "season prediction players readable" on public.season_prediction_players for select using(true);

create or replace function public.sync_season_prediction_player_catalog(competition_provider_id text,competition_season integer,catalog_players jsonb)
returns integer language plpgsql security definer set search_path=public as $$
declare target_id uuid;item jsonb;saved integer:=0;
begin
  if current_setting('request.jwt.claim.role',true)<>'service_role'then raise exception 'Service role required';end if;
  select id into target_id from competitions where provider='api-football'and provider_id=competition_provider_id and season=competition_season limit 1;
  if target_id is null then raise exception 'Competition not found';end if;
  delete from season_prediction_players where competition_id=target_id;
  for item in select*from jsonb_array_elements(catalog_players)loop
    insert into season_prediction_players(competition_id,provider_player_id,team_provider_id,name,position,updated_at)
    values(target_id,item->>'providerPlayerId',item->>'teamProviderId',item->>'name',item->>'position',now())
    on conflict(competition_id,provider_player_id,team_provider_id)do update set name=excluded.name,position=excluded.position,updated_at=now();saved:=saved+1;
  end loop;return saved;
end;$$;
revoke all on function public.sync_season_prediction_player_catalog(text,integer,jsonb)from public,anon,authenticated;
grant execute on function public.sync_season_prediction_player_catalog(text,integer,jsonb)to service_role;

create or replace function public.get_season_prediction_players(competition_provider_id text,competition_season integer)
returns table(id text,"providerPlayerId" text,name text,"teamId" text,"teamName" text,"position" text)
language sql stable security definer set search_path=public as $$
  select concat(sp.provider_player_id,':',sp.team_provider_id),sp.provider_player_id,sp.name,sp.team_provider_id,t.name,sp.position
  from competitions c join season_prediction_players sp on sp.competition_id=c.id join teams t on t.provider='api-football'and t.provider_id=sp.team_provider_id
  where c.provider='api-football'and c.provider_id=competition_provider_id and c.season=competition_season
  order by t.name,sp.position,sp.name;
$$;
revoke all on function public.get_season_prediction_players(text,integer)from public;
grant execute on function public.get_season_prediction_players(text,integer)to anon,authenticated;

create or replace function public.validate_season_player_pick()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.prediction_code in('TOP_SCORER','TOP_ASSISTER')and not exists(
    select 1 from season_prediction_players sp
    where sp.competition_id=new.competition_id and concat(sp.provider_player_id,':',sp.team_provider_id)=new.value_json#>>'{}'
  )then raise exception 'Select a player from this competition';end if;
  return new;
end;$$;
drop trigger if exists validate_season_player_pick_trigger on public.season_predictions;
create trigger validate_season_player_pick_trigger before insert or update on public.season_predictions for each row execute function public.validate_season_player_pick();

create or replace function public.get_my_season_predictions()
returns table(prediction_id uuid,competition text,prediction_code text,selected_value jsonb,status prediction_status,points_awarded integer,updated_at timestamptz,lock_at timestamptz)
language sql stable security definer set search_path=public as $$
 select sp.id,c.name,sp.prediction_code,
   case when sp.prediction_code in('TOP_SCORER','TOP_ASSISTER')then to_jsonb(coalesce((select pp.name from season_prediction_players pp where pp.competition_id=sp.competition_id and concat(pp.provider_player_id,':',pp.team_provider_id)=sp.value_json#>>'{}'limit 1),sp.value_json#>>'{}'))else sp.value_json end,
   sp.status,sp.points_awarded,sp.updated_at,(select min(m.kickoff_at)from matches m where m.competition_id=c.id)
 from season_predictions sp join competitions c on c.id=sp.competition_id where sp.user_id=auth.uid() order by sp.updated_at desc;
$$;
revoke all on function public.get_my_season_predictions()from public,anon;
grant execute on function public.get_my_season_predictions()to authenticated;
notify pgrst,'reload schema';
