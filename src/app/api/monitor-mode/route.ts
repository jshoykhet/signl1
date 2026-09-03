import { NextResponse } from "next/server";
import { getMonitorMode, listRulesForMode, setMonitorMode } from "@/lib/db";
import { jsonError } from "@/lib/api";
import { parseMonitorMode } from "@/lib/monitor-mode";
import { requireDeskUser } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const desk = await requireDeskUser();
  if (!desk.ok) return desk.response;
  const mode = getMonitorMode(desk.userId);
  return NextResponse.json({ mode, rules: listRulesForMode(desk.userId, mode) });
}

export async function PUT(request: Request) {
  const desk = await requireDeskUser();
  if (!desk.ok) return desk.response;
  const body = (await request.json().catch(() => ({}))) as { mode?: string };
  if (typeof body.mode !== "string") return jsonError("mode is required");
  const mode = setMonitorMode(desk.userId, parseMonitorMode(body.mode));
  return NextResponse.json({ mode, rules: listRulesForMode(desk.userId, mode) });
}
