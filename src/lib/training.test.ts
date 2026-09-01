import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  createRule,
  evaluateTweetSignal,
  getAuthorPrior,
  listMatches,
  openDatabase,
  setMatchLabel,
  tryInsertMatch,
} from "./db";
import type { NormalizedTweet } from "./types";

const tmpDirs: string[] = [];

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

    const labeled = setMatchLabel(a.matchId!, "low", db);
    expect(labeled?.userLabel).toBe("low");

    const listed = listMatches({ quality: false }, db);
    expect(listed.every((m) => m.tweetId !== "tw-1" || m.userLabel === "low")).toBe(true);
    expect(getAuthorPrior("reuters", db)).toEqual({ high: 0, low: 1 });
  });

  it("suppresses later posts from an author after two low-signal labels", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "signal-"));
    tmpDirs.push(dir);
    const db = openDatabase(path.join(dir, "test.db"));
    const rule = createRule(
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
    setMatchLabel(first.matchId!, "low", db);
    setMatchLabel(second.matchId!, "low", db);

    expect(getAuthorPrior("reuters", db)).toEqual({ high: 0, low: 2 });
    expect(evaluateTweetSignal(tweet("tw-c"), db).pass).toBe(false);
    expect(evaluateTweetSignal(tweet("tw-c"), db).prior.suppress).toBe(true);
  });

  it("boosts a weak account after two high-signal labels", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "signal-"));
    tmpDirs.push(dir);
    const db = openDatabase(path.join(dir, "test.db"));
    const rule = createRule(
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
    setMatchLabel(first.matchId!, "high", db);
    setMatchLabel(second.matchId!, "high", db);

    const weak = evaluateTweetSignal(weakTweet("tw-c", "desk"), db);
    expect(weak.prior.boost).toBe(true);
    expect(weak.pass).toBe(true);
  });

  it("clicking the same label again clears it", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "signal-"));
    tmpDirs.push(dir);
    const db = openDatabase(path.join(dir, "test.db"));
    const rule = createRule(
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
    setMatchLabel(inserted.matchId!, "high", db);
    const cleared = setMatchLabel(inserted.matchId!, null, db);
    expect(cleared?.userLabel).toBeNull();
    expect(getAuthorPrior("reuters", db)).toEqual({ high: 0, low: 0 });
  });
});
