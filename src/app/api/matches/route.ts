import { NextResponse } from "next/server";
import { listMatchesPage } from "@/lib/db";
import { requireDeskUser } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const desk = await requireDeskUser();
  if (!desk.ok) return desk.response;
  const url = new URL(request.url);
  const ruleId = url.searchParams.get("ruleId") ?? undefined;
  const unread = url.searchParams.get("unread") === "1";
  const quality = url.searchParams.get("quality") !== "0";
  const q = url.searchParams.get("q") ?? undefined;
  const cursor = url.searchParams.get("cursor");
  const parsedLimit = Number(url.searchParams.get("limit") ?? "40");
  const page = listMatchesPage(desk.userId, {
    ruleId,
    unread,
    quality,
    q,
    cursor,
    limit: Number.isFinite(parsedLimit) ? parsedLimit : 40,
  });
  return NextResponse.json(page);
}
