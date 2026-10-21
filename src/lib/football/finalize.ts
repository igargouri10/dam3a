import "server-only";
import { ApiFootballProvider } from "./api-football";
import { buildFinalMatchData } from "./match-data";
import { adminRpc } from "./sync";

export async function finalizeProviderMatch(providerId:string,provider=new ApiFootballProvider()){
  const[match,events,statistics]=await Promise.all([provider.getMatch(providerId),provider.getMatchEvents(providerId),provider.getMatchStatistics(providerId)]);
  if(match.status!=="FINISHED")throw new Error("Match is not final");
  if(match.homeScore==null||match.awayScore==null)throw new Error("Final score is missing");
  const outcome=buildFinalMatchData({home:match.homeScore,away:match.awayScore},match.home.id,match.away.id,events,statistics);
  const scored=await adminRpc<number>("finalize_match_predictions",{fixture_provider_id:providerId,outcome,evaluation_version:1});
  return{providerId,scored,outcome};
}
