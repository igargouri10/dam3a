create table if not exists public.competition_teams(competition_id uuid not null references public.competitions(id) on delete cascade,team_id uuid not null references public.teams(id) on delete cascade,primary key(competition_id,team_id));
alter table public.competition_teams enable row level security;
drop policy if exists "competition teams readable" on public.competition_teams;
create policy "competition teams readable" on public.competition_teams for select using(true);
insert into public.competition_teams(competition_id,team_id) select competition_id,home_team_id from matches union select competition_id,away_team_id from matches on conflict do nothing;
create or replace function public.get_competition_teams(competition_provider_id text,competition_season integer)returns table(provider_id text,name text,short_name text,logo_url text)language sql stable security definer set search_path=public as $$select t.provider_id,t.name,t.short_name,t.logo_url from competitions c join competition_teams ct on ct.competition_id=c.id join teams t on t.id=ct.team_id where c.provider='api-football'and c.provider_id=competition_provider_id and c.season=competition_season order by t.name;$$;
grant execute on function public.get_competition_teams(text,integer) to anon,authenticated;
create or replace function public.season_prediction_lock_at(target_id uuid)returns timestamptz language sql stable security definer set search_path=public as $$select case when c.provider_id='2' then(select min(m.kickoff_at)from matches m join competition_rounds r on r.id=m.round_id where m.competition_id=c.id and(r.name ilike '%league phase%'or r.name ilike '%league stage%'))else(select min(m.kickoff_at)from matches m where m.competition_id=c.id)end from competitions c where c.id=target_id;$$;
create or replace function public.get_season_prediction_context(competition_provider_id text,competition_season integer)returns jsonb language sql stable security definer set search_path=public as $$with target as(select c.id,c.name from competitions c where c.provider='api-football'and c.provider_id=competition_provider_id and c.season=competition_season limit 1),club_rows as(select distinct t.provider_id,t.name,t.short_name,t.logo_url from target c join competition_teams ct on ct.competition_id=c.id join teams t on t.id=ct.team_id)select jsonb_build_object('available',exists(select 1 from target),'competition',(select name from target),'lockAt',(select season_prediction_lock_at(id)from target),'locked',coalesce(now()>=(select season_prediction_lock_at(id)from target),false),'teams',coalesce((select jsonb_agg(jsonb_build_object('id',provider_id,'name',name,'shortName',short_name,'logoUrl',logo_url)order by name)from club_rows),'[]'::jsonb),'picks',coalesce((select jsonb_object_agg(sp.prediction_code,sp.value_json)from season_predictions sp join target t on t.id=sp.competition_id where sp.user_id=auth.uid()),'{}'::jsonb));$$;
grant execute on function public.get_season_prediction_context(text,integer) to anon,authenticated;

drop policy if exists "own season predictions insert" on public.season_predictions;
create policy "own season predictions insert" on public.season_predictions for insert to authenticated with check(auth.uid()=user_id and coalesce(now()<season_prediction_lock_at(competition_id),true));
drop policy if exists "own season predictions update before first match" on public.season_predictions;
create policy "own season predictions update before first match" on public.season_predictions for update to authenticated using(auth.uid()=user_id and coalesce(now()<season_prediction_lock_at(competition_id),true))with check(auth.uid()=user_id and coalesce(now()<season_prediction_lock_at(competition_id),true));

create or replace function public.submit_season_predictions(competition_provider_id text,competition_season integer,prediction_payload jsonb)returns integer language plpgsql security invoker set search_path=public as $$
declare target_competition competitions%rowtype;first_kickoff timestamptz;item record;answer jsonb;team_count integer;saved integer:=0;
begin
 if auth.uid()is null then raise exception 'Authentication required';end if;
 select*into target_competition from competitions where provider='api-football'and provider_id=competition_provider_id and season=competition_season limit 1;if not found then raise exception 'Competition teams must be synced first';end if;
 select season_prediction_lock_at(target_competition.id)into first_kickoff;if first_kickoff is not null and now()>=first_kickoff then raise exception 'Season predictions are locked';end if;
 if jsonb_typeof(prediction_payload)<>'object'then raise exception 'Invalid season predictions';end if;
 for item in select key,value from jsonb_each(prediction_payload)loop
  if competition_provider_id in('39','140')and item.key not in('FINAL_TABLE','MOST_CLEAN_SHEETS','TOP_SCORER','TOP_ASSISTER')then raise exception 'Prediction is unavailable for this competition';end if;
  if competition_provider_id='2'and item.key not in('WINNER','MOST_CLEAN_SHEETS','TOP_SCORER','TOP_ASSISTER')then raise exception 'Prediction is unavailable for this competition';end if;
  answer:=item.value;
  if item.key='FINAL_TABLE'then select count(*)into team_count from competition_teams where competition_id=target_competition.id;if jsonb_typeof(answer)<>'array'or jsonb_array_length(answer)<>team_count or(select count(distinct value)from jsonb_array_elements_text(answer))<>team_count or exists(select 1 from jsonb_array_elements_text(answer)x(value)where not exists(select 1 from competition_teams ct join teams t on t.id=ct.team_id where ct.competition_id=target_competition.id and t.provider_id=x.value))then raise exception 'Final table must rank every club exactly once';end if;
  elsif item.key in('WINNER','MOST_CLEAN_SHEETS')then if jsonb_typeof(answer)<>'string'or not exists(select 1 from competition_teams ct join teams t on t.id=ct.team_id where ct.competition_id=target_competition.id and t.provider_id=answer#>>'{}')then raise exception 'Select a valid club';end if;
  elsif item.key in('TOP_SCORER','TOP_ASSISTER')then if jsonb_typeof(answer)<>'string'or length(trim(answer#>>'{}'))<2 then raise exception 'Enter a player name';end if;end if;
  insert into season_predictions(user_id,competition_id,prediction_code,value_json)values(auth.uid(),target_competition.id,item.key,answer)on conflict(user_id,competition_id,prediction_code)do update set value_json=excluded.value_json,updated_at=now();saved:=saved+1;
 end loop;return saved;
end;$$;
revoke all on function public.submit_season_predictions(text,integer,jsonb)from public,anon;grant execute on function public.submit_season_predictions(text,integer,jsonb)to authenticated;
notify pgrst,'reload schema';
