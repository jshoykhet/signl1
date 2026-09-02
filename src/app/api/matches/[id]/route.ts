import { NextResponse } from "next/server";
import { setMatchLabel, setMatchRead } from "@/lib/db";
import { jsonError } from "@/lib/api";
import { requireDeskUser } from "@/lib/session";
import type { UserLabel } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: Ctx) {
  const desk = await requireDeskUser();
  if (!desk.ok) return desk.response;
  const { id } = await context.params;
  const body = (await request.json().catch(() => ({}))) as {
    read?: boolean;
    userLabel?: UserLabel | null;
  };

  let match = null;
  if ("userLabel" in body) {
    const raw = body.userLabel;
    if (raw !== "high" && raw !== "low" && raw !== null) {
      return jsonError("userLabel must be high, low, or null", 400);
    }
    match = setMatchLabel(id, raw, desk.userId);
    if (!match) return jsonError("Match not found", 404);
  }
  if (typeof body.read === "boolean") {
    match = setMatchRead(id, body.read, desk.userId);
    if (!match) return jsonError("Match not found", 404);
  }
  if (!match) return jsonError("Nothing to update", 400);
  return NextResponse.json({ match });
}
