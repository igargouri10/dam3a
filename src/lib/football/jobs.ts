import "server-only";
import { competitions } from "@/lib/competitions";
import type { ProviderFixture } from "@/types";
import { ApiFootballProvider } from "./api-football";
import { finalizeProviderMatch } from "./finalize";
import { adminRpc, persistCompetitionTeams, persistFixtures } from "./sync";

type ProviderTarget={provider_id:string};
type FantasySyncResult={saved:number;received:number;gameweek:number};
type FantasyCronContext={gameweek:number|null;deadline:string};
const providerCompetitionIds=[...new Set(competitions.map(item=>item.providerId))];
const analyticsCompetitionIds=new Set(["39","140","135","78","61","2"]);
const quotaReserve=150;

async function syncFixtureDetails(provider:ApiFootballProvider,match:ProviderFixture){
  const[events,statistics,playerStatistics]=await Promise.all([provider.getMatchEvents(match.providerId),provider.getMatchStatistics(match.providerId),provider.getPlayerStatistics(match)]);
  await adminRpc("sync_live_match_details",{fixture_provider_id:match.providerId,normalized_events:events,normalized_statistics:statistics});
  await adminRpc("sync_analytics_player_stats",{fixture_provider_id:match.providerId,normalized_stats:playerStatistics});
  return adminRpc<FantasySyncResult>("sync_fantasy_player_stats",{fixture_provider_id:match.providerId,normalized_stats:playerStatistics});
}
function quotaAvailable(provider:ApiFootballProvider){const remaining=provider.getQuota().dailyRemaining;return remaining===null||remaining>quotaReserve}

export async function runAnalyticsBackfill(targetLimit=30){
  const provider=new ApiFootballProvider(),limit=Math.max(1,Math.min(targetLimit,50));
  const summary={requested:limit,targets:0,backfilled:0,stoppedReason:null as string|null,quota:provider.getQuota(),errors:[]as string[]};
  const targets=await adminRpc<ProviderTarget[]>("get_analytics_backfill_targets",{target_limit:limit});summary.targets=targets.length;
  for(const target of targets){if(!quotaAvailable(provider)){summary.stoppedReason="Daily quota reserve reached";break}try{const match=await provider.getMatch(target.provider_id),playerStatistics=await provider.getPlayerStatistics(match);await adminRpc("sync_analytics_player_stats",{fixture_provider_id:match.providerId,normalized_stats:playerStatistics});summary.backfilled++}catch(error){summary.errors.push(`${target.provider_id}: ${error instanceof Error?error.message:"sync failed"}`)}}
  if(!targets.length)summary.stoppedReason="No completed matches are waiting for analytics";else if(!summary.stoppedReason&&summary.backfilled<targets.length)summary.stoppedReason="Some provider requests failed";
  summary.quota=provider.getQuota();return summary;
}

export async function runMatchSync(){
  const provider=new ApiFootballProvider();
  const summary={liveFetched:0,liveUpdated:0,detailsSynced:0,lineupsSynced:0,analyticsBackfilled:0,squadsSnapshotted:0,finalized:0,fantasyManagersScored:0,quota:provider.getQuota(),errors:[]as string[]};
  const fantasyContext=await adminRpc<FantasyCronContext>("get_fantasy_cron_context",{});
  if(fantasyContext.gameweek!==null)summary.squadsSnapshotted=await adminRpc<number>("snapshot_fantasy_gameweek",{target_gameweek:fantasyContext.gameweek,target_deadline:fantasyContext.deadline});
  const live=await provider.getLiveFixtures(providerCompetitionIds);summary.liveFetched=live.length;
  if(live.length)summary.liveUpdated=await adminRpc<number>("update_live_fixtures",{live_fixtures:live.map(match=>({providerId:match.providerId,status:match.status,homeScore:match.homeScore??null,awayScore:match.awayScore??null}))});
  const lineupTargets=await adminRpc<ProviderTarget[]>("get_lineup_sync_targets",{});
  for(const target of lineupTargets){if(!quotaAvailable(provider))break;try{const players=await provider.getLineups(target.provider_id);if(players.length)summary.lineupsSynced+=await adminRpc<number>("sync_lineup_options",{fixture_provider_id:target.provider_id,lineup_players:players});await adminRpc("mark_lineup_synced",{fixture_provider_id:target.provider_id})}catch(error){summary.errors.push(`${target.provider_id} lineup: ${error instanceof Error?error.message:"sync failed"}`)}}
  const affectedGameweeks=new Set<number>();
  for(const match of live){if(!quotaAvailable(provider))break;try{const result=await syncFixtureDetails(provider,match);affectedGameweeks.add(result.gameweek);summary.detailsSynced++}catch(error){summary.errors.push(`${match.providerId} details: ${error instanceof Error?error.message:"sync failed"}`)}}
  const liveIds=new Set(live.map(match=>match.providerId));
  const staleTargets=await adminRpc<ProviderTarget[]>("get_stale_live_targets",{});
  for(const target of staleTargets.filter(item=>!liveIds.has(item.provider_id))){if(!quotaAvailable(provider))break;try{const match=await provider.getMatch(target.provider_id);await adminRpc("update_live_fixtures",{live_fixtures:[{providerId:match.providerId,status:match.status,homeScore:match.homeScore??null,awayScore:match.awayScore??null}]});if(match.status==="FINISHED"){await finalizeProviderMatch(target.provider_id,provider);summary.finalized++;try{const playerStatistics=await provider.getPlayerStatistics(match);await adminRpc("sync_analytics_player_stats",{fixture_provider_id:match.providerId,normalized_stats:playerStatistics});const fantasy=await adminRpc<FantasySyncResult>("sync_fantasy_player_stats",{fixture_provider_id:match.providerId,normalized_stats:playerStatistics});affectedGameweeks.add(fantasy.gameweek)}catch(error){summary.errors.push(`${target.provider_id} player stats: ${error instanceof Error?error.message:"sync failed"}`)}}}catch(error){summary.errors.push(`${target.provider_id} finalization: ${error instanceof Error?error.message:"sync failed"}`)}}
  const analyticsTargets=await adminRpc<ProviderTarget[]>("get_analytics_backfill_targets",{target_limit:12});
  for(const target of analyticsTargets){if(!quotaAvailable(provider))break;try{const match=await provider.getMatch(target.provider_id),playerStatistics=await provider.getPlayerStatistics(match);await adminRpc("sync_analytics_player_stats",{fixture_provider_id:match.providerId,normalized_stats:playerStatistics});summary.analyticsBackfilled++}catch(error){summary.errors.push(`${target.provider_id} analytics: ${error instanceof Error?error.message:"sync failed"}`)}}
  for(const gameweek of affectedGameweeks)summary.fantasyManagersScored+=await adminRpc<number>("recalculate_fantasy_gameweek",{target_gameweek:gameweek});
  summary.quota=provider.getQuota();return summary;
}

function isoDate(date:Date){return date.toISOString().slice(0,10)}
export async function runCatalogSync(now=new Date()){
  const provider=new ApiFootballProvider(),from=new Date(now),to=new Date(now);from.setUTCDate(from.getUTCDate()-2);to.setUTCDate(to.getUTCDate()+60);
  const summary={from:isoDate(from),to:isoDate(to),competitions:0,fixturesSaved:0,teamsSaved:0,standingsSaved:0,quota:provider.getQuota(),errors:[]as string[]};
  const refreshTeams=now.getUTCDay()===0;
  for(const competition of competitions){if(!quotaAvailable(provider))break;try{const analyticsCompetition=analyticsCompetitionIds.has(competition.providerId),fixtures=await provider.getFixtures({competitionId:competition.providerId,season:competition.seasonYear,from:summary.from,to:summary.to});summary.fixturesSaved+=await persistFixtures(fixtures);summary.competitions++;if(refreshTeams){const teams=await provider.getTeams({competitionId:competition.providerId,season:competition.seasonYear});summary.teamsSaved+=await persistCompetitionTeams({providerId:competition.providerId,season:competition.seasonYear,name:competition.name,region:competition.region,teams})}if(analyticsCompetition){const standings=await provider.getStandings({competitionId:competition.providerId,season:competition.seasonYear});summary.standingsSaved+=await adminRpc<number>("sync_provider_standings",{competition_provider_id:competition.providerId,competition_season:competition.seasonYear,standing_rows:standings})}}catch(error){summary.errors.push(`${competition.slug}: ${error instanceof Error?error.message:"sync failed"}`)}}
  summary.quota=provider.getQuota();return summary;
}
