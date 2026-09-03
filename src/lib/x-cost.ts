/** Pay-per-use X API read prices (Developer Console, 2026). Charged per resource returned. */
export const X_POST_READ_USD = 0.005;
export const X_USER_READ_USD = 0.01;

/** Recent search cannot look back more than 7 days. */
export const X_RECENT_SEARCH_MAX_LOOKBACK_MS = 7 * 24 * 60 * 60_000;
export const X_SEARCH_LOOKBACK_MIN_MS = 15 * 60_000;

export function estimateReadUsd(posts: number, users: number): number {
  const p = Math.max(0, posts);
  const u = Math.max(0, users);
  return p * X_POST_READ_USD + u * X_USER_READ_USD;
}

export function formatUsd(amount: number): string {
  if (!Number.isFinite(amount) || amount <= 0) return "$0.00";
  if (amount < 0.01) return `$${amount.toFixed(3)}`;
  return `$${amount.toFixed(2)}`;
}

/** Two cadence windows, never under 15 minutes or over the 7-day recent-search cap. */
export function searchLookbackMs(cadenceMinutes: number): number {
  const cadenceMs = Math.max(1, cadenceMinutes) * 60_000;
  return Math.min(X_RECENT_SEARCH_MAX_LOOKBACK_MS, Math.max(X_SEARCH_LOOKBACK_MIN_MS, cadenceMs * 2));
}
