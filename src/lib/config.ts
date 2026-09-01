export const MIN_POLL_INTERVAL_MS = 15_000;
export const DEFAULT_POLL_INTERVAL_MS = 120_000;
export const DEMO_INJECT_INTERVAL_MS = 10_000;
export const POLLER_TICK_MS = 2_000;
export const POLLER_STALE_MS = 30_000;
export const X_MIN_REQUEST_GAP_MS = 400;
export const X_MAX_RESULTS = 25;
export const X_SEARCH_URL = "https://api.x.com/2/tweets/search/recent";
export const X_SEARCH_URL_FALLBACK = "https://api.twitter.com/2/tweets/search/recent";

export function databasePath(): string {
  return process.env.DATABASE_PATH?.trim() || "./data/signal.db";
}

export function xBearerToken(): string | null {
  const token = process.env.X_BEARER_TOKEN?.trim();
  return token ? token : null;
}

export function isDemoMode(): boolean {
  return xBearerToken() === null;
}

export function globalSlackWebhookUrl(): string | null {
  const url = process.env.SLACK_WEBHOOK_URL?.trim();
  return url ? url : null;
}

export function clampPollIntervalMs(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_POLL_INTERVAL_MS;
  return Math.max(MIN_POLL_INTERVAL_MS, Math.round(value));
}
