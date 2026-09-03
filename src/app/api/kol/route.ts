import { NextResponse } from "next/server";
import { listAuthorFollowerCounts, addKolHandle, getKolSpec, removeKolHandle, resetKolHandles } from "@/lib/db";
import { parseDeskMode } from "@/lib/desk-mode";
import { kolMode, kolProfileUrl, listKolHandles, listKolRows, normalizeHandle, seedKolHandles } from "@/lib/kol";
import { requireDeskUser } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function snapshot(userId: string) {
  const spec = getKolSpec(userId);
  const deskMode = parseDeskMode(spec.deskMode);
  const handles = listKolHandles(spec);
  const seed = new Set(seedKolHandles(deskMode).map(normalizeHandle));
  const rows = listKolRows(spec);
  const followers = listAuthorFollowerCounts(userId);
  return {
    handles,
    count: handles.length,
    added: spec.added ?? [],
    removed: spec.removed ?? [],
    seedCount: seed.size,
    deskMode,
    mode: kolMode(),
    items: rows.map((row) => ({
      handle: row.handle,
      custom: row.source === "added",
      source: row.source,
      active: row.active,
      followers: followers.get(row.handle) ?? null,
      profileUrl: kolProfileUrl(row.handle),
    })),
  };
}

export async function GET() {
  const desk = await requireDeskUser();
  if (!desk.ok) return desk.response;
  return NextResponse.json(snapshot(desk.userId));
}

export async function PUT(request: Request) {
  const desk = await requireDeskUser();
  if (!desk.ok) return desk.response;
  const body = (await request.json().catch(() => ({}))) as {
    add?: string;
    remove?: string;
    reset?: boolean;
  };
  try {
    if (body.reset) {
      resetKolHandles(desk.userId);
    } else if (typeof body.add === "string" && body.add.trim()) {
      addKolHandle(desk.userId, body.add);
    } else if (typeof body.remove === "string" && body.remove.trim()) {
      removeKolHandle(desk.userId, body.remove);
    }
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not update KOL list" },
      { status: 400 },
    );
  }
  return NextResponse.json(snapshot(desk.userId));
}
