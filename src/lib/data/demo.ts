import type { Match, PredictionType } from "@/types";

const team = (id:string,name:string,shortName:string,color:string) => ({id,name,shortName,color});
export const teams = {
  arsenal: team("ars","Arsenal","ARS","#e30613"), liverpool: team("liv","Liverpool","LIV","#c8102e"),
  city: team("mci","Manchester City","MCI","#6cabdd"), chelsea: team("che","Chelsea","CHE","#034694"),
  united: team("mun","Manchester United","MUN","#da291c"), spurs: team("tot","Tottenham Hotspur","TOT","#132257"),
  newcastle: team("new","Newcastle United","NEW","#181818"), villa: team("avl","Aston Villa","AVL","#670e36")
};
const now=Date.now(), hour=3600000;
export const matches: Match[] = [
 {id:"ars-liv",competition:"Premier League",round:"Matchweek 2",kickoffAt:new Date(now+26*hour).toISOString(),status:"SCHEDULED",home:teams.arsenal,away:teams.liverpool,venue:"Emirates Stadium"},
 {id:"mci-che",competition:"Premier League",round:"Matchweek 2",kickoffAt:new Date(now+50*hour).toISOString(),status:"SCHEDULED",home:teams.city,away:teams.chelsea,venue:"Etihad Stadium"},
 {id:"mun-tot",competition:"Premier League",round:"Matchweek 2",kickoffAt:new Date(now+74*hour).toISOString(),status:"SCHEDULED",home:teams.united,away:teams.spurs,venue:"Old Trafford"},
 {id:"new-avl",competition:"Premier League",round:"Matchweek 1",kickoffAt:new Date(now-1*hour).toISOString(),status:"LIVE",home:teams.newcastle,away:teams.villa,homeScore:1,awayScore:1,venue:"St James' Park"}
];
export const predictionTypes: PredictionType[] = [
 {code:"MATCH_WINNER",name:"Match winner",prompt:"Who takes all three points?",points:3,answerType:"choice"},
 {code:"EXACT_SCORE",name:"Exact score",prompt:"Call the final score",points:8,answerType:"score"},
 {code:"BOTH_TEAMS_SCORE",name:"Both teams to score",prompt:"Will both sides find the net?",points:2,answerType:"choice"},
 {code:"FIRST_SCORER",name:"First goalscorer",prompt:"Who breaks the deadlock?",points:6,answerType:"player"},
 {code:"ANYTIME_SCORER",name:"Anytime scorer",prompt:"Pick a player to score",points:4,answerType:"player"},
 {code:"MOST_CORNERS",name:"Most corners",prompt:"Which side wins the corner count?",points:3,answerType:"choice"}
 ,{code:"MOST_SHOTS_ON_TARGET",name:"Most shots on target",prompt:"Which side tests the keeper most?",points:3,answerType:"choice"}
 ,{code:"YELLOW_CARD",name:"Player shown a yellow",prompt:"Pick a player to be booked",points:4,answerType:"player"}
];
export const players = ["Bukayo Saka","Viktor Gyökeres","Martin Ødegaard","Mohamed Salah","Hugo Ekitiké","Florian Wirtz"];
export const leaders=[{name:"Maya",points:42,accuracy:68,change:1},{name:"Sam",points:38,accuracy:64,change:0},{name:"You",points:34,accuracy:61,change:2},{name:"Noah",points:29,accuracy:55,change:-1},{name:"Leila",points:24,accuracy:52,change:0}];
