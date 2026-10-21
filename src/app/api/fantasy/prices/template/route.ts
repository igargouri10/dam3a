import { competitions } from "@/lib/competitions";
import {
  fantasyPriceRowsToCsv,
  normalizeFantasyPosition,
  type FantasyPriceRow,
} from "@/lib/fantasy/price-catalog";

export const runtime = "nodejs";
export const maxDuration = 300;

const fantasyLeagueTeamCounts = new Map<string, number>([
  ["premier-league", 20],
  ["la-liga", 20],
  ["serie-a", 20],
  ["bundesliga", 18],
  ["ligue-1", 18],
]);

type ApiEnvelope<T> = { errors?: unknown; response?: T[] };
type TeamResponse = { team?: { id?: number; name?: string } };
type SquadResponse = {
  team?: { id?: number; name?: string };
  players?: { id?: number; name?: string; position?: string }[];
};

const wait = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));

function hasProviderErrors(errors: unknown) {
  if (Array.isArray(errors)) return errors.length > 0;
  return Boolean(errors && typeof errors === "object" && Object.keys(errors).length > 0);
}

async function apiFootball<T>(path: string): Promise<T[]> {
  const apiKey = process.env.API_FOOTBALL_KEY;
  const baseUrl = process.env.API_FOOTBALL_BASE_URL ?? "https://v3.football.api-sports.io";
  if (!apiKey) throw new Error("API_FOOTBALL_KEY is not configured");

  let lastError = "API-Football request failed";
  for (let attempt = 0; attempt < 5; attempt += 1) {
    // Keep the catalogue job below common per-minute provider limits.
    await wait(attempt === 0 ? 350 : 1000 * 2 ** attempt);
    const response = await fetch(`${baseUrl}${path}`, {
      headers: { "x-apisports-key": apiKey },
      cache: "no-store",
    });
    if (response.ok) {
      const payload = (await response.json()) as ApiEnvelope<T>;
      if (Array.isArray(payload.response) && !hasProviderErrors(payload.errors)) return payload.response;
      lastError = `API-Football error: ${JSON.stringify(payload.errors ?? "invalid response")}`;
    } else {
      lastError = `API-Football returned ${response.status}`;
      if (response.status < 500 && response.status !== 429) break;
    }
  }
  throw new Error(lastError);
}

async function mapWithConcurrency<T, U>(items: T[], limit: number, mapper: (item: T) => Promise<U>) {
  const output = new Array<U>(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const index = cursor++;
      output[index] = await mapper(items[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return output;
}

export async function GET() {
  try {
    const leagues = competitions.filter((competition) => fantasyLeagueTeamCounts.has(competition.slug));
    const rowsByLeague = await mapWithConcurrency(leagues, 1, async (league) => {
      const teams = await apiFootball<TeamResponse>(`/teams?league=${league.providerId}&season=${league.seasonYear}`);
      const validTeams = teams.flatMap((entry) =>
        entry.team?.id && entry.team.name ? [{ id: entry.team.id, name: entry.team.name }] : [],
      );
      const expectedTeamCount = fantasyLeagueTeamCounts.get(league.slug);
      if (validTeams.length !== expectedTeamCount) {
        throw new Error(`${league.name}: expected ${expectedTeamCount} teams but API-Football returned ${validTeams.length}`);
      }

      const squads = await mapWithConcurrency(validTeams, 1, async (team) => {
        const response = await apiFootball<SquadResponse>(`/players/squads?team=${team.id}`);
        const squad = response.find((entry) => entry.team?.id === team.id);
        if (!squad?.players?.length) throw new Error(`${league.name}: no squad returned for ${team.name}`);
        return squad;
      });

      return squads.flatMap((squad): FantasyPriceRow[] => {
        const teamId = squad.team?.id;
        const teamName = squad.team?.name;
        if (!teamId || !teamName || !Array.isArray(squad.players)) return [];
        return squad.players.flatMap((player) => {
          const position = player.position ? normalizeFantasyPosition(player.position) : null;
          if (!player.id || !player.name || !position) return [];
          return [{
            player_id: String(player.id),
            player_name: player.name,
            team_id: String(teamId),
            team_name: teamName,
            league_id: league.providerId,
            league_name: league.name,
            position,
            market_value_eur: "",
            currency: "EUR",
            price_source: "transfermarkt_manual",
            source_url: "",
            valued_at: "",
          }];
        });
      });
    });

    const uniqueRows = Array.from(
      new Map(rowsByLeague.flat().map((row) => [`${row.player_id}:${row.team_id}`, row])).values(),
    ).sort((a, b) =>
      a.league_name.localeCompare(b.league_name) ||
      a.team_name.localeCompare(b.team_name) ||
      a.position.localeCompare(b.position) ||
      a.player_name.localeCompare(b.player_name),
    );

    const exportedTeams = new Set(uniqueRows.map((row) => `${row.league_id}:${row.team_id}`));
    const expectedTotalTeams = Array.from(fantasyLeagueTeamCounts.values()).reduce((sum, count) => sum + count, 0);
    if (exportedTeams.size !== expectedTotalTeams) {
      throw new Error(`Catalogue validation failed: expected ${expectedTotalTeams} teams, found ${exportedTeams.size}`);
    }

    return new Response(fantasyPriceRowsToCsv(uniqueRows), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="dam3a-fantasy-player-prices-2026-27.csv"',
        "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800",
      },
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Could not create the fantasy price template." },
      { status: 502 },
    );
  }
}
