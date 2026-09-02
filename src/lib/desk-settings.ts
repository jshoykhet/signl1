import type { DeskMode } from "./desk-mode";

export type SignalLevel = "low" | "standard" | "high";
export type WhatsAppAlertMode = "immediate" | "digest";

export type SignalLevelConfig = {
  id: SignalLevel;
  label: string;
  hint: string;
  minFollowers: number;
  minLikes: number;
  minScore: number;
  minDesk: number;
  establishedMinDesk: number;
  kolMinDesk: number;
  freshMs: number;
};

export const SIGNAL_LEVELS: Record<SignalLevel, SignalLevelConfig> = {
  low: {
    id: "low",
    label: "Lower",
    hint: "More tape, still needs a news hook or an analytical take",
    minFollowers: 20,
    minLikes: 1,
    minScore: 10,
    minDesk: 6,
    establishedMinDesk: 4,
    kolMinDesk: 2,
    freshMs: 20 * 60_000,
  },
  standard: {
    id: "standard",
    label: "Standard",
    hint: "Wires, prints vs expected, and sourced takes — not cashtag chatter",
    minFollowers: 50,
    minLikes: 5,
    minScore: 22,
    minDesk: 12,
    establishedMinDesk: 8,
    kolMinDesk: 4,
    freshMs: 10 * 60_000,
  },
  high: {
    id: "high",
    label: "Higher",
    hint: "Less tape — sourced news, sized prints, and real analysis",
    minFollowers: 500,
    minLikes: 25,
    minScore: 42,
    minDesk: 16,
    establishedMinDesk: 12,
    kolMinDesk: 8,
    freshMs: 5 * 60_000,
  },
};

export const DIGEST_INTERVALS: { minutes: number; label: string }[] = [
  { minutes: 5, label: "Every 5 minutes" },
  { minutes: 15, label: "Every 15 minutes" },
  { minutes: 30, label: "Every 30 minutes" },
  { minutes: 45, label: "Every 45 minutes" },
  { minutes: 60, label: "Every 1 hour" },
  { minutes: 120, label: "Every 2 hours" },
  { minutes: 180, label: "Every 3 hours" },
  { minutes: 240, label: "Every 4 hours" },
];

export const DEFAULT_MIN_LIKES = 5;
export const MIN_LIKES_SLIDER_MAX = 100;
export const DIGEST_TOP_N = 20;
export const DIGEST_CANDIDATE_LIMIT = 400;

export type DeskFilterSettings = {
  deskMode: DeskMode;
  kolOnly: boolean;
  signalLevel: SignalLevel;
  allowFresh: boolean;
  requireEngagement: boolean;
  /** Operator floor. Unset meta falls back to DEFAULT_MIN_LIKES (5). */
  minLikes: number;
  hideCrypto: boolean;
  hideMessagingApps: boolean;
};

export type DeskFilterPatch = Omit<Partial<DeskFilterSettings>, "minLikes"> & {
  minLikes?: number | null;
};

export type WhatsAppCadenceSettings = {
  alertMode: WhatsAppAlertMode;
  digestMinutes: number;
};

export { parseDeskMode } from "./desk-mode";
export type { DeskMode } from "./desk-mode";

export function parseSignalLevel(raw: string | null | undefined): SignalLevel {
  if (raw === "low" || raw === "high" || raw === "standard") return raw;
  return "standard";
}

export function parseBoolMeta(raw: string | null | undefined, fallback: boolean): boolean {
  if (raw == null || raw === "") return fallback;
  return raw !== "0" && raw !== "false";
}

export function parseWhatsAppAlertMode(raw: string | null | undefined): WhatsAppAlertMode {
  return raw === "digest" ? "digest" : "immediate";
}

export function parseDigestMinutes(raw: string | null | undefined): number {
  const n = Number(raw);
  if (DIGEST_INTERVALS.some((item) => item.minutes === n)) return n;
  return 60;
}

export function parseMinLikes(raw: string | number | null | undefined): number | null {
  if (raw == null || raw === "") return null;
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n)) return null;
  return Math.min(10_000, Math.max(0, Math.round(n)));
}

export function resolvedMinLikes(raw: string | number | null | undefined): number {
  return parseMinLikes(raw) ?? DEFAULT_MIN_LIKES;
}

export function effectiveMinLikes(filters: Pick<DeskFilterSettings, "signalLevel" | "minLikes">): number {
  return filters.minLikes;
}

export function isDigestDue(lastAtIso: string | null | undefined, digestMinutes: number, now = Date.now()): boolean {
  if (!lastAtIso) return true;
  const last = Date.parse(lastAtIso);
  if (!Number.isFinite(last)) return true;
  return now - last >= digestMinutes * 60_000;
}
