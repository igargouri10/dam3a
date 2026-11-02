-- Public, provider-backed football analytics for the top five leagues and UCL.
create table if not exists public.analytics_player_match_stats(
  match_id uuid not null references public.matches(id) on delete cascade,
  player_provider_id text not null,
  team_provider_id text not null,
  player_name text not null,
  position text not null,
  minutes integer not null default 0,
  goals integer not null default 0,
  assists integer not null default 0,
  rating numeric,
  shots_total integer not null default 0,
  shots_on_target integer not null default 0,
  passes_total integer not null default 0,
  key_passes integer not null default 0,
  pass_accuracy numeric,
  tackles integer not null default 0,
  interceptions integer not null default 0,
  duels_total integer not null default 0,
  duels_won integer not null default 0,
  dribbles_attempted integer not null default 0,
  dribbles_successful integer not null default 0,
  yellow_cards integer not null default 0,
  red_cards integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key(match_id,player_provider_id,team_provider_id)
);
create index if not exists analytics_player_lookup_idx on public.analytics_player_match_stats(player_provider_id,team_provider_id);
alter table public.analytics_player_match_stats enable row level security;
drop policy if exists "analytics player stats readable" on public.analytics_player_match_stats;
create policy "analytics player stats readable" on public.analytics_player_match_stats for select using(true);

create or replace function public.sync_analytics_player_stats(fixture_provider_id text,normalized_stats jsonb)
returns integer language plpgsql security definer set search_path=public as $$
declare target_match_id uuid;item jsonb;saved integer:=0;
begin
  if current_setting('request.jwt.claim.role',true)<>'service_role' then raise exception 'Service role required';end if;
  select id into target_match_id from matches where provider='api-football'and provider_id=fixture_provider_id;
  if target_match_id is null then raise exception 'Match not found';end if;
  for item in select*from jsonb_array_elements(normalized_stats) loop
    insert into analytics_player_match_stats(match_id,player_provider_id,team_provider_id,player_name,position,minutes,goals,assists,rating,shots_total,shots_on_target,passes_total,key_passes,pass_accuracy,tackles,interceptions,duels_total,duels_won,dribbles_attempted,dribbles_successful,yellow_cards,red_cards,updated_at)
    values(target_match_id,item->>'providerPlayerId',item->>'teamProviderId',item->>'name',item->>'position',coalesce((item->>'minutes')::integer,0),coalesce((item->>'goals')::integer,0),coalesce((item->>'assists')::integer,0),nullif(item->>'rating','')::numeric,coalesce((item->>'shotsTotal')::integer,0),coalesce((item->>'shotsOnTarget')::integer,0),coalesce((item->>'passesTotal')::integer,0),coalesce((item->>'keyPasses')::integer,0),nullif(item->>'passAccuracy','')::numeric,coalesce((item->>'tackles')::integer,0),coalesce((item->>'interceptions')::integer,0),coalesce((item->>'duelsTotal')::integer,0),coalesce((item->>'duelsWon')::integer,0),coalesce((item->>'dribblesAttempted')::integer,0),coalesce((item->>'dribblesSuccessful')::integer,0),coalesce((item->>'yellowCards')::integer,0),coalesce((item->>'redCards')::integer,0),now())
    on conflict(match_id,player_provider_id,team_provider_id)do update set player_name=excluded.player_name,position=excluded.position,minutes=excluded.minutes,goals=excluded.goals,assists=excluded.assists,rating=excluded.rating,shots_total=excluded.shots_total,shots_on_target=excluded.shots_on_target,passes_total=excluded.passes_total,key_passes=excluded.key_passes,pass_accuracy=excluded.pass_accuracy,tackles=excluded.tackles,interceptions=excluded.interceptions,duels_total=excluded.duels_total,duels_won=excluded.duels_won,dribbles_attempted=excluded.dribbles_attempted,dribbles_successful=excluded.dribbles_successful,yellow_cards=excluded.yellow_cards,red_cards=excluded.red_cards,updated_at=now();
    saved:=saved+1;
  end loop;
  return saved;
end;$$;
revoke all on function public.sync_analytics_player_stats(text,jsonb)from public,anon,authenticated;
grant execute on function public.sync_analytics_player_stats(text,jsonb)to service_role;

create or replace function public.get_analytics_backfill_targets(target_limit integer default 12)
returns table(provider_id text)language sql stable security definer set search_path=public as $$
  select m.provider_id from matches m join competitions c on c.id=m.competition_id
  where c.provider='api-football'and c.provider_id in('39','140','135','78','61','2')and m.status='FINISHED'
    and not exists(select 1 from analytics_player_match_stats s where s.match_id=m.id)
  order by m.kickoff_at desc limit greatest(1,least(target_limit,50));
$$;
revoke all on function public.get_analytics_backfill_targets(integer)from public,anon,authenticated;
grant execute on function public.get_analytics_backfill_targets(integer)to service_role;

create or replace function public.get_analytics_catalog()
returns jsonb language sql stable security definer set search_path=public as $$
with selected_competitions as(
  select id,provider_id,name,country,season from competitions
  where provider='api-football'and provider_id in('39','140','135','78','61','2')
),team_rows as(
  select distinct c.provider_id competition_id,c.name competition_name,c.country,c.season,t.provider_id id,t.name,t.short_name,t.logo_url
  from selected_competitions c join competition_teams ct on ct.competition_id=c.id join teams t on t.id=ct.team_id
),player_rows as(
  select distinct c.provider_id competition_id,sp.provider_player_id id,sp.team_provider_id team_id,sp.name,sp.position
  from selected_competitions c join season_prediction_players sp on sp.competition_id=c.id
)
select jsonb_build_object(
  'competitions',coalesce((select jsonb_agg(jsonb_build_object('id',provider_id,'name',name,'country',country,'season',season)order by case provider_id when'2'then 0 when'39'then 1 when'140'then 2 when'135'then 3 when'78'then 4 else 5 end)from selected_competitions),'[]'::jsonb),
  'teams',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name,'shortName',short_name,'logoUrl',logo_url,'competitionId',competition_id,'competitionName',competition_name,'country',country,'season',season)order by name)from team_rows),'[]'::jsonb),
  'players',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name,'teamId',team_id,'position',position,'competitionId',competition_id)order by name)from player_rows),'[]'::jsonb)
);$$;
revoke all on function public.get_analytics_catalog()from public;
grant execute on function public.get_analytics_catalog()to anon,authenticated;

create or replace function public.get_analytics_dashboard(competition_provider_ids text[] default array['2']::text[],team_provider_ids text[] default null,player_provider_ids text[] default null,season_years integer[] default null,from_date timestamptz default null,to_date timestamptz default null,recent_limit integer default 5,match_limit integer default null)
returns jsonb language sql stable security definer set search_path=public as $$
with raw_target_matches as(
  select m.*,c.provider_id competition_provider_id,c.name competition_name,home.provider_id home_provider_id,home.name home_name,home.logo_url home_logo_url,away.provider_id away_provider_id,away.name away_name,away.logo_url away_logo_url
  from matches m join competitions c on c.id=m.competition_id join teams home on home.id=m.home_team_id join teams away on away.id=m.away_team_id
  where c.provider='api-football'and c.provider_id=any(competition_provider_ids)
    and(season_years is null or c.season=any(season_years))
    and(from_date is null or m.kickoff_at>=from_date)and(to_date is null or m.kickoff_at<=to_date)
    and(team_provider_ids is null or home.provider_id=any(team_provider_ids)or away.provider_id=any(team_provider_ids))
),target_matches as(
  select*from raw_target_matches r where match_limit is null or r.id in(select id from raw_target_matches where status='FINISHED'order by kickoff_at desc limit greatest(1,least(match_limit,100)))
),finished as(select*from target_matches where status='FINISHED'and home_score is not null and away_score is not null),
team_matches as(
  select competition_provider_id,home_provider_id team_id,home_name team_name,home_logo_url logo_url,home_score gf,away_score ga,case when home_score>away_score then 3 when home_score=away_score then 1 else 0 end pts from finished
  union all
  select competition_provider_id,away_provider_id,away_name,away_logo_url,away_score,home_score,case when away_score>home_score then 3 when away_score=home_score then 1 else 0 end from finished
),standings as(
  select competition_provider_id,team_id,team_name,logo_url,count(*) played,sum((pts=3)::int) won,sum((pts=1)::int) drawn,sum((pts=0)::int) lost,sum(gf) goals_for,sum(ga) goals_against,sum(gf-ga) goal_difference,sum(pts) points
  from team_matches group by competition_provider_id,team_id,team_name,logo_url
),ranked_standings as(select*,dense_rank()over(partition by competition_provider_id order by points desc,goal_difference desc,goals_for desc,team_name) rank from standings),
recent as(select*from target_matches where status='FINISHED'order by kickoff_at desc limit greatest(1,least(recent_limit,20))),
player_rows as(
  select aps.*,tm.competition_provider_id,tm.kickoff_at,t.name team_name,t.logo_url team_logo_url
  from analytics_player_match_stats aps join target_matches tm on tm.id=aps.match_id left join teams t on t.provider='api-football'and t.provider_id=aps.team_provider_id
  where(player_provider_ids is null or aps.player_provider_id=any(player_provider_ids))
),player_totals as(
  select player_provider_id id,max(player_name)name,team_provider_id,max(team_name)team_name,max(team_logo_url)team_logo_url,max(position)position,count(*)filter(where minutes>0)appearances,sum(minutes)minutes,sum(goals)goals,sum(assists)assists,round(avg(rating)filter(where rating is not null),2)rating,sum(shots_total)shots_total,sum(shots_on_target)shots_on_target,sum(passes_total)passes_total,sum(key_passes)key_passes,round(avg(pass_accuracy)filter(where pass_accuracy is not null),1)pass_accuracy,sum(tackles)tackles,sum(interceptions)interceptions,sum(duels_total)duels_total,sum(duels_won)duels_won,sum(dribbles_attempted)dribbles_attempted,sum(dribbles_successful)dribbles_successful,sum(yellow_cards)yellow_cards,sum(red_cards)red_cards
  from player_rows group by player_provider_id,team_provider_id
),team_totals as(
  select team_id id,max(team_name)name,max(logo_url)logo_url,count(*)matches,sum((pts=3)::int)won,sum((pts=1)::int)drawn,sum((pts=0)::int)lost,sum(gf)goals_for,sum(ga)goals_against,sum(gf-ga)goal_difference,sum(pts)points
  from team_matches where(team_provider_ids is null or team_id=any(team_provider_ids))group by team_id
)
select jsonb_build_object(
  'standings',coalesce((select jsonb_agg(to_jsonb(s)order by competition_provider_id,rank)from ranked_standings s),'[]'::jsonb),
  'recentResults',coalesce((select jsonb_agg(jsonb_build_object('id',provider_id,'competitionId',competition_provider_id,'competition',competition_name,'kickoffAt',kickoff_at,'home',jsonb_build_object('id',home_provider_id,'name',home_name,'logoUrl',home_logo_url,'score',home_score),'away',jsonb_build_object('id',away_provider_id,'name',away_name,'logoUrl',away_logo_url,'score',away_score))order by kickoff_at desc)from recent),'[]'::jsonb),
  'topScorers',coalesce((select jsonb_agg(to_jsonb(x)order by goals desc,assists desc,name)from(select*from player_totals order by goals desc,assists desc limit 10)x),'[]'::jsonb),
  'topAssisters',coalesce((select jsonb_agg(to_jsonb(x)order by assists desc,goals desc,name)from(select*from player_totals order by assists desc,goals desc limit 10)x),'[]'::jsonb),
  'bestRated',coalesce((select jsonb_agg(to_jsonb(x)order by rating desc nulls last,appearances desc,name)from(select*from player_totals where appearances>0 order by rating desc nulls last,appearances desc limit 10)x),'[]'::jsonb),
  'teamComparison',coalesce((select jsonb_agg(to_jsonb(t)order by points desc,name)from team_totals t),'[]'::jsonb),
  'playerComparison',coalesce((select jsonb_agg(to_jsonb(p)order by rating desc nulls last,name)from player_totals p where player_provider_ids is not null),'[]'::jsonb),
  'dataThrough',(select max(kickoff_at)from finished)
);$$;
revoke all on function public.get_analytics_dashboard(text[],text[],text[],integer[],timestamptz,timestamptz,integer,integer)from public;
grant execute on function public.get_analytics_dashboard(text[],text[],text[],integer[],timestamptz,timestamptz,integer,integer)to anon,authenticated;

notify pgrst,'reload schema';
