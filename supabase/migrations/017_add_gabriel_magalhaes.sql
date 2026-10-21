-- Add the missing Arsenal defender to the active DAM3A Fantasy catalog.
insert into public.fantasy_players(id,provider_player_id,team_id,name,team_name,league_name,position,price_eur,currency,price_source,enabled)
values('22224:42','22224','42','Gabriel Magalhães','Arsenal','Premier League','DEF',75000000,'EUR','manual_user_verified',true)
on conflict(id) do update set
  name=excluded.name,
  team_name=excluded.team_name,
  league_name=excluded.league_name,
  position=excluded.position,
  price_eur=excluded.price_eur,
  price_source=excluded.price_source,
  enabled=true;

notify pgrst, 'reload schema';
