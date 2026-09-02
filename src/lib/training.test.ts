import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  createRule,
  evaluateTweetSignal,
  getAuthorPrior,
  getMeta,
  listMatches,
  openDatabase,
  requestManualPoll,
  setMatchLabel,
  takeManualPollRequest,
  tryInsertMatch,
} from "./db";
import type { NormalizedTweet } from "./types";

const tmpDirs: string[] = [];
const U = "desk-a";

afterEach(() => {
  for (const dir of tmpDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

function tweet(id: string, handle = "reuters"): NormalizedTweet {
  return {
    id,
    authorHandle: handle,
    authorName: handle,
    text: "FOMC holds the interest rate.",
    createdAt: new Date().toISOString(),
    lang: "en",
    isRetweet: false,
    isReply: false,
    permalink: `https://x.com/${handle}/status/${id}`,
    raw: {
      tweet: { public_metrics: { like_count: 40, retweet_count: 8, reply_count: 3, quote_count: 1 } },
      author: { verified: true, public_metrics: { followers_count: 25_000_000 } },
    },
    followersCount: 25_000_000,
    likeCount: 40,
    retweetCount: 8,
    replyCount: 3,
    quoteCount: 1,
    verified: true,
  };
}

function weakTweet(id: string, handle = "nobody"): NormalizedTweet {
  return {
    ...tweet(id, handle),
    followersCount: 40,
    likeCount: 0,
    retweetCount: 0,
    replyCount: 0,
    quoteCount: 0,
    verified: false,
    raw: {
      tweet: { public_metrics: { like_count: 0, retweet_count: 0, reply_count: 0, quote_count: 0 } },
      author: { verified: false, public_metrics: { followers_count: 40 } },
    },
  };
}

describe("signal labels train author priors", () => {
  it("copies a label to every match of the same tweet and counts the author prior once", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "signal-"));
    tmpDirs.push(dir);
    const db = openDatabase(path.join(dir, "test.db"));
    const ruleA = createRule(
      U,
      {
        name: "A",
        enabled: true,
        queryInput: "FOMC",
        accounts: [],
        pollIntervalMs: 15_000,
        slackWebhookUrl: null,
        genericWebhookUrl: null,
      },
      db,
    );
    const ruleB = createRule(
      U,
      {
        name: "B",
        enabled: true,
        queryInput: "Powell",
        accounts: [],
        pollIntervalMs: 15_000,
        slackWebhookUrl: null,
        genericWebhookUrl: null,
      },
      db,
    );

    const a = tryInsertMatch(ruleA, tweet("tw-1"), db);
    const b = tryInsertMatch(ruleB, tweet("tw-1"), db);
    expect(a.matchId).toBeTruthy();
    expect(b.matchId).toBeTruthy();

    const labeled = setMatchLabel(a.matchId!, "low", U, db);
    expect(labeled?.userLabel).toBe("low");

    const listed = listMatches(U, { quality: false }, db);
    expect(listed.every((m) => m.tweetId !== "tw-1" || m.userLabel === "low")).toBe(true);
    expect(listed.filter((m) => m.tweetId === "tw-1").every((m) => m.kol)).toBe(true);
    expect(getAuthorPrior("reuters", U, db)).toEqual({ high: 0, low: 1 });
  });

  it("suppresses later posts from an author after two low-signal labels", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "signal-"));
    tmpDirs.push(dir);
    const db = openDatabase(path.join(dir, "test.db"));
    const rule = createRule(
      U,
      {
        name: "A",
        enabled: true,
        queryInput: "FOMC",
        accounts: [],
        pollIntervalMs: 15_000,
        slackWebhookUrl: null,
        genericWebhookUrl: null,
      },
      db,
    );

    const first = tryInsertMatch(rule, tweet("tw-a"), db);
    const second = tryInsertMatch(rule, tweet("tw-b"), db);
    setMatchLabel(first.matchId!, "low", U, db);
    setMatchLabel(second.matchId!, "low", U, db);

    expect(getAuthorPrior("reuters", U, db)).toEqual({ high: 0, low: 2 });
    expect(evaluateTweetSignal(tweet("tw-c"), U, db).pass).toBe(false);
    expect(evaluateTweetSignal(tweet("tw-c"), U, db).prior.suppress).toBe(true);
  });

  it("boosts a weak account after two high-signal labels", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "signal-"));
    tmpDirs.push(dir);
    const db = openDatabase(path.join(dir, "test.db"));
    const rule = createRule(
      U,
      {
        name: "A",
        enabled: true,
        queryInput: "FOMC",
        accounts: [],
        pollIntervalMs: 15_000,
        slackWebhookUrl: null,
        genericWebhookUrl: null,
      },
      db,
    );

    const first = tryInsertMatch(rule, tweet("tw-a", "desk"), db);
    const second = tryInsertMatch(rule, tweet("tw-b", "desk"), db);
    setMatchLabel(first.matchId!, "high", U, db);
    setMatchLabel(second.matchId!, "high", U, db);

    const weak = evaluateTweetSignal(weakTweet("tw-c", "desk"), U, db);
    expect(weak.prior.boost).toBe(true);
    expect(weak.pass).toBe(true);
  });

  it("clicking the same label again clears it", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "signal-"));
    tmpDirs.push(dir);
    const db = openDatabase(path.join(dir, "test.db"));
    const rule = createRule(
      U,
      {
        name: "A",
        enabled: true,
        queryInput: "FOMC",
        accounts: [],
        pollIntervalMs: 15_000,
        slackWebhookUrl: null,
        genericWebhookUrl: null,
      },
      db,
    );
    const inserted = tryInsertMatch(rule, tweet("tw-1"), db);
    setMatchLabel(inserted.matchId!, "high", U, db);
    const cleared = setMatchLabel(inserted.matchId!, null, U, db);
    expect(cleared?.userLabel).toBeNull();
    expect(getAuthorPrior("reuters", U, db)).toEqual({ high: 0, low: 0 });
  });
});

describe("manual re-poll flag", () => {
  it("sets a force-now flag the poller can consume once", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "signal-"));
    tmpDirs.push(dir);
    const db = openDatabase(path.join(dir, "test.db"));
    const { requestedAt } = requestManualPoll(db);
    expect(requestedAt).toBeTruthy();
    expect(getMeta("poller_force_now", db)).toBe(requestedAt);
    expect(takeManualPollRequest(db)).toBe(true);
    expect(getMeta("poller_force_now", db)).toBe("");
    expect(takeManualPollRequest(db)).toBe(false);
  });
});
