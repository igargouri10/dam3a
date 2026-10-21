create table if not exists players (
 id uuid primary key default gen_random_uuid(), provider text not null, provider_id text not null,
 name text not null, position text, unique(provider,provider_id)
);

create table match_events (
 id uuid primary key default gen_random_uuid(), match_id uuid not null references matches on delete cascade,
 provider_event_id text, event_type text not null, team_id uuid references teams, player_id uuid references players,
 minute int not null, extra_minute int, metadata_json jsonb not null default '{}',
 unique(match_id,provider_event_id)
);
create table match_statistics (
 id uuid primary key default gen_random_uuid(), match_id uuid not null references matches on delete cascade,
 entity_type text not null, entity_id uuid not null, stat_type text not null, value numeric,
 updated_at timestamptz not null default now(), unique(match_id,entity_type,entity_id,stat_type)
);

create or replace function finalize_match_predictions(fixture_provider_id text,outcome jsonb,evaluation_version int default 1)
returns integer language plpgsql security definer set search_path=public as $$
declare p record; result_status prediction_status; is_correct boolean; awarded int; count_scored int:=0; selected text;
begin
 if current_setting('request.jwt.claim.role',true) <> 'service_role' then raise exception 'Service role required'; end if;
 if not (outcome ? 'homeScore' and outcome ? 'awayScore') then raise exception 'Final score is required'; end if;
 update matches set status='FINISHED',home_score=(outcome->>'homeScore')::int,away_score=(outcome->>'awayScore')::int,last_synced_at=now() where provider_id=fixture_provider_id;
 if not found then raise exception 'Match not found'; end if;
 for p in select pr.id,pr.value_json,pt.code,pt.points from predictions pr join matches m on m.id=pr.match_id join prediction_types pt on pt.id=pr.prediction_type_id where m.provider_id=fixture_provider_id loop
  selected:=p.value_json #>> '{}'; is_correct:=false; result_status:='LOST';
  case p.code
   when 'MATCH_WINNER' then is_correct=selected=(case when (outcome->>'homeScore')::int>(outcome->>'awayScore')::int then 'HOME' when (outcome->>'homeScore')::int<(outcome->>'awayScore')::int then 'AWAY' else 'DRAW' end);
   when 'EXACT_SCORE' then is_correct=(p.value_json->>'home')::int=(outcome->>'homeScore')::int and (p.value_json->>'away')::int=(outcome->>'awayScore')::int;
   when 'BOTH_TEAMS_SCORE' then is_correct=selected=(case when (outcome->>'homeScore')::int>0 and (outcome->>'awayScore')::int>0 then 'YES' else 'NO' end);
   when 'FIRST_SCORER' then if outcome->>'firstScorerId' is null then result_status:='VOID';is_correct:=null;else is_correct=selected=outcome->>'firstScorerId';end if;
   when 'ANYTIME_SCORER' then is_correct=(outcome->'scorerIds') ? selected;
   when 'YELLOW_CARD' then is_correct=(outcome->'yellowCardPlayerIds') ? selected;
   when 'MOST_CORNERS' then if outcome->'corners' is null then result_status:='VOID';is_correct:=null;else is_correct=selected=(case when (outcome->'corners'->>'home')::int>(outcome->'corners'->>'away')::int then 'HOME' when (outcome->'corners'->>'home')::int<(outcome->'corners'->>'away')::int then 'AWAY' else 'DRAW' end);end if;
   when 'MOST_SHOTS_ON_TARGET' then if outcome->'shotsOnTarget' is null then result_status:='VOID';is_correct:=null;else is_correct=selected=(case when (outcome->'shotsOnTarget'->>'home')::int>(outcome->'shotsOnTarget'->>'away')::int then 'HOME' when (outcome->'shotsOnTarget'->>'home')::int<(outcome->'shotsOnTarget'->>'away')::int then 'AWAY' else 'DRAW' end);end if;
   else result_status:='VOID';is_correct:=null;
  end case;
  if result_status<>'VOID' then result_status:=case when is_correct then 'WON' else 'LOST' end;end if;awarded:=case when is_correct then p.points else 0 end;
  insert into prediction_results(prediction_id,status,correct,points_awarded,evaluation_version) values(p.id,result_status,is_correct,awarded,evaluation_version)
  on conflict(prediction_id) do update set status=excluded.status,correct=excluded.correct,points_awarded=excluded.points_awarded,evaluated_at=now(),evaluation_version=excluded.evaluation_version;
  update predictions set status=result_status where id=p.id;count_scored:=count_scored+1;
 end loop;return count_scored;
end;$$;
revoke all on function finalize_match_predictions(text,jsonb,int) from public,anon,authenticated;
grant execute on function finalize_match_predictions(text,jsonb,int) to service_role;

insert into prediction_types(code,name,description,answer_type,points,enabled,required_statistic) values
('MOST_SHOTS_ON_TARGET','Most shots on target','Team with the most shots on target','choice',3,true,'shots_on_goal'),
('YELLOW_CARD','Player shown a yellow','Selected player receives a yellow card','player',4,true,'events')
on conflict(code) do update set name=excluded.name,points=excluded.points,enabled=excluded.enabled,required_statistic=excluded.required_statistic;
