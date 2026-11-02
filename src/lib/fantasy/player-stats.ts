import { z } from "zod";
import type { FantasyPosition, PlayerFixtureStatistics, ProviderFixture } from "@/types";

const playerStatisticsSchema=z.object({
  team:z.object({id:z.number().int().positive(),name:z.string()}),
  players:z.array(z.object({
    player:z.object({id:z.number().int().nonnegative(),name:z.string().min(1)}),
    statistics:z.array(z.object({
      games:z.object({minutes:z.number().int().nullable(),position:z.string().nullable(),rating:z.union([z.string(),z.number()]).nullable()}),
      shots:z.object({total:z.number().int().nullable(),on:z.number().int().nullable()}).optional(),
      goals:z.object({total:z.number().int().nullable(),assists:z.number().int().nullable(),saves:z.number().int().nullable()}),
      passes:z.object({total:z.number().int().nullable(),key:z.number().int().nullable(),accuracy:z.union([z.number(),z.string()]).nullable()}).optional(),
      tackles:z.object({total:z.number().int().nullable(),interceptions:z.number().int().nullable()}).optional(),
      duels:z.object({total:z.number().int().nullable(),won:z.number().int().nullable()}).optional(),
      dribbles:z.object({attempts:z.number().int().nullable(),success:z.number().int().nullable()}).optional(),
      cards:z.object({yellow:z.number().int().nullable(),red:z.number().int().nullable()}),
    })).min(1),
  })),
});

const positionMap:Record<string,FantasyPosition>={G:"GK",GK:"GK",D:"DEF",DEF:"DEF",M:"MID",MID:"MID",F:"FWD",FWD:"FWD",A:"FWD"};
const goalPoints:Record<FantasyPosition,number>={GK:10,DEF:8,MID:6,FWD:4};
const assistPoints:Record<FantasyPosition,number>={GK:5,DEF:4,MID:3,FWD:3};
const cleanSheetPoints:Record<FantasyPosition,number>={GK:4,DEF:4,MID:2,FWD:1};

type FantasyScoringStat=Pick<PlayerFixtureStatistics,"minutes"|"goals"|"assists"|"saves"|"yellowCards"|"redCards"|"position"|"cleanSheet"|"manOfTheMatch">;
export function calculateFantasyPoints<T extends FantasyScoringStat>(stat:T){
  if(stat.minutes<=0)return 0;
  return stat.goals*goalPoints[stat.position]+stat.assists*assistPoints[stat.position]+(stat.cleanSheet?cleanSheetPoints[stat.position]:0)-stat.yellowCards*4-stat.redCards*10+(stat.position==="GK"?Math.floor(stat.saves/2):0)+(stat.manOfTheMatch?10:0);
}

export function normalizePlayerStatistics(input:unknown[],fixture:ProviderFixture):PlayerFixtureStatistics[]{
  const parsed=input.map(item=>playerStatisticsSchema.parse(item));
  const rows=parsed.flatMap(team=>team.players.filter(entry=>entry.player.id>0).map(entry=>{
    const stat=entry.statistics[0];
    const position=positionMap[(stat.games.position??"").toUpperCase()]??"MID";
    const rating=stat.games.rating==null?null:Number(stat.games.rating);
    const conceded=String(team.team.id)===fixture.home.id?fixture.awayScore:fixture.homeScore;
    const accuracy=stat.passes?.accuracy==null?null:Number(stat.passes.accuracy);
    return{providerPlayerId:String(entry.player.id),teamProviderId:String(team.team.id),name:entry.player.name,position,minutes:stat.games.minutes??0,goals:stat.goals.total??0,assists:stat.goals.assists??0,saves:stat.goals.saves??0,yellowCards:stat.cards.yellow??0,redCards:stat.cards.red??0,rating:Number.isFinite(rating)?rating:null,cleanSheet:(stat.games.minutes??0)>0&&conceded===0,manOfTheMatch:false,shotsTotal:stat.shots?.total??0,shotsOnTarget:stat.shots?.on??0,passesTotal:stat.passes?.total??0,keyPasses:stat.passes?.key??0,passAccuracy:Number.isFinite(accuracy)?accuracy:null,tackles:stat.tackles?.total??0,interceptions:stat.tackles?.interceptions??0,duelsTotal:stat.duels?.total??0,duelsWon:stat.duels?.won??0,dribblesAttempted:stat.dribbles?.attempts??0,dribblesSuccessful:stat.dribbles?.success??0};
  }));
  const rated=rows.filter(row=>row.minutes>0&&row.rating!==null);
  const bestRating=rated.length?Math.max(...rated.map(row=>row.rating!)):null;
  return rows.map(row=>{const withMotm={...row,manOfTheMatch:bestRating!==null&&row.rating===bestRating};return{...withMotm,points:calculateFantasyPoints(withMotm)}});
}
