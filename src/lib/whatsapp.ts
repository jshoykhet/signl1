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
  lastSentTo: string | null;
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

/** WhatsApp shows pairing codes as XXXX-XXXX. */
export function formatPairingCode(code: string | null | undefined): string | null {
  if (!code) return null;
  const compact = code.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  if (!compact) return null;
  if (compact.length === 8) return `${compact.slice(0, 4)}-${compact.slice(4)}`;
  return compact;
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

/** Strip the companion device suffix so we can send to the linked account itself. */
export function toOwnChatJid(userId: string): string {
  const trimmed = userId.trim();
  if (!trimmed.includes("@")) return toWhatsAppJid(trimmed);
  const [user, server] = trimmed.split("@");
  const pn = (user ?? "").split(":")[0];
  if (!pn || !server) {
    throw new Error("WhatsApp session identity is invalid");
  }
  return `${pn}@${server}`;
}

/** Compare two WhatsApp identities, ignoring device suffixes and JID servers. */
export function whatsappUserPart(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return "";
  if (trimmed.includes("@")) return trimmed.split("@")[0]?.split(":")[0] ?? "";
  return normalizeWhatsAppNumber(trimmed);
}

export function isSameWhatsAppUser(a: string, b: string): boolean {
  const left = whatsappUserPart(a);
  const right = whatsappUserPart(b);
  return Boolean(left && right && left === right);
}

/** Open sockets expose `user` even when Baileys leaves `creds.registered` false. */
export function isWhatsAppSocketReady(sock: { user?: { id?: string } | null } | null | undefined): boolean {
  return Boolean(sock?.user?.id);
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
