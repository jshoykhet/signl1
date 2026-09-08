import { describe, expect, it } from "vitest";
import { buildLaunchBoard, demoMatchesForLaunch, extractThemeKeys, rankHighEngagement, rankWorthLookingAt } from "./launch-board";
import type { Match } from "./types";

function match(partial: Partial<Match> & { tweetId: string; text: string }): Match {
  return {
    id: partial.id ?? partial.tweetId,
    tweetId: partial.tweetId,
    ruleId: "r1",
    ruleName: partial.ruleName ?? "Fed",
    authorHandle: partial.authorHandle ?? "reuters",
    authorName: partial.authorName ?? "Reuters",
    text: partial.text,
    tweetCreatedAt: partial.tweetCreatedAt ?? new Date().toISOString(),
    permalink: partial.permalink ?? `https://x.com/reuters/status/${partial.tweetId}`,
    rawJson: "{}",
    read: false,
    matchedAt: partial.matchedAt ?? new Date().toISOString(),
    followersCount: partial.followersCount ?? 1_000_000,
    likeCount: partial.likeCount ?? 10,
    signalScore: partial.signalScore ?? 40,
    userLabel: partial.userLabel ?? null,
    authorPrior: { high: 0, low: 0 },
    kol: partial.kol ?? false,
  };
}

describe("launch board", () => {
  it("extracts cashtags and macro themes", () => {
    expect(extractThemeKeys("BREAKING: $NVDA and FOMC in the same print")).toEqual(
      expect.arrayContaining(["$NVDA", "fomc"]),
    );
  });

  it("ranks high-signal recent posts over stale dunks", () => {
    const now = Date.now();
    const ranked = rankWorthLookingAt([
      match({
        tweetId: "old",
        text: "hello",
        likeCount: 9000,
        signalScore: 5,
        tweetCreatedAt: new Date(now - 40 * 60 * 60 * 1000).toISOString(),
      }),
      match({
        tweetId: "fed",
        text: "FOMC holds",
        likeCount: 80,
        signalScore: 90,
        kol: true,
        tweetCreatedAt: new Date(now - 20 * 60 * 1000).toISOString(),
      }),
    ], now);
    expect(ranked[0]?.tweetId).toBe("fed");
  });

  it("sorts heat by likes", () => {
    const heat = rankHighEngagement([
      match({ tweetId: "a", text: "a", likeCount: 12 }),
      match({ tweetId: "b", text: "b", likeCount: 400 }),
    ]);
    expect(heat.map((item) => item.tweetId)).toEqual(["b", "a"]);
  });

  it("builds themes from the day's tape", () => {
    const board = buildLaunchBoard([
      match({ tweetId: "1", text: "$NVDA data center beat", likeCount: 50 }),
      match({ tweetId: "2", text: "$NVDA guidance", likeCount: 20, authorHandle: "wsj" }),
      match({ tweetId: "3", text: "FOMC holds the rate", likeCount: 10, ruleName: "Fed" }),
    ]);
    expect(board.top).toHaveLength(3);
    expect(board.themes.some((theme) => theme.id === "$NVDA")).toBe(true);
    expect(board.themes.find((theme) => theme.id === "$NVDA")?.count).toBe(2);
  });

  it("builds a day's tape from demo fixtures", () => {
    const now = Date.parse("2026-09-08T12:00:00.000Z");
    const board = buildLaunchBoard(demoMatchesForLaunch(now), now);
    expect(board.top.length).toBe(20);
    expect(board.heat.length).toBeGreaterThan(0);
    expect(board.themes.length).toBeGreaterThan(0);
    expect(board.usedFallbackWindow).toBe(false);
  });
});
