import { NextResponse } from "next/server";
import {
  addBlockedHandle,
  getBlockedSpec,
  listAuthorFollowerCounts,
  removeBlockedHandle,
  resetBlockedHandles,
} from "@/lib/db";
import { blockedProfileUrl, listBlockedHandles, listBlockedRows } from "@/lib/blocked";
import { requireDeskUser } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function snapshot(userId: string) {
  const spec = getBlockedSpec(userId);
  const handles = listBlockedHandles(spec);
  const rows = listBlockedRows(spec);
  const followers = listAuthorFollowerCounts(userId);
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
      resetBlockedHandles(desk.userId);
    } else if (typeof body.add === "string" && body.add.trim()) {
      addBlockedHandle(desk.userId, body.add);
    } else if (typeof body.remove === "string" && body.remove.trim()) {
      removeBlockedHandle(desk.userId, body.remove);
    }
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not update blocked list" },
      { status: 400 },
    );
  }
  return NextResponse.json(snapshot(desk.userId));
}
