import { describe, expect, it } from "vitest";
import { demoMatchesForLaunch, extractThemeKeys, rankHighEngagement, rankWorthLookingAt } from "./launch-board";
import { buildLaunchBoard } from "./launch-stories";
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
        text: "FOMC holds the funds rate; the takeaway is the Committee left the door open.",
        likeCount: 80,
        signalScore: 90,
        kol: true,
        tweetCreatedAt: new Date(now - 20 * 60 * 1000).toISOString(),
      }),
    ], now);
    expect(ranked[0]?.tweetId).toBe("fed");
  });

  it("ranks a unique mid-size take over a mega-account headline dump", () => {
    const now = Date.now();
    const ranked = rankWorthLookingAt(
      [
        match({
          tweetId: "wire",
          authorHandle: "reuters",
          text: "BREAKING: Nvidia beats EPS and raises guidance.",
          followersCount: 25_000_000,
          likeCount: 2_400,
          signalScore: 92,
          kol: true,
          tweetCreatedAt: new Date(now - 50 * 60 * 1000).toISOString(),
        }),
        match({
          tweetId: "take",
          authorHandle: "desk_notes",
          text: "The implication is the $NVDA beat does not matter: guidance implies HBM remains the constraint, and the tape is pricing a 40% increment supply cannot fill.",
          followersCount: 8_400,
          likeCount: 46,
          signalScore: 28,
          kol: false,
          tweetCreatedAt: new Date(now - 40 * 60 * 1000).toISOString(),
        }),
      ],
      now,
    );
    expect(ranked[0]?.tweetId).toBe("take");
  });

  it("keeps one copy of near-duplicate wire headlines", () => {
    const now = Date.now();
    const ranked = rankWorthLookingAt(
      [
        match({
          tweetId: "r1",
          authorHandle: "reuters",
          text: "BREAKING: Chair Powell says the FOMC is not on a preset course and will adjust interest rate policy.",
          followersCount: 25_000_000,
          likeCount: 500,
          kol: true,
        }),
        match({
          tweetId: "b1",
          authorHandle: "bloomberg",
          text: "BREAKING: Chair Powell says the FOMC is not on a preset course and will adjust interest rate policy if data warrant.",
          followersCount: 9_000_000,
          likeCount: 410,
          kol: true,
        }),
        match({
          tweetId: "view",
          authorHandle: "rates_desk",
          text: "Net-net Powell left the door open; 2s10s is pricing a cut the dots do not show. Watch liquidity into the print.",
          followersCount: 12_000,
          likeCount: 38,
        }),
      ],
      now,
    );
    const ids = ranked.map((item) => item.tweetId);
    expect(ids).toContain("view");
    expect(ids.filter((id) => id === "r1" || id === "b1")).toHaveLength(1);
  });

  it("boosts a post on a clustering theme over unrelated chatter", () => {
    const now = Date.now();
    const ranked = rankWorthLookingAt(
      [
        match({
          tweetId: "nvda-1",
          text: "$NVDA data-center revenue beat; HBM sold out through next year.",
          likeCount: 22,
          followersCount: 40_000,
        }),
        match({
          tweetId: "nvda-2",
          authorHandle: "ft",
          text: "$NVDA guidance raised as Blackwell remains sold out.",
          likeCount: 18,
          followersCount: 80_000,
        }),
        match({
          tweetId: "chat",
          authorHandle: "random_notes",
          text: "Markets are mixed this morning and traders are waiting around.",
          likeCount: 30,
          followersCount: 50_000,
        }),
      ],
      now,
    );
    expect(ranked[0]?.tweetId).not.toBe("chat");
    expect(ranked.map((item) => item.tweetId)).toEqual(expect.arrayContaining(["nvda-1", "nvda-2"]));
  });

  it("sorts heat by likes", () => {
    const heat = rankHighEngagement([
      match({ tweetId: "a", text: "a", likeCount: 12 }),
      match({ tweetId: "b", text: "b", likeCount: 400 }),
    ]);
    expect(heat.map((item) => item.tweetId)).toEqual(["b", "a"]);
  });

  it("builds developing stories from clustered tape", () => {
    const board = buildLaunchBoard([
      match({ tweetId: "1", text: "$NVDA data center beat", likeCount: 50 }),
      match({ tweetId: "2", text: "$NVDA guidance", likeCount: 20, authorHandle: "wsj" }),
      match({ tweetId: "3", text: "FOMC holds the rate", likeCount: 10, ruleName: "Fed" }),
    ]);
    expect(board.top.length).toBeGreaterThan(0);
    expect(board.developing.some((story) => story.themeId === "$NVDA")).toBe(true);
    expect(board.developing.find((story) => story.themeId === "$NVDA")?.sourceCount).toBe(2);
  });

  it("builds a day's tape from demo fixtures", () => {
    const now = Date.parse("2026-09-08T12:00:00.000Z");
    const board = buildLaunchBoard(demoMatchesForLaunch(now), now);
    expect(board.top.length).toBeGreaterThan(0);
    expect(board.heat.length).toBeGreaterThan(0);
    expect(board.developing.length).toBeGreaterThan(0);
    expect(board.usedFallbackWindow).toBe(false);
  });
});
