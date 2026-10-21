-- Repair Fantasy RPCs for databases where migration 015 stopped after table creation.
create table if not exists public.fantasy_squads(
  user_id uuid primary key references public.profiles(id) on delete cascade,
  captain_player_id text not null references public.fantasy_players(id),
  vice_captain_player_id text not null references public.fantasy_players(id),
  total_cost_eur bigint not null,
  confirmed_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check(captain_player_id<>vice_captain_player_id)
);

create table if not exists public.fantasy_squad_players(
  user_id uuid not null references public.fantasy_squads(user_id) on delete cascade,
  player_id text not null references public.fantasy_players(id),
  is_starter boolean not null,
  bench_order integer check(bench_order between 1 and 5),
  purchase_price_eur bigint not null check(purchase_price_eur>0),
  primary key(user_id,player_id),
  check((is_starter and bench_order is null)or(not is_starter and bench_order is not null))
);

create table if not exists public.fantasy_points_ledger(
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  gameweek integer not null check(gameweek>0),
  points integer not null,
  reason text not null default 'gameweek_score',
  created_at timestamptz not null default now(),
  unique(user_id,gameweek,reason)
);

alter table public.fantasy_players enable row level security;
alter table public.fantasy_squads enable row level security;
alter table public.fantasy_squad_players enable row level security;
alter table public.fantasy_points_ledger enable row level security;

drop policy if exists "fantasy players readable" on public.fantasy_players;
create policy "fantasy players readable" on public.fantasy_players for select using(enabled=true);
drop policy if exists "own fantasy squad readable" on public.fantasy_squads;
create policy "own fantasy squad readable" on public.fantasy_squads for select using(auth.uid()=user_id);
drop policy if exists "own fantasy players readable" on public.fantasy_squad_players;
create policy "own fantasy players readable" on public.fantasy_squad_players for select using(auth.uid()=user_id);
drop policy if exists "own fantasy points readable" on public.fantasy_points_ledger;
create policy "own fantasy points readable" on public.fantasy_points_ledger for select using(auth.uid()=user_id);

alter table public.fantasy_squads
  drop constraint if exists fantasy_squads_total_cost_eur_check;

alter table public.fantasy_squads
  add constraint fantasy_squads_total_cost_eur_check
  check (total_cost_eur <= 1000000000);

create or replace function public.save_my_fantasy_squad(squad_payload jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
  player_count integer;starter_count integer;goalkeepers integer;defenders integer;midfielders integer;forwards integer;
  total_cost bigint;captain_id text;vice_id text;
begin
  if auth.uid() is null then raise exception 'Authentication required';end if;
  if jsonb_typeof(squad_payload->'players')<>'array' then raise exception 'Players must be an array';end if;
  if jsonb_array_length(squad_payload->'players')<>16 then raise exception 'Choose exactly 16 players';end if;
  if (select count(distinct x.id)from jsonb_to_recordset(squad_payload->'players')as x(id text))<>16 then raise exception 'Each squad player must be unique';end if;
  captain_id:=squad_payload->>'captain';vice_id:=squad_payload->>'viceCaptain';

  with requested as(
    select distinct x.id,x.starter,x."benchOrder" from jsonb_to_recordset(squad_payload->'players')as x(id text,starter boolean,"benchOrder" integer)
  ),validated as(
    select r.*,p.position,p.price_eur from requested r join fantasy_players p on p.id=r.id and p.enabled=true
  )
  select count(*),count(*)filter(where starter),count(*)filter(where position='GK'),count(*)filter(where position='DEF'),
    count(*)filter(where position='MID'),count(*)filter(where position='FWD'),coalesce(sum(price_eur),0)
  into player_count,starter_count,goalkeepers,defenders,midfielders,forwards,total_cost from validated;

  if player_count<>16 then raise exception 'Choose exactly 16 available players';end if;
  if starter_count<>11 then raise exception 'Choose exactly 11 starters';end if;
  if goalkeepers<>1 or defenders<>5 or midfielders<>6 or forwards<>4 then raise exception 'Squad must contain 1 GK, 5 DEF, 6 MID and 4 FWD';end if;
  if total_cost>1000000000 then raise exception 'Squad exceeds the 1 billion euro budget';end if;
  if captain_id is null or vice_id is null or captain_id=vice_id then raise exception 'Choose different captain and vice-captain';end if;
  if not exists(select 1 from jsonb_to_recordset(squad_payload->'players')as x(id text,starter boolean,"benchOrder" integer)where x.id=captain_id and x.starter)then raise exception 'Captain must be a starter';end if;
  if not exists(select 1 from jsonb_to_recordset(squad_payload->'players')as x(id text,starter boolean,"benchOrder" integer)where x.id=vice_id and x.starter)then raise exception 'Vice-captain must be a starter';end if;
  if (select count(distinct x."benchOrder")from jsonb_to_recordset(squad_payload->'players')as x(id text,starter boolean,"benchOrder" integer)where not x.starter)<>5 then raise exception 'Bench order must contain positions 1 through 5';end if;

  insert into fantasy_squads(user_id,captain_player_id,vice_captain_player_id,total_cost_eur,confirmed_at,updated_at)
  values(auth.uid(),captain_id,vice_id,total_cost,now(),now())
  on conflict(user_id)do update set captain_player_id=excluded.captain_player_id,vice_captain_player_id=excluded.vice_captain_player_id,total_cost_eur=excluded.total_cost_eur,confirmed_at=excluded.confirmed_at,updated_at=excluded.updated_at;
  delete from fantasy_squad_players where user_id=auth.uid();
  insert into fantasy_squad_players(user_id,player_id,is_starter,bench_order,purchase_price_eur)
  select auth.uid(),p.id,x.starter,case when x.starter then null else x."benchOrder" end,p.price_eur
  from jsonb_to_recordset(squad_payload->'players')as x(id text,starter boolean,"benchOrder" integer)
  join fantasy_players p on p.id=x.id and p.enabled=true;
  return jsonb_build_object('saved',player_count,'totalCost',total_cost,'confirmedAt',now());
end;$$;

create or replace function public.get_my_fantasy_squad()
returns jsonb language sql stable security definer set search_path=public as $$
  select coalesce((select jsonb_build_object(
    'captain',s.captain_player_id,'viceCaptain',s.vice_captain_player_id,'totalCost',s.total_cost_eur,'confirmedAt',s.confirmed_at,
    'players',(select jsonb_agg(jsonb_build_object('id',m.player_id,'starter',m.is_starter,'benchOrder',m.bench_order)order by m.is_starter desc,m.bench_order nulls first)from fantasy_squad_players m where m.user_id=s.user_id)
  )from fantasy_squads s where s.user_id=auth.uid()),'{}'::jsonb);
$$;

create or replace function public.clear_my_fantasy_squad()
returns void language sql security definer set search_path=public as $$
  delete from fantasy_squads where user_id=auth.uid();
$$;

create or replace function public.get_fantasy_leaderboard()
returns table(rank bigint,user_id uuid,username text,points bigint,gameweeks bigint)
language sql stable security definer set search_path=public as $$
  select dense_rank()over(order by coalesce(sum(l.points),0)desc),s.user_id,p.username,coalesce(sum(l.points),0)::bigint,count(distinct l.gameweek)::bigint
  from fantasy_squads s join profiles p on p.id=s.user_id left join fantasy_points_ledger l on l.user_id=s.user_id
  group by s.user_id,p.username,s.confirmed_at order by coalesce(sum(l.points),0) desc,s.confirmed_at limit 100;
$$;

revoke all on function public.save_my_fantasy_squad(jsonb) from public,anon;
grant execute on function public.save_my_fantasy_squad(jsonb) to authenticated;
revoke all on function public.get_my_fantasy_squad() from public,anon;
grant execute on function public.get_my_fantasy_squad() to authenticated;
revoke all on function public.clear_my_fantasy_squad() from public,anon;
grant execute on function public.clear_my_fantasy_squad() to authenticated;
revoke all on function public.get_fantasy_leaderboard() from public;
grant execute on function public.get_fantasy_leaderboard() to anon,authenticated;

notify pgrst, 'reload schema';
