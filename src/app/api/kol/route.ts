import { NextResponse } from "next/server";
import {
  addKolHandle,
  addKolHandles,
  getDb,
  getDeskFilterSettings,
  getEffectiveKolHandleSet,
  getKolPackSpec,
  getKolSpec,
  listAuthorFollowerCounts,
  removeKolHandle,
  resetKolHandles,
} from "@/lib/db";
import { parseDeskMode } from "@/lib/desk-mode";
import {
  kolMode,
  kolProfileUrl,
  listKolHandles,
  listKolRows,
  normalizeHandle,
  parseKolPack,
  seedKolHandles,
  type KolPackId,
  type KolSpec,
} from "@/lib/kol";
import { requireDeskUser } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function snapshotFromSpec(userId: string, spec: KolSpec, pack: KolPackId) {
  const seedMode = pack;
  const handles = listKolHandles(spec);
  const seed = new Set(seedKolHandles(seedMode).map(normalizeHandle));
  const rows = listKolRows(spec);
  const followers = listAuthorFollowerCounts(userId);
  return {
    pack,
    handles,
    count: handles.length,
    added: spec.added ?? [],
    removed: spec.removed ?? [],
    seedCount: seed.size,
    deskMode: seedMode,
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

function pageSnapshot(userId: string) {
  const deskMode = parseDeskMode(getDeskFilterSettings(userId).deskMode);
  const currentPack: KolPackId = deskMode === "venture" ? "venture" : "markets";
  const markets = snapshotFromSpec(userId, getKolPackSpec(userId, "markets"), "markets");
  const venture = snapshotFromSpec(userId, getKolPackSpec(userId, "venture"), "venture");
  const effective = [...getEffectiveKolHandleSet(userId)].sort((a, b) => a.localeCompare(b));
  const current = snapshotFromSpec(userId, getKolSpec(userId), currentPack);
  return {
    ...current,
    deskMode,
    pack: currentPack,
    markets,
    venture,
    effectiveCount: effective.length,
    effective,
    mode: kolMode(),
  };
}

export async function GET(request: Request) {
  const desk = await requireDeskUser();
  if (!desk.ok) return desk.response;
  const packParam = new URL(request.url).searchParams.get("pack");
  if (packParam) {
    const pack = parseKolPack(packParam);
    return NextResponse.json(snapshotFromSpec(desk.userId, getKolPackSpec(desk.userId, pack), pack));
  }
  return NextResponse.json(pageSnapshot(desk.userId));
}

export async function PUT(request: Request) {
  const desk = await requireDeskUser();
  if (!desk.ok) return desk.response;
  const body = (await request.json().catch(() => ({}))) as {
    add?: string;
    remove?: string;
    reset?: boolean;
    pack?: string;
  };
  const pack = body.pack ? parseKolPack(body.pack) : undefined;
  const db = getDb();
  let skipped: string[] = [];
  try {
    if (body.reset) {
      resetKolHandles(desk.userId, db, pack);
    } else if (typeof body.add === "string" && body.add.trim()) {
      if (pack) skipped = addKolHandles(desk.userId, body.add, pack, db).skipped;
      else addKolHandle(desk.userId, body.add, db);
    } else if (typeof body.remove === "string" && body.remove.trim()) {
      removeKolHandle(desk.userId, body.remove, db, pack);
    }
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not update Key Accounts" },
      { status: 400 },
    );
  }
  if (pack) {
    return NextResponse.json({
      ...snapshotFromSpec(desk.userId, getKolPackSpec(desk.userId, pack, db), pack),
      skipped,
    });
  }
  return NextResponse.json({ ...pageSnapshot(desk.userId), skipped });
}
