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
    hint: "More tape — looser floors",
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
    hint: "Default desk floors",
    minFollowers: 50,
    minLikes: 5,
    minScore: 18,
    minDesk: 12,
    establishedMinDesk: 8,
    kolMinDesk: 4,
    freshMs: 10 * 60_000,
  },
  high: {
    id: "high",
    label: "Higher",
    hint: "Less tape — catalysts and size",
    minFollowers: 500,
    minLikes: 25,
    minScore: 32,
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

export const ENGAGEMENT_PRESETS = [0, 1, 5, 10, 25, 50, 100] as const;
export const DIGEST_TOP_N = 20;
export const DIGEST_CANDIDATE_LIMIT = 400;

export type DeskFilterSettings = {
  kolOnly: boolean;
  signalLevel: SignalLevel;
  allowFresh: boolean;
  requireEngagement: boolean;
  /** null = inherit the signal-level like floor */
  minLikes: number | null;
};

export type WhatsAppCadenceSettings = {
  alertMode: WhatsAppAlertMode;
  digestMinutes: number;
};

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

export function effectiveMinLikes(filters: Pick<DeskFilterSettings, "signalLevel" | "minLikes">): number {
  return filters.minLikes ?? SIGNAL_LEVELS[filters.signalLevel].minLikes;
}

export function isDigestDue(lastAtIso: string | null | undefined, digestMinutes: number, now = Date.now()): boolean {
  if (!lastAtIso) return true;
  const last = Date.parse(lastAtIso);
  if (!Number.isFinite(last)) return true;
  return now - last >= digestMinutes * 60_000;
}
