import { callOptionalAuthRpc } from "@/lib/supabase/server";

type FantasyStatus = {
  nextDeadline: string | null;
  seasonEnded: boolean;
  unlimitedTransfers: boolean;
  remainingTransfers: number;
};

function fallbackStatus(): FantasyStatus {
  const now = new Date();
  const openingDeadline = new Date("2026-08-21T18:00:00Z");
  const seasonEnd = new Date("2027-05-30T23:59:59Z");
  if (now > seasonEnd) return { nextDeadline: null, seasonEnded: true, unlimitedTransfers: false, remainingTransfers: 0 };
  if (now < openingDeadline) return { nextDeadline: openingDeadline.toISOString(), seasonEnded: false, unlimitedTransfers: true, remainingTransfers: 10 };
  const next = new Date(now);
  const daysUntilFriday = (5 - next.getUTCDay() + 7) % 7;
  next.setUTCDate(next.getUTCDate() + daysUntilFriday);
  next.setUTCHours(17, 0, 0, 0);
  if (next <= now) next.setUTCDate(next.getUTCDate() + 7);
  const weeks = Math.floor((now.getTime() - openingDeadline.getTime()) / 604_800_000) + 1;
  return { nextDeadline: next.toISOString(), seasonEnded: false, unlimitedTransfers: false, remainingTransfers: Math.min(10, Math.max(1, weeks)) };
}

export async function GET() {
  try {
    return Response.json(await callOptionalAuthRpc<FantasyStatus>("get_fantasy_status", {}));
  } catch {
    return Response.json(fallbackStatus());
  }
}
