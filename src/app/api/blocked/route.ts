import { NextResponse } from "next/server";
import {
  addBlockedHandle,
  getBlockedSpec,
  listAuthorFollowerCounts,
  removeBlockedHandle,
  resetBlockedHandles,
} from "@/lib/db";
import { blockedProfileUrl, listBlockedHandles, listBlockedRows } from "@/lib/blocked";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function snapshot() {
  const spec = getBlockedSpec();
  const handles = listBlockedHandles(spec);
  const rows = listBlockedRows(spec);
  const followers = listAuthorFollowerCounts();
  return {
    handles,
    count: handles.length,
    added: spec.added ?? [],
    removed: spec.removed ?? [],
    items: rows.map((row) => ({
      handle: row.handle,
      custom: row.source === "added",
      source: row.source,
      active: row.active,
      followers: followers.get(row.handle) ?? null,
      profileUrl: blockedProfileUrl(row.handle),
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
      resetBlockedHandles();
    } else if (typeof body.add === "string" && body.add.trim()) {
      addBlockedHandle(body.add);
    } else if (typeof body.remove === "string" && body.remove.trim()) {
      removeBlockedHandle(body.remove);
    }
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not update blocked list" },
      { status: 400 },
    );
  }
  return NextResponse.json(snapshot());
}
