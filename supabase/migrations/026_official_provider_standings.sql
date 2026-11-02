-- Cache provider-issued standings instead of reconstructing tables from fixtures.
create table if not exists public.analytics_provider_standings(
  competition_id uuid not null references public.competitions(id) on delete cascade,
  team_provider_id text not null,
  group_name text not null default 'Overall',
  team_name text not null,
  logo_url text,
  rank integer not null,
  played integer not null default 0,
  won integer not null default 0,
  drawn integer not null default 0,
  lost integer not null default 0,
  goals_for integer not null default 0,
  goals_against integer not null default 0,
  goal_difference integer not null default 0,
  points integer not null default 0,
  form text,
  updated_at timestamptz not null default now(),
  primary key(competition_id,team_provider_id,group_name)
);
alter table public.analytics_provider_standings enable row level security;
drop policy if exists "provider standings readable" on public.analytics_provider_standings;
create policy "provider standings readable" on public.analytics_provider_standings for select using(true);

create or replace function public.sync_provider_standings(competition_provider_id text,competition_season integer,standing_rows jsonb)
returns integer language plpgsql security definer set search_path=public as $$
declare target_id uuid;item jsonb;saved integer:=0;
begin
  if current_setting('request.jwt.claim.role',true)<>'service_role' then raise exception 'Service role required';end if;
  select id into target_id from competitions where provider='api-football'and provider_id=competition_provider_id and season=competition_season limit 1;
  if target_id is null then raise exception 'Competition not found';end if;
  delete from analytics_provider_standings where competition_id=target_id;
  for item in select*from jsonb_array_elements(standing_rows) loop
    insert into analytics_provider_standings(competition_id,team_provider_id,group_name,team_name,logo_url,rank,played,won,drawn,lost,goals_for,goals_against,goal_difference,points,form,updated_at)
    values(target_id,item->'team'->>'id',coalesce(item->>'group','Overall'),item->'team'->>'name',item->'team'->>'logoUrl',(item->>'rank')::integer,(item->>'played')::integer,(item->>'won')::integer,(item->>'drawn')::integer,(item->>'lost')::integer,(item->>'goalsFor')::integer,(item->>'goalsAgainst')::integer,(item->>'goalDifference')::integer,(item->>'points')::integer,item->>'form',now());
    saved:=saved+1;
  end loop;
  return saved;
end;$$;
revoke all on function public.sync_provider_standings(text,integer,jsonb)from public,anon,authenticated;
grant execute on function public.sync_provider_standings(text,integer,jsonb)to service_role;

-- Repair the country value previously hardcoded during fixture ingestion.
update competitions set country=case provider_id when'2'then'Europe'when'39'then'England'when'140'then'Spain'when'135'then'Italy'when'78'then'Germany'when'61'then'France'else country end
where provider='api-football';

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
),ranked_standings as(
  select c.provider_id competition_provider_id,s.team_provider_id team_id,s.team_name,s.logo_url,s.played,s.won,s.drawn,s.lost,s.goals_for,s.goals_against,s.goal_difference,s.points,s.rank,s.group_name
  from analytics_provider_standings s join competitions c on c.id=s.competition_id
  where c.provider='api-football'and c.provider_id=any(competition_provider_ids)and(season_years is null or c.season=any(season_years))
),recent as(select*from target_matches where status='FINISHED'order by kickoff_at desc limit greatest(1,least(recent_limit,20))),
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
  'standings',coalesce((select jsonb_agg(to_jsonb(s)-'group_name'order by competition_provider_id,group_name,rank)from ranked_standings s),'[]'::jsonb),
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
