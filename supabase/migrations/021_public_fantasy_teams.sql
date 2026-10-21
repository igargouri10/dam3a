-- Public, read-only Fantasy team view. No private profile fields are exposed.
create or replace function public.get_public_fantasy_team(target_user_id uuid)
returns jsonb language sql stable security definer set search_path=public as $$
  select jsonb_build_object(
    'userId',s.user_id,
    'username',p.username,
    'captain',s.captain_player_id,
    'viceCaptain',s.vice_captain_player_id,
    'totalCost',s.total_cost_eur,
    'confirmedAt',s.confirmed_at,
    'points',coalesce((select sum(l.points) from fantasy_points_ledger l where l.user_id=s.user_id),0),
    'players',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',fp.id,'name',fp.name,'team',fp.team_name,'position',fp.position,'price',fsp.purchase_price_eur,
        'starter',fsp.is_starter,'benchOrder',fsp.bench_order
      ) order by fsp.is_starter desc,fsp.bench_order nulls first,fp.position,fp.name)
      from fantasy_squad_players fsp join fantasy_players fp on fp.id=fsp.player_id
      where fsp.user_id=s.user_id
    ),'[]'::jsonb)
  )
  from fantasy_squads s join profiles p on p.id=s.user_id
  where s.user_id=target_user_id;
$$;

revoke all on function public.get_public_fantasy_team(uuid) from public;
grant execute on function public.get_public_fantasy_team(uuid) to anon,authenticated;
notify pgrst, 'reload schema';
