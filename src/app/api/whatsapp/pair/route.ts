import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api";
import { setMeta } from "@/lib/db";
import { requireDeskUser } from "@/lib/session";
import { normalizeWhatsAppNumber } from "@/lib/whatsapp";
import { getWhatsAppPublicStatus } from "@/lib/whatsapp-status";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const desk = await requireDeskUser();
  if (!desk.ok) return desk.response;
  if (desk.role !== "admin") return jsonError("Only the instance admin can link WhatsApp.", 403);
  const body = (await request.json().catch(() => ({}))) as { phone?: string };
  const digits = normalizeWhatsAppNumber(body.phone ?? "");
  if (digits.length < 8) {
    return NextResponse.json(
      { error: "Enter the WhatsApp account number with country code, digits only." },
      { status: 400 },
    );
  }
  setMeta("whatsapp_pair_phone", digits);
  setMeta("whatsapp_pair_refresh", "1");
  setMeta("whatsapp_error", "");
  return NextResponse.json({
    ok: true,
    phone: digits,
    ...(await getWhatsAppPublicStatus(desk.userId, { canLink: true })),
  });
}
