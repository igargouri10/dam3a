-- Dynamic Fantasy deadline and weekly transfer allowance.
create or replace function public.get_fantasy_status()
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare
  first_kickoff timestamptz;
  opening_deadline timestamptz;
  next_deadline timestamptz;
  season_end constant timestamptz := '2027-05-30 23:59:59+00';
  earned_transfers integer;
begin
  select min(m.kickoff_at) into first_kickoff
  from matches m join competitions c on c.id=m.competition_id
  where lower(c.name) in ('premier league','la liga','serie a','bundesliga','ligue 1')
    and m.kickoff_at between '2026-07-01 00:00:00+00' and season_end;

  first_kickoff:=coalesce(first_kickoff,'2026-08-21 19:00:00+00'::timestamptz);
  opening_deadline:=first_kickoff-interval '1 hour';

  if now()>season_end then
    return jsonb_build_object('nextDeadline',null,'seasonEnded',true,'unlimitedTransfers',false,'remainingTransfers',0,'openingKickoff',first_kickoff);
  end if;

  if now()<opening_deadline then
    return jsonb_build_object('nextDeadline',opening_deadline,'seasonEnded',false,'unlimitedTransfers',true,'remainingTransfers',10,'openingKickoff',first_kickoff);
  end if;

  next_deadline:=date_trunc('week',now())+interval '4 days 17 hours';
  if next_deadline<=now() then next_deadline:=next_deadline+interval '7 days';end if;
  earned_transfers:=least(10,greatest(1,floor(extract(epoch from(now()-opening_deadline))/604800)::integer+1));
  return jsonb_build_object('nextDeadline',next_deadline,'seasonEnded',false,'unlimitedTransfers',false,'remainingTransfers',earned_transfers,'openingKickoff',first_kickoff);
end;$$;

revoke all on function public.get_fantasy_status() from public;
grant execute on function public.get_fantasy_status() to anon,authenticated;
notify pgrst, 'reload schema';
