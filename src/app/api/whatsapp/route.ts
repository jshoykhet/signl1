import { NextResponse } from "next/server";
import { setDeskCadenceMinutes, setUserMeta } from "@/lib/db";
import { requireDeskUser } from "@/lib/session";
import { normalizeWhatsAppNumber, toWhatsAppJid } from "@/lib/whatsapp";
import { getWhatsAppPublicStatus } from "@/lib/whatsapp-status";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const desk = await requireDeskUser();
  if (!desk.ok) return desk.response;
  return NextResponse.json(await getWhatsAppPublicStatus(desk.userId, { canLink: desk.role === "admin" }));
}

export async function PUT(request: Request) {
  const desk = await requireDeskUser();
  if (!desk.ok) return desk.response;
  const body = (await request.json().catch(() => ({}))) as {
    to?: string;
    enabled?: boolean;
    agentEnabled?: boolean;
    alertMode?: string;
    digestMinutes?: number | string;
  };
  if (typeof body.to === "string") {
    const trimmed = body.to.trim();
    if (!trimmed) {
      setUserMeta(desk.userId, "whatsapp_to", "");
    } else {
      try {
        toWhatsAppJid(trimmed);
      } catch (error) {
        return NextResponse.json(
          { error: error instanceof Error ? error.message : "Invalid WhatsApp destination" },
          { status: 400 },
        );
      }
      setUserMeta(desk.userId, "whatsapp_to", trimmed.includes("@") ? trimmed : normalizeWhatsAppNumber(trimmed));
    }
  }
  if (typeof body.enabled === "boolean") {
    setUserMeta(desk.userId, "whatsapp_enabled", body.enabled ? "1" : "0");
  }
  if (typeof body.agentEnabled === "boolean") {
    setUserMeta(desk.userId, "whatsapp_agent_enabled", body.agentEnabled ? "1" : "0");
  }
  if (body.digestMinutes != null) {
    setDeskCadenceMinutes(desk.userId, Number(body.digestMinutes));
  }
  return NextResponse.json(await getWhatsAppPublicStatus(desk.userId, { canLink: desk.role === "admin" }));
}
