import QRCode from "qrcode";
import { getMeta, getWhatsAppTo, isWhatsAppEnabled } from "./db";
import { formatPairingCode, type WhatsAppLinkStatus, type WhatsAppSnapshot } from "./whatsapp";

export type WhatsAppPublicStatus = WhatsAppSnapshot & {
  qrDataUrl: string | null;
};

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

export async function getWhatsAppPublicStatus(): Promise<WhatsAppPublicStatus> {
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
    qr: qr,
    qrDataUrl,
    pairingCode: formatPairingCode(getMeta("whatsapp_pairing_code")),
    linkedAs: getMeta("whatsapp_linked_as"),
    to: getWhatsAppTo(),
    enabled: isWhatsAppEnabled(),
    lastError: getMeta("whatsapp_error"),
    lastSentAt: getMeta("whatsapp_last_sent_at"),
  };
}
