import { NextResponse } from "next/server";
import { markAllMatchesRead } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { ruleId?: string };
  const updated = markAllMatchesRead(body.ruleId);
  return NextResponse.json({ updated });
}
