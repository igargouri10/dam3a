import { z } from "zod";
import { callPublicRpc } from "@/lib/supabase/server";

const userIdSchema = z.string().uuid();

export async function GET(_request: Request, { params }: { params: Promise<{ userId: string }> }) {
  try {
    const { userId } = await params;
    const targetUserId = userIdSchema.parse(userId);
    return Response.json(await callPublicRpc("get_public_fantasy_team", { target_user_id: targetUserId }));
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Could not load fantasy team" }, { status: 400 });
  }
}
