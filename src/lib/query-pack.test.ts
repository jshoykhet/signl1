import { describe, expect, it } from "vitest";
import { LIVE_MIN_POLL_INTERVAL_MS, X_MAX_QUERY_CHARS } from "./config";
import {
  batchCursor,
  combineRuleQueries,
  isLivePackDue,
  liveCadenceMs,
  nextIdleBackoffMs,
  packRules,
} from "./query-pack";

function rule(partial: { query: string; lastSinceId?: string | null; createdAt?: string; pollIntervalMs?: number; lastPolledAt?: string | null }) {
  return {
    query: partial.query,
    lastSinceId: partial.lastSinceId ?? null,
    createdAt: partial.createdAt ?? "2026-09-01T16:00:00.000Z",
    pollIntervalMs: partial.pollIntervalMs ?? 120_000,
    lastPolledAt: partial.lastPolledAt ?? null,
  };
}

describe("combineRuleQueries", () => {
  it("ORs parenthesized rule queries into one recent-search string", () => {
    expect(
      combineRuleQueries([
        rule({ query: "FOMC lang:en -is:retweet" }),
        rule({ query: "$NVDA lang:en -is:retweet" }),
      ]),
    ).toBe("(FOMC lang:en -is:retweet) OR ($NVDA lang:en -is:retweet)");
  });

  it("leaves a single rule unwrapped", () => {
    expect(combineRuleQueries([rule({ query: "$AAPL lang:en -is:retweet" })])).toBe("$AAPL lang:en -is:retweet");
  });
});

describe("packRules", () => {
  it("keeps packed Markets queries under the X character budget", () => {
    const batches = packRules([
      rule({ query: '(FOMC OR "interest rate" OR "fed funds" OR Powell) lang:en -is:retweet' }),
      rule({ query: '(OPEC OR "crude oil" OR WTI OR Brent) lang:en -is:retweet' }),
      rule({
        query:
          '(CPI OR PCE OR NFP OR payrolls OR unemployment OR inflation OR GDP OR "treasury yield" OR Treasuries OR DXY OR "dollar index" OR tariffs OR recession OR "economic data" OR ISM OR PMI OR "jobs report") lang:en -is:retweet',
      }),
      rule({ query: "($AAPL OR $NVDA OR $SPY OR $TSLA) lang:en -is:retweet" }),
    ]);
    expect(batches.length).toBeGreaterThanOrEqual(1);
    for (const batch of batches) {
      expect(combineRuleQueries(batch).length).toBeLessThanOrEqual(X_MAX_QUERY_CHARS);
    }
  });

  it("splits when two fat queries cannot share a 512-char budget", () => {
    const fat = `(${Array.from({ length: 40 }, (_, i) => `$T${String(i).padStart(2, "0")}`).join(" OR ")}) lang:en -is:retweet`;
    expect(fat.length).toBeGreaterThan(X_MAX_QUERY_CHARS / 2);
    const batches = packRules([rule({ query: fat }), rule({ query: fat })]);
    expect(batches.length).toBe(2);
  });
});

describe("batchCursor", () => {
  it("uses the oldest since_id so a packed poll cannot skip a rule", () => {
    const cursor = batchCursor([
      rule({ query: "a", lastSinceId: "200" }),
      rule({ query: "b", lastSinceId: "50" }),
    ]);
    expect(cursor).toEqual({ sinceId: "50", startTime: null });
  });

  it("falls back to the earliest created-at when no rule has a cursor", () => {
    const cursor = batchCursor([
      rule({ query: "a", createdAt: "2026-09-01T18:00:00.000Z" }),
      rule({ query: "b", createdAt: "2026-09-01T17:00:00.000Z" }),
    ]);
    expect(cursor.sinceId).toBeNull();
    expect(cursor.startTime).toBe("2026-09-01T17:00:00.000Z");
  });
});

describe("live cadence", () => {
  it("floors live polling to one minute even if a rule is set to 15s", () => {
    expect(liveCadenceMs([rule({ query: "a", pollIntervalMs: 15_000 })])).toBe(LIVE_MIN_POLL_INTERVAL_MS);
  });

  it("is due when any packed rule has never been polled", () => {
    expect(isLivePackDue([rule({ query: "a", lastPolledAt: null })], Date.parse("2026-09-01T18:00:00.000Z"))).toBe(
      true,
    );
  });

  it("backs off after empty polls and resets after a hit", () => {
    expect(nextIdleBackoffMs(0, 0, 240_000)).toBe(30_000);
    expect(nextIdleBackoffMs(30_000, 0, 240_000)).toBe(60_000);
    expect(nextIdleBackoffMs(60_000, 3, 240_000)).toBe(0);
  });
});
