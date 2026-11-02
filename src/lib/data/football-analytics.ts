import "server-only";
import { competitions } from "@/lib/competitions";
import { callPublicRpc } from "@/lib/supabase/server";
import { getFixtures } from "./fixtures";

export type AnalyticsCompetition={id:string;name:string;country:string|null;season:number};
export type AnalyticsTeam={id:string;name:string;shortName:string|null;logoUrl:string|null;competitionId:string;competitionName:string;country:string|null;season:number};
export type AnalyticsPlayer={id:string;name:string;teamId:string;position:string;competitionId:string};
export type AnalyticsCatalog={competitions:AnalyticsCompetition[];teams:AnalyticsTeam[];players:AnalyticsPlayer[]};
export type StandingRow={competition_provider_id:string;team_id:string;team_name:string;logo_url:string|null;played:number;won:number;drawn:number;lost:number;goals_for:number;goals_against:number;goal_difference:number;points:number;rank:number};
export type AnalyticsResult={id:string;competitionId:string;competition:string;kickoffAt:string;home:{id:string;name:string;logoUrl:string|null;score:number};away:{id:string;name:string;logoUrl:string|null;score:number}};
export type PlayerAnalytics={id:string;name:string;team_provider_id:string;team_name:string;team_logo_url:string|null;position:string;appearances:number;minutes:number;goals:number;assists:number;rating:number|null;shots_total:number;shots_on_target:number;passes_total:number;key_passes:number;pass_accuracy:number|null;tackles:number;interceptions:number;duels_total:number;duels_won:number;dribbles_attempted:number;dribbles_successful:number;yellow_cards:number;red_cards:number};
export type TeamAnalytics={id:string;name:string;logo_url:string|null;matches:number;won:number;drawn:number;lost:number;goals_for:number;goals_against:number;goal_difference:number;points:number};
export type AnalyticsDashboard={standings:StandingRow[];recentResults:AnalyticsResult[];topScorers:PlayerAnalytics[];topAssisters:PlayerAnalytics[];bestRated:PlayerAnalytics[];teamComparison:TeamAnalytics[];playerComparison:PlayerAnalytics[];dataThrough:string|null};
export type AnalyticsQuery={competitions:string[];teams?:string[];players?:string[];seasons?:number[];from?:string;to?:string;recentLimit?:number;matchLimit?:number};

const featured=new Set(["39","140","135","78","61","2"]);
const emptyDashboard:AnalyticsDashboard={standings:[],recentResults:[],topScorers:[],topAssisters:[],bestRated:[],teamComparison:[],playerComparison:[],dataThrough:null};

export async function getAnalyticsCatalog():Promise<AnalyticsCatalog>{
  try{return await callPublicRpc<AnalyticsCatalog>("get_analytics_catalog",{})}catch{
    const{matches}=await getFixtures(),teams=new Map<string,AnalyticsTeam>();
    for(const match of matches){const competition=competitions.find(item=>item.name===match.competition);if(!competition||!featured.has(competition.providerId))continue;for(const team of[match.home,match.away])teams.set(`${competition.providerId}:${team.id}`,{id:team.id,name:team.name,shortName:team.shortName,logoUrl:team.logoUrl??null,competitionId:competition.providerId,competitionName:competition.name,country:competition.region,season:competition.seasonYear})}
    return{competitions:competitions.filter(item=>featured.has(item.providerId)).map(item=>({id:item.providerId,name:item.name,country:item.region,season:item.seasonYear})),teams:[...teams.values()],players:[]};
  }
}

export async function getFootballAnalytics(query:AnalyticsQuery):Promise<AnalyticsDashboard>{
  try{return await callPublicRpc<AnalyticsDashboard>("get_analytics_dashboard",{competition_provider_ids:query.competitions,team_provider_ids:query.teams?.length?query.teams:null,player_provider_ids:query.players?.length?query.players:null,season_years:query.seasons?.length?query.seasons:null,from_date:query.from??null,to_date:query.to??null,recent_limit:query.recentLimit??5,match_limit:query.matchLimit??null})}catch{
    const{matches}=await getFixtures(),selected=new Set(query.competitions),seasons=new Set(query.seasons??[]),teamFilter=new Set(query.teams??[]),from=query.from?Date.parse(query.from):null,to=query.to?Date.parse(query.to):null;
    const eligible=matches.filter(match=>{const competition=competitions.find(item=>item.name===match.competition),kickoff=Date.parse(match.kickoffAt);return competition&&selected.has(competition.providerId)&&(!seasons.size||seasons.has(competition.seasonYear))&&match.status==="FINISHED"&&(from===null||kickoff>=from)&&(to===null||kickoff<=to)&&(!teamFilter.size||teamFilter.has(match.home.id)||teamFilter.has(match.away.id))}).sort((a,b)=>Date.parse(b.kickoffAt)-Date.parse(a.kickoffAt));
    const finished=query.matchLimit?eligible.slice(0,query.matchLimit):eligible;
    const table=new Map<string,StandingRow>();
    for(const match of finished){const competition=competitions.find(item=>item.name===match.competition)!;for(const[team,gf,ga]of[[match.home,match.homeScore??0,match.awayScore??0],[match.away,match.awayScore??0,match.homeScore??0]]as const){const key=`${competition.providerId}:${team.id}`,row=table.get(key)??{competition_provider_id:competition.providerId,team_id:team.id,team_name:team.name,logo_url:team.logoUrl??null,played:0,won:0,drawn:0,lost:0,goals_for:0,goals_against:0,goal_difference:0,points:0,rank:0};row.played++;row.goals_for+=gf;row.goals_against+=ga;row.goal_difference=row.goals_for-row.goals_against;if(gf>ga){row.won++;row.points+=3}else if(gf===ga){row.drawn++;row.points++}else row.lost++;table.set(key,row)}}
    const standings=[...table.values()].sort((a,b)=>a.competition_provider_id.localeCompare(b.competition_provider_id)||b.points-a.points||b.goal_difference-a.goal_difference||b.goals_for-a.goals_for);let previousCompetition="",rank=0;for(const row of standings){if(row.competition_provider_id!==previousCompetition){previousCompetition=row.competition_provider_id;rank=0}row.rank=++rank}
    const recentResults=finished.sort((a,b)=>Date.parse(b.kickoffAt)-Date.parse(a.kickoffAt)).slice(0,query.recentLimit??5).map(match=>{const competition=competitions.find(item=>item.name===match.competition)!;return{id:match.id,competitionId:competition.providerId,competition:match.competition,kickoffAt:match.kickoffAt,home:{id:match.home.id,name:match.home.name,logoUrl:match.home.logoUrl??null,score:match.homeScore??0},away:{id:match.away.id,name:match.away.name,logoUrl:match.away.logoUrl??null,score:match.awayScore??0}}});
    return{...emptyDashboard,standings,recentResults,dataThrough:recentResults[0]?.kickoffAt??null};
  }
}
