import { NextResponse } from "next/server";
import { setMeta } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  setMeta("whatsapp_logout", "1");
  return NextResponse.json({ ok: true });
}
