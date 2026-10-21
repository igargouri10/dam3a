import { callPublicRpc } from "@/lib/supabase/server";

type FantasyLeader = { rank: number; user_id: string; username: string; points: number; gameweeks: number };

export async function GET() {
  try {
    const rows = await callPublicRpc<FantasyLeader[]>("get_fantasy_leaderboard", {});
    return Response.json({ rows });
  } catch (error) {
    return Response.json({ rows: [], error: error instanceof Error ? error.message : "Could not load fantasy leaderboard" });
  }
}
