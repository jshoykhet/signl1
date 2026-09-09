import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { MAX_LIVE_CUSTOM_RULES } from "./config";
import { createRule, listMatches, openDatabase, tryInsertMatch } from "./db";
import { queryHash } from "./query-hash";
import type { NormalizedTweet } from "./types";

const tmpDirs: string[] = [];

afterEach(() => {
  for (const dir of tmpDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

function tweet(id: string): NormalizedTweet {
  return {
    id,
    authorHandle: "DeItaone",
    authorName: "Walter Bloomberg",
    text: "JUST IN: CPI beats; FOMC-sensitive names bid as guidance is raised.",
    createdAt: new Date().toISOString(),
    lang: "en",
    isRetweet: false,
    isReply: false,
    permalink: `https://x.com/DeItaone/status/${id}`,
    raw: {
      tweet: { public_metrics: { like_count: 80, retweet_count: 12, reply_count: 4, quote_count: 2 } },
      author: { verified: true, public_metrics: { followers_count: 900_000 } },
    },
    followersCount: 900_000,
    likeCount: 80,
    retweetCount: 12,
    replyCount: 4,
    quoteCount: 2,
    verified: true,
  };
}

describe("shared tape", () => {
  it("hashes identical compiled queries the same way", () => {
    expect(queryHash("CPI FOMC")).toBe(queryHash("CPI FOMC"));
    expect(queryHash("CPI FOMC")).not.toBe(queryHash("Powell"));
  });

  it("does not copy a tweet body per SignlHQ", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "signal-"));
    tmpDirs.push(dir);
    const db = openDatabase(path.join(dir, "test.db"));
    const ruleA = createRule(
      "hq-a",
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
      "hq-b",
      {
        name: "B",
        enabled: true,
        queryInput: "FOMC",
        accounts: [],
        pollIntervalMs: 15_000,
        slackWebhookUrl: null,
        genericWebhookUrl: null,
      },
      db,
    );
    expect(tryInsertMatch(ruleA, tweet("tw-share"), db).inserted).toBe(true);
    expect(tryInsertMatch(ruleB, tweet("tw-share"), db).inserted).toBe(false);
    const posts = db.prepare("SELECT COUNT(*) AS n FROM posts").get() as { n: number };
    const hits = db.prepare("SELECT COUNT(*) AS n FROM post_hits").get() as { n: number };
    expect(posts.n).toBe(1);
    expect(hits.n).toBe(1);
    expect(listMatches("hq-a", { quality: true }, db).some((match) => match.tweetId === "tw-share")).toBe(true);
    expect(listMatches("hq-b", { quality: true }, db).some((match) => match.tweetId === "tw-share")).toBe(true);
  });

  it("keeps a different compiled query off another SignlHQ", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "signal-"));
    tmpDirs.push(dir);
    const db = openDatabase(path.join(dir, "test.db"));
    const fed = createRule(
      "hq-a",
      {
        name: "Fed",
        enabled: true,
        queryInput: "FOMC",
        accounts: [],
        pollIntervalMs: 15_000,
        slackWebhookUrl: null,
        genericWebhookUrl: null,
      },
      db,
    );
    createRule(
      "hq-b",
      {
        name: "Oil",
        enabled: true,
        queryInput: "Brent crude OPEC",
        accounts: [],
        pollIntervalMs: 15_000,
        slackWebhookUrl: null,
        genericWebhookUrl: null,
      },
      db,
    );
    expect(tryInsertMatch(fed, tweet("tw-fed"), db).inserted).toBe(true);
    expect(listMatches("hq-a", { quality: true }, db).some((match) => match.tweetId === "tw-fed")).toBe(true);
    expect(listMatches("hq-b", { quality: true }, db).some((match) => match.tweetId === "tw-fed")).toBe(false);
  });

  it("caps live custom monitors per SignlHQ", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "signal-"));
    tmpDirs.push(dir);
    const db = openDatabase(path.join(dir, "test.db"));
    for (let i = 0; i < MAX_LIVE_CUSTOM_RULES; i += 1) {
      createRule(
        "hq-cap",
        {
          name: `Custom ${i}`,
          enabled: true,
          queryInput: `FOMC print ${i}`,
          accounts: [],
          pollIntervalMs: 15_000,
          slackWebhookUrl: null,
          genericWebhookUrl: null,
        },
        db,
      );
    }
    expect(() =>
      createRule(
        "hq-cap",
        {
          name: "One more",
          enabled: true,
          queryInput: "FOMC extra",
          accounts: [],
          pollIntervalMs: 15_000,
          slackWebhookUrl: null,
          genericWebhookUrl: null,
        },
        db,
      ),
    ).toThrow(/8 custom live monitors/i);
    const paused = createRule(
      "hq-cap",
      {
        name: "Paused",
        enabled: false,
        queryInput: "FOMC paused",
        accounts: [],
        pollIntervalMs: 15_000,
        slackWebhookUrl: null,
        genericWebhookUrl: null,
      },
      db,
    );
    expect(paused.enabled).toBe(false);
  });
});
