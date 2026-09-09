import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/session";
import { getUsageSnapshot } from "@/lib/usage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const desk = await requireAdmin();
  if (!desk.ok) return desk.response;
  return NextResponse.json(getUsageSnapshot());
}
