import { NextResponse } from "next/server";
import { setMeta } from "@/lib/db";
import { normalizeWhatsAppNumber, toWhatsAppJid } from "@/lib/whatsapp";
import { getWhatsAppPublicStatus } from "@/lib/whatsapp-status";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(await getWhatsAppPublicStatus());
}

export async function PUT(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { to?: string; enabled?: boolean };
  if (typeof body.to === "string") {
    const trimmed = body.to.trim();
    if (!trimmed) {
      setMeta("whatsapp_to", "");
    } else {
      try {
        toWhatsAppJid(trimmed);
      } catch (error) {
        return NextResponse.json(
          { error: error instanceof Error ? error.message : "Invalid WhatsApp destination" },
          { status: 400 },
        );
      }
      setMeta("whatsapp_to", trimmed.includes("@") ? trimmed : normalizeWhatsAppNumber(trimmed));
    }
  }
  if (typeof body.enabled === "boolean") {
    setMeta("whatsapp_enabled", body.enabled ? "1" : "0");
  }
  return NextResponse.json(await getWhatsAppPublicStatus());
}
