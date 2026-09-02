import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api";
import { setMeta } from "@/lib/db";
import { requireDeskUser } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  const desk = await requireDeskUser();
  if (!desk.ok) return desk.response;
  if (desk.role !== "admin") return jsonError("Only the instance admin can unlink WhatsApp.", 403);
  setMeta("whatsapp_logout", "1");
  return NextResponse.json({ ok: true });
}
