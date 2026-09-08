import { describe, expect, it } from "vitest";
import { storyHeadline, storySummary, tweetVelocity, velocityLabel, rankHeatStories, buildLaunchBoard } from "./launch-stories";
import type { LaunchStory } from "./launch-stories";
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

function story(partial: Partial<LaunchStory> & Pick<LaunchStory, "id" | "themeId" | "headline">): LaunchStory {
  return {
    themeLabel: partial.themeLabel ?? partial.themeId,
    summary: partial.summary ?? "Summary.",
    reason: partial.reason ?? "On the desk.",
    velocity: partial.velocity ?? 1,
    velocityLabel: partial.velocityLabel ?? "In line with the tape",
    sourceCount: partial.sourceCount ?? 1,
    sources: partial.sources ?? [],
    tracked: partial.tracked ?? false,
    muted: partial.muted ?? false,
    ...partial,
  };
}

describe("story copy", () => {
  it("turns a print into a headline and a one-sentence summary", () => {
    const headline = storyHeadline("BREAKING: Nvidia beats EPS. Guidance assumes supply remains the constraint.");
    expect(headline.toLowerCase()).toContain("nvidia beats");
    const summary = storySummary(
      [
        match({
          tweetId: "1",
          text: "BREAKING: Nvidia beats EPS. The implication is HBM remains sold out through next year.",
        }),
      ],
      headline,
    );
    expect(summary.toLowerCase()).toMatch(/implication|hbm|sold out/);
  });
});

describe("abnormal velocity", () => {
  it("scores a small account running hot above a mega-account drip", () => {
    const now = Date.now();
    const hot = tweetVelocity(
      match({
        tweetId: "hot",
        text: "$NVDA",
        followersCount: 8_000,
        likeCount: 120,
        tweetCreatedAt: new Date(now - 30 * 60 * 1000).toISOString(),
      }),
      now,
    );
    const mega = tweetVelocity(
      match({
        tweetId: "mega",
        text: "$NVDA",
        followersCount: 25_000_000,
        likeCount: 400,
        tweetCreatedAt: new Date(now - 30 * 60 * 1000).toISOString(),
      }),
      now,
    );
    expect(hot).toBeGreaterThan(mega);
    expect(velocityLabel(3.2)).toBe("3.2× the tape");
  });
});

describe("heat diversity", () => {
  it("does not stack the same theme even if it is hotter", () => {
    const heat = rankHeatStories([
      story({ id: "a", themeId: "$NVDA", headline: "A", velocity: 9 }),
      story({ id: "b", themeId: "$NVDA", headline: "B", velocity: 8 }),
      story({ id: "c", themeId: "fomc", headline: "C", velocity: 3 }),
    ]);
    expect(heat.map((item) => item.themeId)).toEqual(["$NVDA", "fomc"]);
  });
});

describe("buildLaunchBoard stories", () => {
  it("hides muted stories and explains why a cluster surfaced", () => {
    const now = Date.now();
    const board = buildLaunchBoard(
      [
        match({
          tweetId: "1",
          text: "$NVDA data-center revenue beat; HBM sold out through next year.",
          likeCount: 40,
        }),
        match({
          tweetId: "2",
          authorHandle: "ft",
          text: "$NVDA guidance raised as Blackwell remains sold out.",
          likeCount: 22,
        }),
      ],
      now,
    );
    const nvda = [...board.developing, ...board.top].find((item) => item.themeId === "$NVDA");
    expect(nvda?.sourceCount).toBe(2);
    expect(nvda?.reason.toLowerCase()).toMatch(/source/);
    expect(nvda?.headline.length).toBeGreaterThan(8);

    const muted = buildLaunchBoard(
      [
        match({ tweetId: "1", text: "$NVDA beat", likeCount: 40 }),
        match({ tweetId: "2", text: "$NVDA guidance", likeCount: 22, authorHandle: "ft" }),
      ],
      now,
      { muted: ["theme:$NVDA"] },
    );
    expect(muted.top.some((item) => item.themeId === "$NVDA")).toBe(false);
  });
});
