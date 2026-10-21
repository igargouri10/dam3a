import{describe,expect,it}from"vitest";import{competitions,getCompetition}from"../src/lib/competitions";
describe("competition catalog",()=>{
 it("contains unique provider and route identifiers",()=>{expect(new Set(competitions.map(x=>x.slug)).size).toBe(competitions.length);expect(new Set(competitions.map(x=>x.providerId)).size).toBe(competitions.length)});
 it("includes all requested domestic competitions",()=>{for(const slug of["ligue-1","bundesliga","fa-cup","efl-cup","copa-del-rey","dfb-pokal","coppa-italia","coupe-de-france"])expect(getCompetition(slug)).toBeDefined()});
 it("enables the requested season predictions",()=>{expect(getCompetition("premier-league")?.seasonPredictions).toContain("FINAL_TABLE");expect(getCompetition("la-liga")?.seasonPredictions).toContain("FINAL_TABLE");expect(getCompetition("champions-league")?.seasonPredictions).toContain("WINNER")});
});
