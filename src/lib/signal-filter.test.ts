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
