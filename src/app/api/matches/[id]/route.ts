import { NextResponse } from "next/server";
import { setMatchRead } from "@/lib/db";
import { jsonError } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: Ctx) {
  const { id } = await context.params;
  const body = (await request.json().catch(() => ({}))) as { read?: boolean };
  const match = setMatchRead(id, body.read !== false);
  if (!match) return jsonError("Match not found", 404);
  return NextResponse.json({ match });
}
