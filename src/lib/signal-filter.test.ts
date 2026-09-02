import { describe, expect, it } from "vitest";
import {
  ESTABLISHED_FOLLOWERS,
  MIN_FOLLOWERS,
  MIN_LIKES,
  passesSignalFilter,
  signalScore,
} from "./signal-filter";

const now = Date.parse("2026-09-01T16:00:00.000Z");
const DESK_TEXT = "$AAPL beats EPS; FOMC-sensitive names bid as guidance is raised.";
const CHATTER = "Beautiful morning in the city. Coffee with the team and a long walk.";

function quality(partial: Partial<Parameters<typeof passesSignalFilter>[0]> = {}) {
  return {
    followersCount: 12_000,
    likeCount: 20,
    retweetCount: 4,
    replyCount: 2,
    quoteCount: 1,
    verified: false,
    createdAt: "2026-09-01T15:50:00.000Z",
    text: DESK_TEXT,
    authorHandle: "middesk_tape",
    ...partial,
  };
}

describe("passesSignalFilter", () => {
  it("drops tiny followings even when the tweet has likes", () => {
    const verdict = passesSignalFilter(quality({ followersCount: 12, likeCount: 40 }), now);
    expect(verdict.pass).toBe(false);
    expect(verdict.reasons.some((r) => r.includes("followers"))).toBe(true);
  });

  it("drops accounts that typically do not get likes", () => {
    const verdict = passesSignalFilter(quality({ followersCount: 80, likeCount: 0, retweetCount: 0 }), now);
    expect(verdict.pass).toBe(false);
    expect(verdict.reasons.some((r) => r.includes("likes"))).toBe(true);
  });

  it("requires the 50-follower and 5-like floors", () => {
    expect(passesSignalFilter(quality({ followersCount: MIN_FOLLOWERS - 1, likeCount: 9 }), now).pass).toBe(false);
    expect(passesSignalFilter(quality({ followersCount: 400, likeCount: MIN_LIKES - 1 }), now).pass).toBe(false);
    expect(passesSignalFilter(quality({ followersCount: 8_000, likeCount: 12 }), now).pass).toBe(true);
  });

  it("does not treat a mid-size account with zero likes as established", () => {
    const verdict = passesSignalFilter(
      quality({
        followersCount: 9_000,
        likeCount: 0,
        retweetCount: 0,
        createdAt: "2026-09-01T15:55:00.000Z",
      }),
      now,
    );
    expect(verdict.pass).toBe(false);
  });

  it("lets a fresh catalyst post from an established desk through before likes accrue", () => {
    const verdict = passesSignalFilter(
      quality({
        followersCount: ESTABLISHED_FOLLOWERS,
        likeCount: 0,
        retweetCount: 0,
        createdAt: "2026-09-01T15:55:00.000Z",
      }),
      now,
    );
    expect(verdict.establishedFresh).toBe(true);
    expect(verdict.pass).toBe(true);
  });

  it("still rejects a stale zero-like post from an established desk", () => {
    const verdict = passesSignalFilter(
      quality({
        followersCount: ESTABLISHED_FOLLOWERS,
        likeCount: 0,
        createdAt: "2026-09-01T14:00:00.000Z",
      }),
      now,
    );
    expect(verdict.pass).toBe(false);
  });

  it("drops mid-size chatter even when follower and like floors clear", () => {
    const verdict = passesSignalFilter(
      quality({ followersCount: 8_000, likeCount: 12, text: CHATTER }),
      now,
    );
    expect(verdict.pass).toBe(false);
    expect(verdict.reasons.some((r) => r.startsWith("desk"))).toBe(true);
  });

  it("drops cashtag-only posts even from an established desk", () => {
    const verdict = passesSignalFilter(
      quality({
        followersCount: 80_000,
        likeCount: 40,
        text: "$AAPL $MSFT looking clean into the close",
      }),
      now,
    );
    expect(verdict.pass).toBe(false);
    expect(verdict.reasons).toContain("no news or analysis");
  });

  it("drops a KOL flash with no payload", () => {
    const verdict = passesSignalFilter(
      quality({
        authorHandle: "DeItaone",
        followersCount: 40,
        likeCount: 0,
        text: "JUST IN: watching",
      }),
      now,
    );
    expect(verdict.kol).toBe(true);
    expect(verdict.pass).toBe(false);
    expect(verdict.reasons).toContain("no news or analysis");
  });

  it("keeps an analytical take without a cashtag", () => {
    const verdict = passesSignalFilter(
      quality({
        likeCount: 40,
        text: "The takeaway from this CPI print: the 10-year is pricing in two rate cuts, not a pivot.",
      }),
      now,
    );
    expect(verdict.pass).toBe(true);
  });

  it("in venture mode keeps funding news and drops market prints", () => {
    const round = passesSignalFilter(
      quality({
        authorHandle: "techcrunch",
        likeCount: 40,
        text: "Anthropic raises $3.5bn Series E at a $60bn valuation, sources say.",
      }),
      now,
      { deskMode: "venture" },
    );
    expect(round.pass).toBe(true);

    const fomc = passesSignalFilter(
      quality({
        likeCount: 40,
        text: "BREAKING: FOMC holds the funds rate",
      }),
      now,
      { deskMode: "venture" },
    );
    expect(fomc.pass).toBe(false);
  });

  it("drops giveaway spam even from a KOL", () => {
    const verdict = passesSignalFilter(
      quality({
        authorHandle: "zerohedge",
        followersCount: 2_000_000,
        likeCount: 400,
        text: "Huge giveaway — follow and RT to win a free course",
      }),
      now,
    );
    expect(verdict.pass).toBe(false);
    expect(verdict.kol).toBe(true);
  });

  it("lets a KOL through without likes when the post is a catalyst", () => {
    const verdict = passesSignalFilter(
      quality({
        authorHandle: "DeItaone",
        followersCount: 40,
        likeCount: 0,
        retweetCount: 0,
        text: "JUST IN: CPI 3.2% vs 3.1% expected",
      }),
      now,
    );
    expect(verdict.kol).toBe(true);
    expect(verdict.pass).toBe(true);
  });

  it("still drops KOL lifestyle chatter", () => {
    const verdict = passesSignalFilter(
      quality({ authorHandle: "elonmusk", followersCount: 200_000_000, likeCount: 80_000, text: CHATTER }),
      now,
    );
    expect(verdict.kol).toBe(true);
    expect(verdict.pass).toBe(false);
  });

  it("drops non-KOL authors when kolOnly is on", () => {
    const verdict = passesSignalFilter(quality({ authorHandle: "middesk_tape", likeCount: 40 }), now, {
      kolOnly: true,
    });
    expect(verdict.pass).toBe(false);
    expect(verdict.reasons).toContain("not a key network node");
  });

  it("keeps a KOL catalyst when kolOnly is on", () => {
    const verdict = passesSignalFilter(
      quality({
        authorHandle: "DeItaone",
        followersCount: 40,
        likeCount: 0,
        text: "JUST IN: CPI 3.2% vs 3.1% expected",
      }),
      now,
      { kolOnly: true },
    );
    expect(verdict.pass).toBe(true);
  });

  it("requires likes on a KOL when engagement is on", () => {
    const verdict = passesSignalFilter(
      quality({
        authorHandle: "DeItaone",
        followersCount: 40,
        likeCount: 0,
        text: "JUST IN: CPI 3.2% vs 3.1% expected",
      }),
      now,
      { requireEngagement: true, signalLevel: "standard" },
    );
    expect(verdict.pass).toBe(false);
    expect(verdict.reasons.some((r) => r.includes("likes"))).toBe(true);
  });

  it("uses a custom min-likes floor", () => {
    const verdict = passesSignalFilter(quality({ followersCount: 8_000, likeCount: 12 }), now, {
      minLikes: 50,
      allowFresh: false,
    });
    expect(verdict.pass).toBe(false);
    expect(verdict.reasons.some((r) => r.includes("likes 12 < 50"))).toBe(true);
  });

  it("applies an explicit min-likes floor to Key Network Nodes and fresh desks when engagement is required", () => {
    const node = passesSignalFilter(
      quality({
        authorHandle: "DeItaone",
        followersCount: 40,
        likeCount: 0,
        text: "JUST IN: CPI 3.2% vs 3.1% expected",
      }),
      now,
      { minLikes: 10, requireEngagement: true },
    );
    expect(node.kol).toBe(true);
    expect(node.pass).toBe(false);
    expect(node.reasons.some((r) => r.includes("likes 0 < 10"))).toBe(true);

    const fresh = passesSignalFilter(
      quality({
        followersCount: ESTABLISHED_FOLLOWERS,
        likeCount: 0,
        retweetCount: 0,
        createdAt: "2026-09-01T15:55:00.000Z",
      }),
      now,
      { minLikes: 25, allowFresh: true, requireEngagement: true },
    );
    expect(fresh.establishedFresh).toBe(true);
    expect(fresh.pass).toBe(false);
    expect(fresh.reasons.some((r) => r.includes("likes 0 < 25"))).toBe(true);
  });

  it("still lets nodes skip the inherited level like floor", () => {
    const verdict = passesSignalFilter(
      quality({
        authorHandle: "DeItaone",
        followersCount: 40,
        likeCount: 0,
        text: "JUST IN: CPI 3.2% vs 3.1% expected",
      }),
      now,
      { minLikes: 5 },
    );
    expect(verdict.kol).toBe(true);
    expect(verdict.pass).toBe(true);
  });

  it("drops thin engagement from small accounts even when the like floor clears", () => {
    const verdict = passesSignalFilter(
      quality({
        followersCount: 400,
        likeCount: 5,
        retweetCount: 0,
        quoteCount: 0,
        replyCount: 0,
      }),
      now,
    );
    expect(verdict.pass).toBe(false);
    expect(verdict.reasons.some((r) => r.includes("thin engagement"))).toBe(true);
  });

  it("drops crypto token talk unless a listed crypto stock is tagged", () => {
    const token = passesSignalFilter(quality({ likeCount: 40, text: "Long $BTC into the ETF bid" }), now);
    expect(token.pass).toBe(false);
    expect(token.reasons).toContain("crypto");

    const equity = passesSignalFilter(
      quality({ likeCount: 40, text: "$MSTR added bitcoin; treasury now $12bn" }),
      now,
    );
    expect(equity.pass).toBe(true);
  });

  it("drops Telegram and WhatsApp funnels", () => {
    const verdict = passesSignalFilter(
      quality({ likeCount: 40, text: "$NVDA beats — join telegram t.me/flowdesk" }),
      now,
    );
    expect(verdict.pass).toBe(false);
    expect(verdict.reasons).toContain("telegram/whatsapp");
  });

  it("raises floors on the higher signal level", () => {
    const standard = passesSignalFilter(quality({ followersCount: 8_000, likeCount: 12 }), now, {
      signalLevel: "standard",
      allowFresh: false,
    });
    const high = passesSignalFilter(quality({ followersCount: 8_000, likeCount: 12 }), now, {
      signalLevel: "high",
      allowFresh: false,
    });
    expect(standard.pass).toBe(true);
    expect(high.pass).toBe(false);
  });

  it("drops a blocked account even when it is a node labeled high", () => {
    const verdict = passesSignalFilter(
      quality({
        authorHandle: "DeItaone",
        followersCount: 40,
        likeCount: 0,
        text: "JUST IN: CPI 3.2% vs 3.1% expected",
      }),
      now,
      { blocked: true, userLabel: "high" },
    );
    expect(verdict.pass).toBe(false);
    expect(verdict.reasons).toContain("blocked");
    expect(verdict.kol).toBe(true);
  });
});

describe("signalScore", () => {
  it("scores larger, more-engaged accounts higher", () => {
    const desk = signalScore(quality({ followersCount: 250_000, likeCount: 180, verified: true }));
    const noise = signalScore(quality({ followersCount: 60, likeCount: 5, retweetCount: 0, quoteCount: 0, replyCount: 0 }));
    expect(desk).toBeGreaterThan(noise);
    expect(desk).toBeGreaterThan(40);
  });
});

describe("user labels and author priors", () => {
  it("always keeps a tweet labeled high", () => {
    const verdict = passesSignalFilter(quality({ followersCount: 12, likeCount: 0, text: CHATTER }), now, {
      userLabel: "high",
    });
    expect(verdict.pass).toBe(true);
    expect(verdict.reasons).toContain("labeled high");
  });

  it("always drops a tweet labeled low", () => {
    const verdict = passesSignalFilter(quality({ followersCount: 80_000, likeCount: 40 }), now, {
      userLabel: "low",
    });
    expect(verdict.pass).toBe(false);
    expect(verdict.reasons).toContain("labeled low");
  });

  it("suppresses an author after two net-low labels", () => {
    const verdict = passesSignalFilter(quality({ followersCount: 80_000, likeCount: 40 }), now, {
      prior: { high: 0, low: 2 },
    });
    expect(verdict.pass).toBe(false);
    expect(verdict.prior.suppress).toBe(true);
  });

  it("does not suppress or boost when labels are tied", () => {
    const verdict = passesSignalFilter(quality({ followersCount: 8_000, likeCount: 12 }), now, {
      prior: { high: 2, low: 2 },
    });
    expect(verdict.pass).toBe(true);
    expect(verdict.prior.suppress).toBe(false);
    expect(verdict.prior.boost).toBe(false);
  });

  it("boosts an author after two net-high labels so low-engagement catalyst posts still pass", () => {
    const verdict = passesSignalFilter(
      quality({ followersCount: 40, likeCount: 0, retweetCount: 0, quoteCount: 0, replyCount: 0 }),
      now,
      { prior: { high: 2, low: 0 } },
    );
    expect(verdict.prior.boost).toBe(true);
    expect(verdict.pass).toBe(true);
  });

  it("shifts the displayed score toward the labeled prior", () => {
    const base = passesSignalFilter(quality({ followersCount: 8_000, likeCount: 12 }), now);
    const boosted = passesSignalFilter(quality({ followersCount: 8_000, likeCount: 12 }), now, {
      prior: { high: 4, low: 0 },
    });
    const penalized = passesSignalFilter(quality({ followersCount: 8_000, likeCount: 12 }), now, {
      prior: { high: 0, low: 1 },
    });
    expect(boosted.score).toBeGreaterThan(base.score);
    expect(penalized.score).toBeLessThan(base.score);
  });
});
