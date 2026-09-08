import { describe, expect, it } from "vitest";
import {
  agentRankScore,
  looksLikeContentFarm,
  rankAgentTweets,
  requestedFromHandle,
} from "./agent-search";
import type { NormalizedTweet } from "./types";

const now = Date.parse("2026-09-08T16:00:00.000Z");

function tweet(partial: Partial<NormalizedTweet> & Pick<NormalizedTweet, "id" | "authorHandle" | "text">): NormalizedTweet {
  return {
    authorName: partial.authorName ?? partial.authorHandle,
    createdAt: partial.createdAt ?? "2026-09-08T15:10:00.000Z",
    lang: "en",
    isRetweet: partial.isRetweet ?? false,
    isReply: partial.isReply ?? false,
    permalink: `https://x.com/${partial.authorHandle}/status/${partial.id}`,
    raw: {},
    followersCount: partial.followersCount ?? 12_000,
    likeCount: partial.likeCount ?? 40,
    retweetCount: partial.retweetCount ?? 8,
    replyCount: partial.replyCount ?? 3,
    quoteCount: partial.quoteCount ?? 2,
    verified: partial.verified ?? false,
    ...partial,
  };
}

const PRINT = tweet({
  id: "print",
  authorHandle: "reuters",
  authorName: "Reuters",
  text: "BREAKING: Nvidia beats EPS and raises guidance 12%. $NVDA vs consensus as data-center revenue comes in at $12.3bn.",
  followersCount: 25_000_000,
  likeCount: 420,
  retweetCount: 180,
  verified: true,
});

const FARM = tweet({
  id: "farm",
  authorHandle: "stockalerts_99",
  authorName: "Stock Alerts 24/7",
  text: "THIS IS HUGE 🧵 follow for more alpha on $NVDA $TSLA $AAPL $AMD $META $AMZN. Like and retweet if you want the full list.",
  followersCount: 8_400,
  likeCount: 6_200,
  retweetCount: 900,
});

const CHATTER = tweet({
  id: "chat",
  authorHandle: "random_desk",
  text: "Beautiful morning. Coffee with the team and a long walk.",
  followersCount: 400,
  likeCount: 12,
});

describe("looksLikeContentFarm", () => {
  it("flags CTA mills, hype threads, and alert-farm handles", () => {
    expect(looksLikeContentFarm(FARM).farm).toBe(true);
    expect(looksLikeContentFarm(FARM).reasons).toEqual(
      expect.arrayContaining(["cta", "hype", "farm handle", "farm name"]),
    );
  });

  it("does not flag a wire print", () => {
    expect(looksLikeContentFarm(PRINT).farm).toBe(false);
  });

  it("flags hashtag dumps and telegram funnels", () => {
    const dump = tweet({
      id: "tags",
      authorHandle: "alphadaily_7",
      text: "Market open #stocks #trading #investing #wealth #mindset join my telegram t.me/alphadaily",
    });
    expect(looksLikeContentFarm(dump).farm).toBe(true);
  });

  it("still drops funnel copy from a requested from: handle", () => {
    const verdict = looksLikeContentFarm(FARM, { allowHandle: "stockalerts_99" });
    expect(verdict.farm).toBe(true);
    expect(verdict.reasons).not.toContain("farm handle");
    expect(verdict.reasons).toContain("cta");
  });
});

describe("rankAgentTweets", () => {
  it("keeps the high-signal print and drops farms and empty chatter", () => {
    const ranked = rankAgentTweets([FARM, CHATTER, PRINT], { now, limit: 6 });
    expect(ranked.map((item) => item.id)).toEqual(["print"]);
  });

  it("ranks a sourced print above a viral dunk", () => {
    const dunk = tweet({
      id: "dunk",
      authorHandle: "ratio_king",
      text: "l take. this you? imagine thinking $NVDA is a buy. ratio this.",
      followersCount: 90_000,
      likeCount: 8_800,
      verified: false,
    });
    const ranked = rankAgentTweets([dunk, PRINT], { now });
    expect(ranked[0]?.id).toBe("print");
    expect(agentRankScore(PRINT, now)).toBeGreaterThan(agentRankScore(dunk, now));
  });

  it("parses from: so a direct handle search is recognized", () => {
    expect(requestedFromHandle("from:reuters lang:en -is:retweet")).toBe("reuters");
  });
});
