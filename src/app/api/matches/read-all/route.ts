import { NextResponse } from "next/server";
import { markAllMatchesRead } from "@/lib/db";
import { requireDeskUser } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const desk = await requireDeskUser();
  if (!desk.ok) return desk.response;
  const body = (await request.json().catch(() => ({}))) as { ruleId?: string };
  const updated = markAllMatchesRead(desk.userId, body.ruleId);
  return NextResponse.json({ updated });
}
