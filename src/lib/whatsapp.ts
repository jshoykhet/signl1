import path from "node:path";
import { databasePath } from "./config";
import type { NormalizedTweet, Rule } from "./types";

export type WhatsAppLinkStatus =
  | "idle"
  | "connecting"
  | "qr"
  | "pairing"
  | "connected"
  | "error";

export type WhatsAppSnapshot = {
  status: WhatsAppLinkStatus;
  qr: string | null;
  pairingCode: string | null;
  linkedAs: string | null;
  to: string | null;
  enabled: boolean;
  lastError: string | null;
  lastSentAt: string | null;
};

export function whatsappAuthDir(): string {
  const fromEnv = process.env.WHATSAPP_AUTH_DIR?.trim();
  if (fromEnv) return fromEnv;
  return path.join(path.dirname(databasePath()), "whatsapp-auth");
}

/** Digits-only E.164 (country code + number). */
export function normalizeWhatsAppNumber(input: string): string {
  let digits = input.replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  return digits;
}

/**
 * Build a Baileys JID from a phone number or an already-qualified JID
 * (user @s.whatsapp.net, group @g.us, or LID @lid).
 * @see https://baileys.wiki/concepts/jids
 */
export function toWhatsAppJid(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) {
    throw new Error("WhatsApp destination is empty");
  }
  if (trimmed.includes("@")) {
    return trimmed;
  }
  const digits = normalizeWhatsAppNumber(trimmed);
  if (digits.length < 8) {
    throw new Error("WhatsApp number needs a country code and at least 8 digits");
  }
  return `${digits}@s.whatsapp.net`;
}

export function buildWhatsAppText(
  rule: Pick<Rule, "name">,
  tweet: Pick<NormalizedTweet, "authorHandle" | "authorName" | "text" | "permalink">,
): string {
  const preview = tweet.text.length > 3500 ? `${tweet.text.slice(0, 3497)}...` : tweet.text;
  const name = tweet.authorName ? ` (${tweet.authorName})` : "";
  return [
    `*Signal1 · ${rule.name}*`,
    `@${tweet.authorHandle}${name}`,
    "",
    preview,
    "",
    tweet.permalink,
  ].join("\n");
}
