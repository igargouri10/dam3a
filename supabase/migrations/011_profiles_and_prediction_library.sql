alter table public.profiles add column if not exists full_name text;
alter table public.profiles add column if not exists age integer check(age between 13 and 120);
alter table public.profiles add column if not exists preferred_team text;
alter table public.profiles add column if not exists language text not null default 'en' check(language in('en','fr'));
alter table public.profiles add column if not exists theme text not null default 'light' check(theme in('light','dark'));

create or replace function public.get_my_profile()
returns jsonb language sql stable security definer set search_path=public as $$
 select coalesce((select jsonb_build_object('username',username,'fullName',full_name,'age',age,'preferredTeam',preferred_team,'language',language,'theme',theme) from profiles where id=auth.uid()),'{}'::jsonb);
$$;
revoke all on function public.get_my_profile() from public,anon;grant execute on function public.get_my_profile() to authenticated;

create or replace function public.update_my_profile(profile_payload jsonb)
returns jsonb language plpgsql security invoker set search_path=public as $$
declare result jsonb;new_age integer;
begin
 if auth.uid() is null then raise exception 'Authentication required';end if;
 new_age:=nullif(profile_payload->>'age','')::integer;
 if length(trim(coalesce(profile_payload->>'username','')))<3 then raise exception 'Username must be at least 3 characters';end if;
 if new_age is not null and new_age not between 13 and 120 then raise exception 'Age must be between 13 and 120';end if;
 if coalesce(profile_payload->>'language','') not in('en','fr') then raise exception 'Invalid language';end if;
 if coalesce(profile_payload->>'theme','') not in('light','dark') then raise exception 'Invalid theme';end if;
 update profiles set username=trim(profile_payload->>'username'),full_name=nullif(trim(profile_payload->>'fullName'),''),age=new_age,preferred_team=nullif(trim(profile_payload->>'preferredTeam'),''),language=profile_payload->>'language',theme=profile_payload->>'theme' where id=auth.uid();
 select get_my_profile() into result;return result;
end;$$;
revoke all on function public.update_my_profile(jsonb) from public,anon;grant execute on function public.update_my_profile(jsonb) to authenticated;

create or replace function public.get_my_season_predictions()
returns table(prediction_id uuid,competition text,prediction_code text,selected_value jsonb,status prediction_status,points_awarded integer,updated_at timestamptz,lock_at timestamptz)
language sql stable security definer set search_path=public as $$
 select sp.id,c.name,sp.prediction_code,sp.value_json,sp.status,sp.points_awarded,sp.updated_at,(select min(m.kickoff_at)from matches m where m.competition_id=c.id)
 from season_predictions sp join competitions c on c.id=sp.competition_id where sp.user_id=auth.uid() order by sp.updated_at desc;
$$;
revoke all on function public.get_my_season_predictions() from public,anon;grant execute on function public.get_my_season_predictions() to authenticated;
