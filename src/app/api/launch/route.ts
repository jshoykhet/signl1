import { NextResponse } from "next/server";
import { isDemoMode, xBearerToken } from "@/lib/config";
import { listMatches } from "@/lib/db";
import { isGrokConfigured } from "@/lib/grok";
import { buildLaunchBoard, demoMatchesForLaunch } from "@/lib/launch-board";
import { requireDeskUser } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const desk = await requireDeskUser();
  if (!desk.ok) return desk.response;
  const stored = listMatches(desk.userId, { limit: 500 });
  const matches = !isDemoMode() || stored.length >= 8 ? stored : demoMatchesForLaunch();
  const board = buildLaunchBoard(matches);
  return NextResponse.json({
    ...board,
    demoMode: isDemoMode(),
    bearerToken: xBearerToken() ? "present" : "missing",
    grok: isGrokConfigured() ? "present" : "missing",
    scanned: matches.length,
  });
}
