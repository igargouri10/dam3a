import { z } from "zod";
import { callRpc, getCurrentUser } from "@/lib/supabase/server";

const playerSchema = z.object({
  id: z.string().min(1),
  starter: z.boolean(),
  benchOrder: z.number().int().min(1).max(5).nullable(),
});
const squadSchema = z.object({
  players: z.array(playerSchema).length(16),
  captain: z.string().min(1),
  viceCaptain: z.string().min(1),
}).superRefine((value, context) => {
  if (new Set(value.players.map((player) => player.id)).size !== 16) context.addIssue({ code: z.ZodIssueCode.custom, message: "Each squad player must be unique" });
  if (value.captain === value.viceCaptain) context.addIssue({ code: z.ZodIssueCode.custom, message: "Captain and vice-captain must be different" });
});

async function requireUser() {
  const user = await getCurrentUser();
  if (!user) throw new Error("Sign in to manage your fantasy squad");
  return user;
}

export async function GET() {
  try {
    await requireUser();
    return Response.json(await callRpc("get_my_fantasy_squad", {}));
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Could not load squad" }, { status: 401 });
  }
}

export async function POST(request: Request) {
  try {
    await requireUser();
    const payload = squadSchema.parse(await request.json());
    return Response.json(await callRpc("save_my_fantasy_squad", { squad_payload: payload }));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not save squad";
    return Response.json({ error: message }, { status: message.toLowerCase().includes("sign in") ? 401 : 400 });
  }
}

export async function DELETE() {
  try {
    await requireUser();
    await callRpc("clear_my_fantasy_squad", {});
    return Response.json({ cleared: true });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Could not clear squad" }, { status: 401 });
  }
}
