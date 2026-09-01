import { NextResponse } from "next/server";
import { getDeskFilterSettings, setDeskFilterSettings } from "@/lib/db";
import { parseSignalLevel, type SignalLevel } from "@/lib/desk-settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(getDeskFilterSettings());
}

export async function PUT(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    kolOnly?: boolean;
    signalLevel?: SignalLevel;
    allowFresh?: boolean;
    requireEngagement?: boolean;
    minLikes?: number | null;
  };
  const patch: Parameters<typeof setDeskFilterSettings>[0] = {};
  if (typeof body.kolOnly === "boolean") patch.kolOnly = body.kolOnly;
  if (typeof body.signalLevel === "string") patch.signalLevel = parseSignalLevel(body.signalLevel);
  if (typeof body.allowFresh === "boolean") patch.allowFresh = body.allowFresh;
  if (typeof body.requireEngagement === "boolean") patch.requireEngagement = body.requireEngagement;
  if (body.minLikes === null || typeof body.minLikes === "number") patch.minLikes = body.minLikes;
  return NextResponse.json(setDeskFilterSettings(patch));
}
