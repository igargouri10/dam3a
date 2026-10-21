import type { FinalMatchData, PredictionInput } from "@/types";
export type Evaluation={status:"WON"|"LOST"|"VOID";correct:boolean|null};
const result=(correct:boolean):Evaluation=>({status:correct?"WON":"LOST",correct});
export const evaluators={
 MATCH_WINNER:(v:PredictionInput["value"],d:FinalMatchData)=>result(v===(d.homeScore>d.awayScore?"HOME":d.homeScore<d.awayScore?"AWAY":"DRAW")),
 EXACT_SCORE:(v:PredictionInput["value"],d:FinalMatchData)=>typeof v==="object"?result(v.home===d.homeScore&&v.away===d.awayScore):result(false),
 BOTH_TEAMS_SCORE:(v:PredictionInput["value"],d:FinalMatchData)=>result(v===((d.homeScore>0&&d.awayScore>0)?"YES":"NO")),
 FIRST_SCORER:(v:PredictionInput["value"],d:FinalMatchData)=>d.firstScorerId?result(v===d.firstScorerId):{status:"VOID",correct:null} as Evaluation,
 ANYTIME_SCORER:(v:PredictionInput["value"],d:FinalMatchData)=>result(typeof v==="string"&&d.scorerIds.includes(v)),
 MOST_CORNERS:(v:PredictionInput["value"],d:FinalMatchData)=>d.corners?result(v===(d.corners.home>d.corners.away?"HOME":d.corners.home<d.corners.away?"AWAY":"DRAW")):{status:"VOID",correct:null} as Evaluation,
 MOST_SHOTS_ON_TARGET:(v:PredictionInput["value"],d:FinalMatchData)=>d.shotsOnTarget?result(v===(d.shotsOnTarget.home>d.shotsOnTarget.away?"HOME":d.shotsOnTarget.home<d.shotsOnTarget.away?"AWAY":"DRAW")):{status:"VOID",correct:null} as Evaluation,
 YELLOW_CARD:(v:PredictionInput["value"],d:FinalMatchData)=>result(typeof v==="string"&&d.yellowCardPlayerIds.includes(v))
};
export function evaluatePrediction(p:PredictionInput,d:FinalMatchData):Evaluation{return evaluators[p.type](p.value as never,d);}
