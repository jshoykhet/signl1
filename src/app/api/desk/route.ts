import { NextResponse } from "next/server";
import { getDeskFilterSettings, setDeskFilterSettings } from "@/lib/db";
import { parseDeskMode, parseMinLikes, parseSignalLevel, type DeskFilterPatch, type SignalLevel } from "@/lib/desk-settings";
import type { DeskMode } from "@/lib/desk-mode";
import { requireDeskUser } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const desk = await requireDeskUser();
  if (!desk.ok) return desk.response;
  return NextResponse.json(getDeskFilterSettings(desk.userId));
}

export async function PUT(request: Request) {
  const desk = await requireDeskUser();
  if (!desk.ok) return desk.response;
  const body = (await request.json().catch(() => ({}))) as {
    deskMode?: DeskMode;
    kolOnly?: boolean;
    signalLevel?: SignalLevel;
    allowFresh?: boolean;
    requireEngagement?: boolean;
    minLikes?: number | string | null;
    hideCrypto?: boolean;
    hideMessagingApps?: boolean;
  };
  const patch: DeskFilterPatch = {};
  if (typeof body.deskMode === "string") patch.deskMode = parseDeskMode(body.deskMode);
  if (typeof body.kolOnly === "boolean") patch.kolOnly = body.kolOnly;
  if (typeof body.signalLevel === "string") patch.signalLevel = parseSignalLevel(body.signalLevel);
  if (typeof body.allowFresh === "boolean") patch.allowFresh = body.allowFresh;
  if (typeof body.requireEngagement === "boolean") patch.requireEngagement = body.requireEngagement;
  if (body.minLikes === null) {
    patch.minLikes = null;
  } else if (typeof body.minLikes === "number" || typeof body.minLikes === "string") {
    const parsed = parseMinLikes(body.minLikes);
    if (parsed != null) patch.minLikes = parsed;
  }
  if (typeof body.hideCrypto === "boolean") patch.hideCrypto = body.hideCrypto;
  if (typeof body.hideMessagingApps === "boolean") patch.hideMessagingApps = body.hideMessagingApps;
  return NextResponse.json(setDeskFilterSettings(desk.userId, patch));
}
