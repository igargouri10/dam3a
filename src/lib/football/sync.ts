import "server-only";
import type { ProviderFixture } from "@/types";import type{ProviderTeam}from"./provider";import{getCompetitionByProviderId}from"@/lib/competitions";

type DbRow={id:string};
function config(){const url=process.env.NEXT_PUBLIC_SUPABASE_URL, key=process.env.SUPABASE_SERVICE_ROLE_KEY;if(!url||!key)throw new Error("Supabase sync credentials are not configured");return{url:url.replace(/\/$/,""),key}}
async function upsert(table:string,onConflict:string,body:unknown):Promise<DbRow[]>{const{url,key}=config();const r=await fetch(`${url}/rest/v1/${table}?on_conflict=${encodeURIComponent(onConflict)}&select=id`,{method:"POST",headers:{apikey:key,Authorization:`Bearer ${key}`,"Content-Type":"application/json",Prefer:"resolution=merge-duplicates,return=representation"},body:JSON.stringify(body),cache:"no-store"});const data=await r.json();if(!r.ok)throw new Error(data.message??`Failed to sync ${table}`);return data}
async function upsertMembership(body:{competition_id:string;team_id:string}){const{url,key}=config();const r=await fetch(`${url}/rest/v1/competition_teams?on_conflict=competition_id%2Cteam_id`,{method:"POST",headers:{apikey:key,Authorization:`Bearer ${key}`,"Content-Type":"application/json",Prefer:"resolution=merge-duplicates,return=minimal"},body:JSON.stringify(body),cache:"no-store"});if(!r.ok){const data=await r.json();throw new Error(data.message??"Failed to sync competition membership")}}
export async function adminRpc<T>(name:string,body:unknown):Promise<T>{const{url,key}=config();const r=await fetch(`${url}/rest/v1/rpc/${name}`,{method:"POST",headers:{apikey:key,Authorization:`Bearer ${key}`,"Content-Type":"application/json"},body:JSON.stringify(body),cache:"no-store"});const responseText=await r.text();let data:unknown=null;if(responseText){try{data=JSON.parse(responseText)}catch{if(!r.ok)throw new Error(`Failed to run ${name}: ${responseText}`);throw new Error(`Invalid response from ${name}`)}}if(!r.ok){const message=data&&typeof data==="object"&&"message"in data&&typeof data.message==="string"?data.message:`Failed to run ${name}`;throw new Error(message)}return data as T}

export async function persistCompetitionTeams(input:{providerId:string;season:number;name:string;region:string;teams:ProviderTeam[]}){const[competition]=await upsert("competitions","provider,provider_id,season",{provider:"api-football",provider_id:input.providerId,name:input.name,country:input.region,season:input.season,competition_type:"LEAGUE"});let saved=0;for(const item of input.teams){const[team]=await upsert("teams","provider,provider_id",{provider:"api-football",provider_id:item.id,name:item.name,short_name:item.shortName,logo_url:item.logoUrl??null});await upsertMembership({competition_id:competition.id,team_id:team.id});saved++}return saved}

async function persistFixture(f:ProviderFixture){
 const configured=getCompetitionByProviderId(f.competitionProviderId);const [competition]=await upsert("competitions","provider,provider_id,season",{provider:"api-football",provider_id:f.competitionProviderId,name:f.competition,country:configured?.region??null,season:f.season,competition_type:"LEAGUE"});
 const [round]=await upsert("competition_rounds","competition_id,name",{competition_id:competition.id,name:f.round,stage_type:"LEAGUE_ROUND"});
 const [home]=await upsert("teams","provider,provider_id",{provider:"api-football",provider_id:f.home.id,name:f.home.name,short_name:f.home.shortName,logo_url:f.home.logoUrl??null});
 const [away]=await upsert("teams","provider,provider_id",{provider:"api-football",provider_id:f.away.id,name:f.away.name,short_name:f.away.shortName,logo_url:f.away.logoUrl??null});
 await upsert("matches","provider,provider_id",{provider:"api-football",provider_id:f.providerId,competition_id:competition.id,round_id:round.id,home_team_id:home.id,away_team_id:away.id,kickoff_at:f.kickoffAt,status:f.status,home_score:f.homeScore??null,away_score:f.awayScore??null,last_synced_at:new Date().toISOString()});await adminRpc("configure_match_predictions",{fixture_provider_id:f.providerId});
}

export async function persistFixtures(fixtures:ProviderFixture[]){
 const batchSize=8;
 for(let index=0;index<fixtures.length;index+=batchSize)await Promise.all(fixtures.slice(index,index+batchSize).map(persistFixture));
 return fixtures.length;
}
