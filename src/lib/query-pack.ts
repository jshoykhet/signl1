import { LIVE_MIN_POLL_INTERVAL_MS, X_MAX_QUERY_CHARS } from "./config";
import { X_RECENT_SEARCH_MAX_LOOKBACK_MS, X_SEARCH_LOOKBACK_MIN_MS } from "./x-cost";
import type { Rule } from "./types";

export function combineRuleQueries(rules: Array<Pick<Rule, "query">>): string {
  const queries = uniqueQueries(rules.map((rule) => rule.query));
  if (queries.length === 0) return "";
  if (queries.length === 1) return queries[0];
  return queries.map((query) => `(${query})`).join(" OR ");
}

export function uniqueQueries(queries: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of queries) {
    const query = raw.trim();
    if (!query || seen.has(query)) continue;
    seen.add(query);
    out.push(query);
  }
  return out;
}

export function indexRulesByQuery<T extends Pick<Rule, "query">>(rules: T[]): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const rule of rules) {
    const query = rule.query.trim();
    if (!query) continue;
    const list = groups.get(query);
    if (list) list.push(rule);
    else groups.set(query, [rule]);
  }
  return groups;
}

export function packQueryGroups<T extends Pick<Rule, "query">>(
  groups: Map<string, T[]>,
  maxChars = X_MAX_QUERY_CHARS,
): Array<{ query: string; rules: T[] }> {
  const entries = [...groups.entries()];
  const batches: Array<{ queries: string[]; rules: T[] }> = [];
  let currentQueries: string[] = [];
  let currentRules: T[] = [];
  for (const [query, rules] of entries) {
    const candidateQueries = [...currentQueries, query];
    const combined = combineRuleQueries(candidateQueries.map((item) => ({ query: item })));
    if (combined.length > maxChars && currentQueries.length > 0) {
      batches.push({ queries: currentQueries, rules: currentRules });
      currentQueries = [query];
      currentRules = [...rules];
    } else {
      currentQueries = candidateQueries;
      currentRules = [...currentRules, ...rules];
    }
  }
  if (currentQueries.length) batches.push({ queries: currentQueries, rules: currentRules });
  return batches.map((batch) => ({
    query: combineRuleQueries(batch.queries.map((item) => ({ query: item }))),
    rules: batch.rules,
  }));
}

export function packRules<T extends Pick<Rule, "query">>(rules: T[], maxChars = X_MAX_QUERY_CHARS): T[][] {
  const batches: T[][] = [];
  let current: T[] = [];
  for (const rule of rules) {
    if (!rule.query.trim()) continue;
    const candidate = [...current, rule];
    if (combineRuleQueries(candidate).length > maxChars && current.length > 0) {
      batches.push(current);
      current = [rule];
    } else {
      current = candidate;
    }
  }
  if (current.length) batches.push(current);
  return batches;
}

export function batchCursor(rules: Array<Pick<Rule, "lastSinceId" | "createdAt">>): {
  sinceId: string | null;
  startTime: string | null;
} {
  const ids = rules.map((rule) => rule.lastSinceId).filter((id): id is string => Boolean(id));
  if (ids.length > 0) {
    const sinceId = ids.reduce((min, id) => (BigInt(id) < BigInt(min) ? id : min));
    return { sinceId, startTime: null };
  }
  const startTime = rules
    .map((rule) => rule.createdAt)
    .filter(Boolean)
    .reduce((min, ts) => (ts < min ? ts : min), rules[0]?.createdAt ?? new Date().toISOString());
  return { sinceId: null, startTime };
}

export function batchIsAccountWatch(rules: Array<{ accounts?: readonly string[] | null }>): boolean {
  return rules.some((rule) => (rule.accounts?.length ?? 0) > 0);
}

/** Prefer since_id. With no cursor, look back two cadence windows instead of the rule's created-at (which can be days of billed reads). */
export function searchWindow(
  rules: Array<Pick<Rule, "lastSinceId" | "createdAt">>,
  lookbackMs: number,
  now = Date.now(),
): { sinceId: string | null; startTime: string | null } {
  const ids = rules.map((rule) => rule.lastSinceId).filter((id): id is string => Boolean(id));
  if (ids.length > 0) {
    const sinceId = ids.reduce((min, id) => (BigInt(id) < BigInt(min) ? id : min));
    return { sinceId, startTime: null };
  }
  const ms = Math.min(X_RECENT_SEARCH_MAX_LOOKBACK_MS, Math.max(X_SEARCH_LOOKBACK_MIN_MS, lookbackMs));
  return { sinceId: null, startTime: new Date(now - ms).toISOString() };
}

export function liveRuleIntervalMs(pollIntervalMs: number): number {
  return Math.max(pollIntervalMs, LIVE_MIN_POLL_INTERVAL_MS);
}

export function liveCadenceMs(rules: Array<Pick<Rule, "pollIntervalMs">>, idleBackoffMs = 0): number {
  if (rules.length === 0) return LIVE_MIN_POLL_INTERVAL_MS;
  const fastest = Math.min(...rules.map((rule) => liveRuleIntervalMs(rule.pollIntervalMs)));
  return fastest + Math.max(0, idleBackoffMs);
}

export function isLivePackDue(
  rules: Array<Pick<Rule, "pollIntervalMs" | "lastPolledAt">>,
  now = Date.now(),
  idleBackoffMs = 0,
): boolean {
  if (rules.length === 0) return false;
  const cadence = liveCadenceMs(rules, idleBackoffMs);
  return rules.some((rule) => {
    if (!rule.lastPolledAt) return true;
    return now - new Date(rule.lastPolledAt).getTime() >= cadence;
  });
}

export function nextIdleBackoffMs(previousMs: number, tweetCount: number, capMs: number): number {
  if (tweetCount > 0) return 0;
  if (previousMs <= 0) return 30_000;
  return Math.min(capMs, previousMs * 2);
}
