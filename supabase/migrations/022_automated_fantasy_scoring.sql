-- Automated lineups, individual match statistics, and weekly Fantasy scoring.
alter table public.matches add column if not exists lineup_synced_at timestamptz;
alter table public.matches add column if not exists player_stats_synced_at timestamptz;

create table if not exists public.fantasy_fixture_player_stats(
  match_id uuid not null references public.matches(id) on delete cascade,
  player_id text not null references public.fantasy_players(id) on delete cascade,
  gameweek integer not null check(gameweek>0),
  minutes integer not null default 0 check(minutes>=0),
  goals integer not null default 0 check(goals>=0),
  assists integer not null default 0 check(assists>=0),
  saves integer not null default 0 check(saves>=0),
  yellow_cards integer not null default 0 check(yellow_cards>=0),
  red_cards integer not null default 0 check(red_cards>=0),
  rating numeric,
  clean_sheet boolean not null default false,
  man_of_the_match boolean not null default false,
  points integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key(match_id,player_id)
);
create index if not exists fantasy_fixture_stats_gameweek_idx on public.fantasy_fixture_player_stats(gameweek,player_id);
alter table public.fantasy_fixture_player_stats enable row level security;

create table if not exists public.fantasy_gameweek_squads(
  user_id uuid not null references public.profiles(id) on delete cascade,
  gameweek integer not null check(gameweek>0),
  captain_player_id text not null references public.fantasy_players(id),
  vice_captain_player_id text not null references public.fantasy_players(id),
  locked_at timestamptz not null,
  primary key(user_id,gameweek)
);
create table if not exists public.fantasy_gameweek_squad_players(
  user_id uuid not null,
  gameweek integer not null,
  player_id text not null references public.fantasy_players(id),
  is_starter boolean not null,
  bench_order integer,
  primary key(user_id,gameweek,player_id),
  foreign key(user_id,gameweek)references public.fantasy_gameweek_squads(user_id,gameweek)on delete cascade
);
alter table public.fantasy_gameweek_squads enable row level security;
alter table public.fantasy_gameweek_squad_players enable row level security;

create or replace function public.fantasy_first_deadline()
returns timestamptz language sql stable security definer set search_path=public as $$
  with first_match as(
    select min(m.kickoff_at) kickoff
    from matches m join competitions c on c.id=m.competition_id
    where c.provider_id in('39','140','135','78','61') and c.season=2026
      and m.kickoff_at between '2026-07-01 00:00:00+00' and '2027-05-30 23:59:59+00'
  ),resolved as(select coalesce(kickoff,'2026-08-21 19:00:00+00'::timestamptz) kickoff from first_match)
  select least(kickoff-interval '1 hour',date_trunc('week',kickoff)+interval '4 days 16 hours 59 minutes') from resolved;
$$;

create or replace function public.fantasy_gameweek_for_kickoff(target_kickoff timestamptz)
returns integer language sql stable security definer set search_path=public as $$
  select greatest(1,floor(extract(epoch from(target_kickoff-public.fantasy_first_deadline()))/604800)::integer+1);
$$;

create or replace function public.get_fantasy_status()
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare first_kickoff timestamptz;first_deadline timestamptz;next_deadline timestamptz;season_end constant timestamptz:='2027-05-30 23:59:59+00';earned_transfers integer;
begin
  select min(m.kickoff_at)into first_kickoff from matches m join competitions c on c.id=m.competition_id where c.provider_id in('39','140','135','78','61')and c.season=2026 and m.kickoff_at between '2026-07-01 00:00:00+00'and season_end;
  first_kickoff:=coalesce(first_kickoff,'2026-08-21 19:00:00+00'::timestamptz);
  first_deadline:=public.fantasy_first_deadline();
  if now()>season_end then return jsonb_build_object('nextDeadline',null,'seasonEnded',true,'unlimitedTransfers',false,'remainingTransfers',0,'openingKickoff',first_kickoff);end if;
  if now()<first_deadline then return jsonb_build_object('nextDeadline',first_deadline,'seasonEnded',false,'unlimitedTransfers',true,'remainingTransfers',10,'openingKickoff',first_kickoff);end if;
  next_deadline:=first_deadline+(floor(extract(epoch from(now()-first_deadline))/604800)::integer+1)*interval '7 days';
  earned_transfers:=least(10,greatest(1,floor(extract(epoch from(now()-first_deadline))/604800)::integer+1));
  return jsonb_build_object('nextDeadline',next_deadline,'seasonEnded',false,'unlimitedTransfers',false,'remainingTransfers',earned_transfers,'openingKickoff',first_kickoff);
end;$$;

create or replace function public.get_fantasy_cron_context()
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare first_deadline timestamptz;week_number integer;deadline timestamptz;
begin
  first_deadline:=public.fantasy_first_deadline();
  if now()<first_deadline or now()>'2027-05-30 23:59:59+00'::timestamptz then return jsonb_build_object('gameweek',null,'deadline',first_deadline);end if;
  week_number:=floor(extract(epoch from(now()-first_deadline))/604800)::integer+1;
  deadline:=first_deadline+(week_number-1)*interval '7 days';
  return jsonb_build_object('gameweek',week_number,'deadline',deadline);
end;$$;

create or replace function public.snapshot_fantasy_gameweek(target_gameweek integer,target_deadline timestamptz)
returns integer language plpgsql security definer set search_path=public as $$
declare snapshotted integer;
begin
  if current_setting('request.jwt.claim.role',true)<>'service_role' then raise exception 'Service role required';end if;
  insert into fantasy_gameweek_squads(user_id,gameweek,captain_player_id,vice_captain_player_id,locked_at)
  select s.user_id,target_gameweek,s.captain_player_id,s.vice_captain_player_id,target_deadline from fantasy_squads s where s.confirmed_at<=target_deadline
  on conflict(user_id,gameweek)do nothing;
  get diagnostics snapshotted=row_count;
  insert into fantasy_gameweek_squad_players(user_id,gameweek,player_id,is_starter,bench_order)
  select p.user_id,target_gameweek,p.player_id,p.is_starter,p.bench_order from fantasy_squad_players p
  join fantasy_gameweek_squads s on s.user_id=p.user_id and s.gameweek=target_gameweek
  where not exists(select 1 from fantasy_gameweek_squad_players existing where existing.user_id=p.user_id and existing.gameweek=target_gameweek)
  on conflict(user_id,gameweek,player_id)do nothing;
  return snapshotted;
end;$$;

create or replace function public.get_lineup_sync_targets()
returns table(provider_id text) language sql stable security definer set search_path=public as $$
  select m.provider_id from matches m
  where m.status='SCHEDULED' and m.kickoff_at between now()-interval '15 minutes' and now()+interval '90 minutes'
    and(m.lineup_synced_at is null or m.lineup_synced_at<now()-interval '15 minutes')
  order by m.kickoff_at limit 20;
$$;

create or replace function public.mark_lineup_synced(fixture_provider_id text)
returns void language sql security definer set search_path=public as $$
  update matches set lineup_synced_at=now() where provider_id=fixture_provider_id;
$$;

create or replace function public.get_stale_live_targets()
returns table(provider_id text) language sql stable security definer set search_path=public as $$
  select m.provider_id from matches m where m.status='LIVE' order by m.kickoff_at limit 20;
$$;

create or replace function public.sync_fantasy_player_stats(fixture_provider_id text,normalized_stats jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare target_match matches%rowtype;s jsonb;fantasy_player_id text;saved integer:=0;week_number integer;
begin
  if current_setting('request.jwt.claim.role',true)<>'service_role' then raise exception 'Service role required';end if;
  select*into target_match from matches where provider_id=fixture_provider_id;
  if not found then raise exception 'Match not found';end if;
  week_number:=public.fantasy_gameweek_for_kickoff(target_match.kickoff_at);
  for s in select*from jsonb_array_elements(normalized_stats) loop
    select fp.id into fantasy_player_id from fantasy_players fp
    where fp.provider_player_id=s->>'providerPlayerId' and fp.team_id=s->>'teamProviderId' and fp.enabled=true limit 1;
    if fantasy_player_id is not null then
      insert into fantasy_fixture_player_stats(match_id,player_id,gameweek,minutes,goals,assists,saves,yellow_cards,red_cards,rating,clean_sheet,man_of_the_match,points,updated_at)
      values(target_match.id,fantasy_player_id,week_number,(s->>'minutes')::integer,(s->>'goals')::integer,(s->>'assists')::integer,(s->>'saves')::integer,(s->>'yellowCards')::integer,(s->>'redCards')::integer,nullif(s->>'rating','')::numeric,(s->>'cleanSheet')::boolean,(s->>'manOfTheMatch')::boolean,(s->>'points')::integer,now())
      on conflict(match_id,player_id)do update set gameweek=excluded.gameweek,minutes=excluded.minutes,goals=excluded.goals,assists=excluded.assists,saves=excluded.saves,yellow_cards=excluded.yellow_cards,red_cards=excluded.red_cards,rating=excluded.rating,clean_sheet=excluded.clean_sheet,man_of_the_match=excluded.man_of_the_match,points=excluded.points,updated_at=now();
      saved:=saved+1;
    end if;
  end loop;
  update matches set player_stats_synced_at=now() where id=target_match.id;
  return jsonb_build_object('saved',saved,'received',jsonb_array_length(normalized_stats),'gameweek',week_number);
end;$$;

create or replace function public.recalculate_fantasy_gameweek(target_gameweek integer)
returns integer language plpgsql security definer set search_path=public as $$
declare affected integer;
begin
  if current_setting('request.jwt.claim.role',true)<>'service_role' then raise exception 'Service role required';end if;
  with player_week as(
    select player_id,sum(points)::integer points,bool_or(minutes>0) played from fantasy_fixture_player_stats where gameweek=target_gameweek group by player_id
  ),members as(
    select sp.user_id,sp.player_id,sp.is_starter,sp.bench_order,coalesce(pw.points,0) points,coalesce(pw.played,false) played,s.captain_player_id,s.vice_captain_player_id
    from fantasy_gameweek_squad_players sp join fantasy_gameweek_squads s on s.user_id=sp.user_id and s.gameweek=sp.gameweek left join player_week pw on pw.player_id=sp.player_id
    where sp.gameweek=target_gameweek
  ),missing as(
    select user_id,11-count(*)filter(where is_starter and played) slots from members group by user_id
  ),captain_state as(
    select m.user_id,bool_or(m.player_id=m.captain_player_id and m.played) captain_played from members m group by m.user_id
  ),ranked_bench as(
    select m.*,row_number()over(partition by m.user_id order by m.bench_order) bench_rank from members m where not m.is_starter and m.played
  ),effective as(
    select*from members where is_starter and played
    union all
    select rb.user_id,rb.player_id,rb.is_starter,rb.bench_order,rb.points,rb.played,rb.captain_player_id,rb.vice_captain_player_id
    from ranked_bench rb join missing x on x.user_id=rb.user_id where rb.bench_rank<=x.slots
  ),totals as(
    select s.user_id,coalesce(sum(e.points*case when e.player_id=e.captain_player_id and cs.captain_played then 2 when e.player_id=e.vice_captain_player_id and not cs.captain_played then 2 else 1 end),0)::integer points
    from fantasy_gameweek_squads s left join effective e on e.user_id=s.user_id left join captain_state cs on cs.user_id=s.user_id where s.gameweek=target_gameweek group by s.user_id
  )
  insert into fantasy_points_ledger(user_id,gameweek,points,reason)
  select user_id,target_gameweek,points,'gameweek_score' from totals
  on conflict(user_id,gameweek,reason)do update set points=excluded.points,created_at=now();
  get diagnostics affected=row_count;return affected;
end;$$;

revoke all on function public.fantasy_first_deadline() from public;
revoke all on function public.fantasy_gameweek_for_kickoff(timestamptz) from public;
revoke all on function public.get_fantasy_cron_context() from public,anon,authenticated;
revoke all on function public.snapshot_fantasy_gameweek(integer,timestamptz) from public,anon,authenticated;
revoke all on function public.get_lineup_sync_targets() from public,anon,authenticated;
revoke all on function public.mark_lineup_synced(text) from public,anon,authenticated;
revoke all on function public.get_stale_live_targets() from public,anon,authenticated;
revoke all on function public.sync_fantasy_player_stats(text,jsonb) from public,anon,authenticated;
revoke all on function public.recalculate_fantasy_gameweek(integer) from public,anon,authenticated;
grant execute on function public.fantasy_first_deadline() to service_role;
grant execute on function public.fantasy_gameweek_for_kickoff(timestamptz) to service_role;
grant execute on function public.get_fantasy_cron_context() to service_role;
grant execute on function public.snapshot_fantasy_gameweek(integer,timestamptz) to service_role;
grant execute on function public.get_fantasy_status() to anon,authenticated;
grant execute on function public.get_lineup_sync_targets() to service_role;
grant execute on function public.mark_lineup_synced(text) to service_role;
grant execute on function public.get_stale_live_targets() to service_role;
grant execute on function public.sync_fantasy_player_stats(text,jsonb) to service_role;
grant execute on function public.recalculate_fantasy_gameweek(integer) to service_role;
notify pgrst,'reload schema';
