import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { alreadySeen, matchDedupeKey, rememberTweet } from "./dedup";
import { createRule, openDatabase, tryInsertMatch } from "./db";
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
    authorHandle: "reuters",
    authorName: "Reuters",
    text: "FOMC holds the interest rate.",
    createdAt: new Date().toISOString(),
    lang: "en",
    isRetweet: false,
    isReply: false,
    permalink: `https://x.com/reuters/status/${id}`,
    raw: { id, text: "FOMC holds the interest rate." },
    followersCount: 25_000_000,
    likeCount: 420,
    retweetCount: 80,
    replyCount: 40,
    quoteCount: 12,
    verified: true,
  };
}

describe("in-memory dedup helpers", () => {
  it("never remembers the same tweet id twice", () => {
    const seen = new Set<string>();
    expect(rememberTweet(seen, "1")).toBe(true);
    expect(rememberTweet(seen, "1")).toBe(false);
    expect(alreadySeen(seen, "1")).toBe(true);
    expect(alreadySeen(seen, "2")).toBe(false);
  });

  it("scopes the persistence key by rule and tweet", () => {
    expect(matchDedupeKey("rule-a", "tw-1")).toBe("rule-a:tw-1");
    expect(matchDedupeKey("rule-b", "tw-1")).not.toBe(matchDedupeKey("rule-a", "tw-1"));
  });
});

describe("sqlite unique (rule_id, tweet_id)", () => {
  it("inserts a tweet once per rule and ignores the duplicate", () => {
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

    const first = tryInsertMatch(ruleA, tweet("tw-99"), db);
    const dup = tryInsertMatch(ruleA, tweet("tw-99"), db);
    const otherRule = tryInsertMatch(ruleB, tweet("tw-99"), db);

    expect(first.inserted).toBe(true);
    expect(dup.inserted).toBe(false);
    expect(otherRule.inserted).toBe(true);
  });
});
