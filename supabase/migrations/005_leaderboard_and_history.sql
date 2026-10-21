create or replace function get_leaderboard()
returns table(rank bigint,user_id uuid,username text,points bigint,correct_predictions bigint,total_predictions bigint,accuracy numeric)
language sql stable security definer set search_path=public as $$
 select rank() over(order by coalesce(sum(pr.points_awarded),0) desc,p.username),p.id,p.username,
 coalesce(sum(pr.points_awarded),0)::bigint,
 count(*) filter(where pr.status='WON')::bigint,
 count(*) filter(where pr.status in('WON','LOST'))::bigint,
 coalesce(round(100.0*count(*) filter(where pr.status='WON')/nullif(count(*) filter(where pr.status in('WON','LOST')),0),1),0)
 from profiles p left join predictions pred on pred.user_id=p.id left join prediction_results pr on pr.prediction_id=pred.id
 group by p.id,p.username;
$$;
grant execute on function get_leaderboard() to anon,authenticated;

create or replace function get_my_prediction_history()
returns table(prediction_id uuid,kickoff_at timestamptz,competition text,home_team text,away_team text,home_score int,away_score int,prediction_name text,prediction_code text,selected_value jsonb,status prediction_status,points_awarded int)
language sql stable security definer set search_path=public as $$
 select pred.id,m.kickoff_at,c.name,home.name,away.name,m.home_score,m.away_score,pt.name,pt.code,pred.value_json,
 coalesce(pr.status,pred.status),coalesce(pr.points_awarded,0)
 from predictions pred join matches m on m.id=pred.match_id join competitions c on c.id=m.competition_id
 join teams home on home.id=m.home_team_id join teams away on away.id=m.away_team_id
 join prediction_types pt on pt.id=pred.prediction_type_id left join prediction_results pr on pr.prediction_id=pred.id
 where pred.user_id=auth.uid() order by m.kickoff_at desc,pt.name;
$$;
revoke all on function get_my_prediction_history() from public,anon;
grant execute on function get_my_prediction_history() to authenticated;
