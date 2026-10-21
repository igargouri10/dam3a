import { z } from "zod";
import type { MatchStatus, ProviderFixture, Team } from "@/types";

export const ApiFootballFixtureSchema = z.object({
  fixture: z.object({
    id: z.number().int().positive(),
    date: z.string().datetime({ offset: true }),
    venue: z.object({ name: z.string().nullable() }).nullable(),
    status: z.object({ short: z.string() }),
  }),
  league: z.object({ id: z.number().int().positive(), name: z.string().min(1), season: z.number().int(), round: z.string().nullable() }),
  teams: z.object({
    home: z.object({ id: z.number().int().positive(), name: z.string().min(1), logo: z.string().url().nullable() }),
    away: z.object({ id: z.number().int().positive(), name: z.string().min(1), logo: z.string().url().nullable() }),
  }),
  goals: z.object({ home: z.number().int().nullable(), away: z.number().int().nullable() }),
});

const liveStatuses = new Set(["1H","HT","2H","ET","BT","P","SUSP","INT","LIVE"]);
const finishedStatuses = new Set(["FT","AET","PEN"]);
export function normalizeStatus(short: string): MatchStatus {
  if (liveStatuses.has(short)) return "LIVE";
  if (finishedStatuses.has(short)) return "FINISHED";
  return "SCHEDULED";
}
function shortName(name:string){return name.split(/\s+/).map(x=>x[0]).join("").slice(0,3).toUpperCase()}
function team(raw:z.infer<typeof ApiFootballFixtureSchema>["teams"]["home"]):Team{return{id:String(raw.id),name:raw.name,shortName:shortName(raw.name),color:"#16342b",...(raw.logo?{logoUrl:raw.logo}:{})}}

export function normalizeFixture(input: unknown): ProviderFixture {
  const raw=ApiFootballFixtureSchema.parse(input);
  return { id:String(raw.fixture.id), providerId:String(raw.fixture.id), competitionProviderId:String(raw.league.id), competition:raw.league.name, season:raw.league.season, round:raw.league.round??"Unscheduled", kickoffAt:new Date(raw.fixture.date).toISOString(), status:normalizeStatus(raw.fixture.status.short), home:team(raw.teams.home), away:team(raw.teams.away), ...(raw.goals.home!==null?{homeScore:raw.goals.home}:{}), ...(raw.goals.away!==null?{awayScore:raw.goals.away}:{}), venue:raw.fixture.venue?.name??"Venue TBC" };
}
