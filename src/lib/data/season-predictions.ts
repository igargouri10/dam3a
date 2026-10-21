import "server-only";
import { callOptionalAuthRpc, getCurrentUser } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import type { CompetitionTheme } from "@/lib/competitions";

export type SeasonTeam={id:string;name:string;shortName:string|null;logoUrl:string|null};
export type SeasonPlayer={id:string;providerPlayerId:string;name:string;teamId:string;teamName:string;position:"GK"|"DEF"|"MID"|"FWD"};
export type SeasonPredictionContext={available:boolean;competition:string|null;lockAt:string|null;locked:boolean;teams:SeasonTeam[];players:SeasonPlayer[];picks:Record<string,unknown>;signedIn:boolean};

export async function getSeasonPredictionContext(competition:CompetitionTheme):Promise<SeasonPredictionContext>{
  const empty={available:false,competition:null,lockAt:null,locked:false,teams:[],players:[],picks:{},signedIn:false};
  if(!isSupabaseConfigured()||!competition.seasonPredictions)return empty;
  const userPromise=getCurrentUser(),playersPromise=callOptionalAuthRpc<SeasonPlayer[]>("get_season_prediction_players",{competition_provider_id:competition.providerId,competition_season:competition.seasonYear}).catch(()=>[]as SeasonPlayer[]);
  try{const[context,user,players]=await Promise.all([callOptionalAuthRpc<Omit<SeasonPredictionContext,"signedIn"|"players">>("get_season_prediction_context",{competition_provider_id:competition.providerId,competition_season:competition.seasonYear}),userPromise,playersPromise]);return{...context,players,signedIn:Boolean(user)}}catch{return{...empty,signedIn:Boolean(await userPromise)}}
}
