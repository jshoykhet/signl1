import { NextResponse } from "next/server";
import { addKolHandle, getKolSpec, removeKolHandle, resetKolHandles } from "@/lib/db";
import { DEFAULT_KOL_HANDLES, kolMode, listKolHandles, listKolRows, normalizeHandle } from "@/lib/kol";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function snapshot() {
  const spec = getKolSpec();
  const handles = listKolHandles(spec);
  const seed = new Set(DEFAULT_KOL_HANDLES.map(normalizeHandle));
  const rows = listKolRows(spec);
  return {
    handles,
    count: handles.length,
    added: spec.added ?? [],
    removed: spec.removed ?? [],
    seedCount: seed.size,
    mode: kolMode(),
    items: rows.map((row) => ({
      handle: row.handle,
      custom: row.source === "added",
      source: row.source,
      active: row.active,
    })),
  };
}

export async function GET() {
  return NextResponse.json(snapshot());
}

export async function PUT(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    add?: string;
    remove?: string;
    reset?: boolean;
  };
  try {
    if (body.reset) {
      resetKolHandles();
    } else if (typeof body.add === "string" && body.add.trim()) {
      addKolHandle(body.add);
    } else if (typeof body.remove === "string" && body.remove.trim()) {
      removeKolHandle(body.remove);
    }
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not update KOL list" },
      { status: 400 },
    );
  }
  return NextResponse.json(snapshot());
}
