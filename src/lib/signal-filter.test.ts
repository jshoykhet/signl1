import { describe, expect, it } from "vitest";
import {
  ESTABLISHED_FOLLOWERS,
  MIN_FOLLOWERS,
  MIN_LIKES,
  passesSignalFilter,
  signalScore,
} from "./signal-filter";

const now = Date.parse("2026-09-01T16:00:00.000Z");

function quality(partial: Partial<Parameters<typeof passesSignalFilter>[0]> = {}) {
  return {
    followersCount: 12_000,
    likeCount: 20,
    retweetCount: 4,
    replyCount: 2,
    quoteCount: 1,
    verified: false,
    createdAt: "2026-09-01T15:50:00.000Z",
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

  it("lets a fresh post from an established desk through before likes accrue", () => {
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

  it("scores larger, more-engaged accounts above tiny ones", () => {
    const desk = signalScore(quality({ followersCount: 250_000, likeCount: 180, verified: true }));
    const noise = signalScore(quality({ followersCount: 60, likeCount: 5, retweetCount: 0, quoteCount: 0, replyCount: 0 }));
    expect(desk).toBeGreaterThan(noise);
    expect(desk).toBeGreaterThan(40);
  });
});

describe("user labels and author priors", () => {
  it("always keeps a tweet labeled high", () => {
    const verdict = passesSignalFilter(quality({ followersCount: 12, likeCount: 0 }), now, {
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

  it("boosts an author after two net-high labels so low-engagement posts still pass", () => {
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
