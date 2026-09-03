import { NextResponse } from "next/server";
import { listAuthorFollowerCounts } from "@/lib/db";
import { requireDeskUser } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const desk = await requireDeskUser();
  if (!desk.ok) return desk.response;
  return NextResponse.json({ followers: Object.fromEntries(listAuthorFollowerCounts(desk.userId)) });
}
