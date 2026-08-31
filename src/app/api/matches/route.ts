import { NextResponse } from "next/server";
import { listMatches } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const ruleId = url.searchParams.get("ruleId") ?? undefined;
  const unread = url.searchParams.get("unread") === "1";
  const limit = Number(url.searchParams.get("limit") ?? "200");
  const matches = listMatches({ ruleId, unread, limit: Number.isFinite(limit) ? limit : 200 });
  return NextResponse.json({ matches });
}
