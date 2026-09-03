import { describe, expect, it } from "vitest";
import { LIVE_MIN_POLL_INTERVAL_MS, X_MAX_QUERY_CHARS } from "./config";
import {
  batchCursor,
  combineRuleQueries,
  indexRulesByQuery,
  isLivePackDue,
  liveCadenceMs,
  nextIdleBackoffMs,
  packQueryGroups,
  packRules,
  searchWindow,
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

  it("does not OR the same query twice", () => {
    expect(
      combineRuleQueries([
        rule({ query: "FOMC lang:en -is:retweet" }),
        rule({ query: "FOMC lang:en -is:retweet" }),
      ]),
    ).toBe("FOMC lang:en -is:retweet");
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
    const fatA = `(${Array.from({ length: 40 }, (_, i) => `$A${String(i).padStart(2, "0")}`).join(" OR ")}) lang:en -is:retweet`;
    const fatB = `(${Array.from({ length: 40 }, (_, i) => `$B${String(i).padStart(2, "0")}`).join(" OR ")}) lang:en -is:retweet`;
    expect(fatA.length).toBeGreaterThan(X_MAX_QUERY_CHARS / 2);
    const batches = packRules([rule({ query: fatA }), rule({ query: fatB })]);
    expect(batches.length).toBe(2);
  });

  it("keeps two copies of the same fat query in one search", () => {
    const fat = `(${Array.from({ length: 40 }, (_, i) => `$T${String(i).padStart(2, "0")}`).join(" OR ")}) lang:en -is:retweet`;
    const batches = packRules([rule({ query: fat }), rule({ query: fat })]);
    expect(batches.length).toBe(1);
    expect(combineRuleQueries(batches[0]!)).toBe(fat);
  });
});

describe("shared search packing", () => {
  it("collapses identical queries from two desks into one search", () => {
    const fed = "FOMC lang:en -is:retweet";
    const groups = indexRulesByQuery([
      rule({ query: fed }),
      rule({ query: fed }),
      rule({ query: "OPEC lang:en -is:retweet" }),
    ]);
    expect(groups.get(fed)).toHaveLength(2);
    const batches = packQueryGroups(groups);
    expect(batches).toHaveLength(1);
    expect(batches[0]?.query).toBe("(FOMC lang:en -is:retweet) OR (OPEC lang:en -is:retweet)");
    expect(batches[0]?.rules).toHaveLength(3);
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

describe("searchWindow", () => {
  it("keeps since_id when any rule has a cursor", () => {
    expect(
      searchWindow(
        [
          rule({ query: "a", lastSinceId: "200" }),
          rule({ query: "b", lastSinceId: "50" }),
        ],
        30 * 60_000,
      ),
    ).toEqual({ sinceId: "50", startTime: null });
  });

  it("looks back two cadence windows instead of the rule created-at", () => {
    const now = Date.parse("2026-09-03T12:00:00.000Z");
    const window = searchWindow(
      [rule({ query: "a", createdAt: "2026-08-01T00:00:00.000Z" })],
      30 * 60_000,
      now,
    );
    expect(window.sinceId).toBeNull();
    expect(window.startTime).toBe(new Date(now - 30 * 60_000).toISOString());
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
