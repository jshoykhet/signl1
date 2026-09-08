import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api";
import { isDemoMode, xBearerToken } from "@/lib/config";
import { applyLaunchStoryAction, listLaunchMuted, listLaunchTracked, listMatches } from "@/lib/db";
import { isGrokConfigured } from "@/lib/grok";
import { demoMatchesForLaunch } from "@/lib/launch-board";
import { buildLaunchBoard } from "@/lib/launch-stories";
import { requireDeskUser } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function boardPayload(userId: string) {
  const stored = listMatches(userId, { limit: 500 });
  const matches = !isDemoMode() || stored.length >= 8 ? stored : demoMatchesForLaunch();
  const board = buildLaunchBoard(matches, Date.now(), {
    tracked: listLaunchTracked(userId),
    muted: listLaunchMuted(userId),
  });
  return {
    ...board,
    demoMode: isDemoMode(),
    bearerToken: xBearerToken() ? "present" : "missing",
    grok: isGrokConfigured() ? "present" : "missing",
    scanned: matches.length,
  };
}

export async function GET() {
  const desk = await requireDeskUser();
  if (!desk.ok) return desk.response;
  return NextResponse.json(boardPayload(desk.userId));
}

export async function POST(request: Request) {
  const desk = await requireDeskUser();
  if (!desk.ok) return desk.response;
  const body = (await request.json().catch(() => ({}))) as { id?: string; action?: string };
  const action = body.action;
  if (action !== "track" && action !== "untrack" && action !== "mute" && action !== "unmute") {
    return jsonError("Unknown action.");
  }
  try {
    const result = applyLaunchStoryAction(desk.userId, String(body.id ?? ""), action);
    return NextResponse.json({ ...boardPayload(desk.userId), ...result });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Could not update that story.");
  }
}