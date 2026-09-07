import QRCode from "qrcode";
import { getMeta, getUserMeta, getWhatsAppCadenceSettings, getWhatsAppTo, isWhatsAppAgentEnabled, isWhatsAppEnabled } from "./db";
import { userFacingWhatsAppError } from "./whatsapp-disconnect";
import { formatPairingCode, type WhatsAppLinkStatus, type WhatsAppSnapshot } from "./whatsapp";
import type { WhatsAppCadenceSettings } from "./desk-settings";

export type WhatsAppPublicStatus = WhatsAppSnapshot & {
  qrDataUrl: string | null;
  canLink: boolean;
} & WhatsAppCadenceSettings;

function parseStatus(raw: string | null): WhatsAppLinkStatus {
  switch (raw) {
    case "connecting":
    case "qr":
    case "pairing":
    case "connected":
    case "error":
      return raw;
    default:
      return "idle";
  }
}

export async function getWhatsAppPublicStatus(
  userId: string,
  opts: { canLink?: boolean } = {},
): Promise<WhatsAppPublicStatus> {
  const qr = getMeta("whatsapp_qr");
  let qrDataUrl: string | null = null;
  if (qr) {
    try {
      qrDataUrl = await QRCode.toDataURL(qr, { margin: 1, width: 280, color: { dark: "#111111", light: "#ffffff" } });
    } catch {
      qrDataUrl = null;
    }
  }
  return {
    status: parseStatus(getMeta("whatsapp_status")),
    qr: opts.canLink ? qr : null,
    qrDataUrl: opts.canLink ? qrDataUrl : null,
    pairingCode: opts.canLink ? formatPairingCode(getMeta("whatsapp_pairing_code")) : null,
    linkedAs: getMeta("whatsapp_linked_as"),
    to: getWhatsAppTo(userId),
    enabled: isWhatsAppEnabled(userId),
    lastError: userFacingWhatsAppError(getMeta("whatsapp_error")),
    lastSentAt: getMeta("whatsapp_last_sent_at"),
    lastSentTo: getMeta("whatsapp_last_sent_to"),
    agentEnabled: isWhatsAppAgentEnabled(userId),
    lastAgentAt: getUserMeta(userId, "whatsapp_agent_last_at"),
    lastAgentQuery: getUserMeta(userId, "whatsapp_agent_last_query"),
    canLink: Boolean(opts.canLink),
    ...getWhatsAppCadenceSettings(userId),
  };
}
