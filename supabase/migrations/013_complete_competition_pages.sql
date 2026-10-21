create or replace function public.get_app_fixtures()
returns table(provider_id text,competition text,round text,kickoff_at timestamptz,status match_status,home_id text,home_name text,home_short_name text,home_logo_url text,away_id text,away_name text,away_short_name text,away_logo_url text,home_score int,away_score int,venue text)
language sql stable security definer set search_path=public as $$
 select m.provider_id,c.name,coalesce(r.name,'Unscheduled'),m.kickoff_at,m.status,home.provider_id,home.name,home.short_name,home.logo_url,away.provider_id,away.name,away.short_name,away.logo_url,m.home_score,m.away_score,null::text
 from matches m join competitions c on c.id=m.competition_id left join competition_rounds r on r.id=m.round_id join teams home on home.id=m.home_team_id join teams away on away.id=m.away_team_id order by m.kickoff_at limit 5000;
$$;
grant execute on function public.get_app_fixtures() to anon,authenticated;

create or replace function public.get_season_prediction_context(competition_provider_id text,competition_season integer)
returns jsonb language sql stable security definer set search_path=public as $$
 with target as(select c.id,c.name from competitions c where c.provider='api-football'and c.provider_id=competition_provider_id and c.season=competition_season limit 1),club_rows as(select distinct t.provider_id,t.name,t.short_name,t.logo_url from target c join matches m on m.competition_id=c.id join teams t on t.id in(m.home_team_id,m.away_team_id))
 select jsonb_build_object('available',exists(select 1 from target),'competition',(select name from target),'lockAt',(select min(m.kickoff_at)from matches m join target t on t.id=m.competition_id),'locked',coalesce(now()>=(select min(m.kickoff_at)from matches m join target t on t.id=m.competition_id),false),'teams',coalesce((select jsonb_agg(jsonb_build_object('id',provider_id,'name',name,'shortName',short_name,'logoUrl',logo_url)order by name)from club_rows),'[]'::jsonb),'picks',coalesce((select jsonb_object_agg(sp.prediction_code,sp.value_json)from season_predictions sp join target t on t.id=sp.competition_id where sp.user_id=auth.uid()),'{}'::jsonb));
$$;
grant execute on function public.get_season_prediction_context(text,integer) to anon,authenticated;
