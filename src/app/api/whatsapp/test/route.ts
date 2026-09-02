import { NextResponse } from "next/server";
import { setMeta } from "@/lib/db";
import { requireDeskUser } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  const desk = await requireDeskUser();
  if (!desk.ok) return desk.response;
  setMeta("whatsapp_test", `user:${desk.userId}`);
  return NextResponse.json({ ok: true });
}
