import { NextResponse } from "next/server";
import { getMeta, setMeta } from "@/lib/db";
import { parseDigestMinutes, parseWhatsAppAlertMode } from "@/lib/desk-settings";
import { normalizeWhatsAppNumber, toWhatsAppJid } from "@/lib/whatsapp";
import { getWhatsAppPublicStatus } from "@/lib/whatsapp-status";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(await getWhatsAppPublicStatus());
}

export async function PUT(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    to?: string;
    enabled?: boolean;
    alertMode?: string;
    digestMinutes?: number | string;
  };
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
  if (typeof body.alertMode === "string") {
    const mode = parseWhatsAppAlertMode(body.alertMode);
    setMeta("whatsapp_alert_mode", mode);
    if (mode === "digest" && !getMeta("whatsapp_digest_last_at")) {
      setMeta("whatsapp_digest_last_at", new Date().toISOString());
    }
  }
  if (body.digestMinutes != null) {
    setMeta("whatsapp_digest_minutes", String(parseDigestMinutes(String(body.digestMinutes))));
  }
  return NextResponse.json(await getWhatsAppPublicStatus());
}
