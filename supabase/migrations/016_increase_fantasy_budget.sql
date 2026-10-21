-- Increase DAM3A Fantasy's squad budget from €500m to €1bn.
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

revoke all on function public.save_my_fantasy_squad(jsonb)from public,anon;
grant execute on function public.save_my_fantasy_squad(jsonb)to authenticated;

notify pgrst, 'reload schema';
