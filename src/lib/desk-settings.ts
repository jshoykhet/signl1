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
    hint: "More posts. Still needs news or a real point of view.",
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
    hint: "News, numbers, and sourced takes. Not ticker chatter.",
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
    hint: "Fewer posts. Sourced news and real analysis.",
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
  { minutes: 10, label: "Every 10 minutes" },
  { minutes: 15, label: "Every 15 minutes" },
  { minutes: 30, label: "Every 30 minutes" },
  { minutes: 45, label: "Every 45 minutes" },
  { minutes: 60, label: "Every 1 hour" },
  { minutes: 120, label: "Every 2 hours" },
  { minutes: 180, label: "Every 3 hours" },
  { minutes: 240, label: "Every 4 hours" },
  { minutes: 300, label: "Every 5 hours" },
  { minutes: 600, label: "Every 10 hours" },
];

export const DEFAULT_CADENCE_MINUTES = 15;

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

export function parseWhatsAppAlertMode(_raw?: string | null): WhatsAppAlertMode {
  return "digest";
}

export function parseDigestMinutes(raw: string | number | null | undefined): number {
  const n = typeof raw === "number" ? raw : Number(raw);
  const allowed = DIGEST_INTERVALS.map((item) => item.minutes);
  if (Number.isFinite(n) && allowed.includes(n)) return n;
  if (!Number.isFinite(n) || raw == null || raw === "") return DEFAULT_CADENCE_MINUTES;
  return allowed.reduce((best, cur) => (Math.abs(cur - n) < Math.abs(best - n) ? cur : best));
}

export function cadenceLabel(minutes: number): string {
  const parsed = parseDigestMinutes(minutes);
  return DIGEST_INTERVALS.find((item) => item.minutes === parsed)?.label ?? `Every ${parsed} minutes`;
}

export function cadenceMs(minutes: number): number {
  return parseDigestMinutes(minutes) * 60_000;
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
