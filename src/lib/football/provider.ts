import type { LineupPlayer,MatchEvent,PlayerFixtureStatistics,ProviderFixture,TeamMatchStatistics } from "@/types";
export type FixtureQuery={competitionId:string;season:number;from?:string;to?:string};
export type ProviderTeam={id:string;name:string;shortName:string;logoUrl?:string};
export type ProviderSquadPlayer={providerPlayerId:string;teamProviderId:string;name:string;position:"GK"|"DEF"|"MID"|"FWD"};
export interface FootballProvider { getTeams(query:FixtureQuery):Promise<ProviderTeam[]>;getTeamSquad(teamId:string):Promise<ProviderSquadPlayer[]>;getFixtures(query:FixtureQuery):Promise<ProviderFixture[]>; getLiveFixtures(competitionIds?:string[]):Promise<ProviderFixture[]>; getMatch(matchId:string):Promise<ProviderFixture>; getMatchEvents(matchId:string):Promise<MatchEvent[]>; getMatchStatistics(matchId:string):Promise<TeamMatchStatistics[]>; getLineups(matchId:string):Promise<LineupPlayer[]>;getPlayerStatistics(match:ProviderFixture):Promise<PlayerFixtureStatistics[]>; }
