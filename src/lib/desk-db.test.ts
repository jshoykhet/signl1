import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  addBlockedHandle,
  addKolHandle,
  createRule,
  evaluateTweetSignal,
  getBlockedSpec,
  getDeskFilterSettings,
  getKolSpec,
  listAuthorFollowerCounts,
  listMatches,
  openDatabase,
  removeBlockedHandle,
  removeKolHandle,
  resetBlockedHandles,
  resetKolHandles,
  setDeskFilterSettings,
  tryInsertMatch,
} from "./db";
import { isBlockedHandle } from "./blocked";
import { isKolHandle } from "./kol";
import type { NormalizedTweet } from "./types";

const tmpDirs: string[] = [];

afterEach(() => {
  for (const dir of tmpDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

function catalyst(handle: string, extras: Partial<NormalizedTweet> = {}): NormalizedTweet {
  return {
    id: extras.id ?? "tw-1",
    authorHandle: handle,
    authorName: handle,
    text: extras.text ?? "JUST IN: CPI 3.2% vs 3.1% expected",
    createdAt: extras.createdAt ?? new Date().toISOString(),
    lang: "en",
    isRetweet: false,
    isReply: false,
    permalink: `https://x.com/${handle}/status/${extras.id ?? "tw-1"}`,
    raw: extras.raw ?? {
      tweet: { public_metrics: { like_count: extras.likeCount ?? 0, retweet_count: 0, reply_count: 0, quote_count: 0 } },
      author: { verified: false, public_metrics: { followers_count: extras.followersCount ?? 40 } },
    },
    followersCount: extras.followersCount ?? 40,
    likeCount: extras.likeCount ?? 0,
    retweetCount: extras.retweetCount ?? 0,
    replyCount: extras.replyCount ?? 0,
    quoteCount: extras.quoteCount ?? 0,
    verified: extras.verified ?? false,
  };
}

describe("desk filters and KOL list persist in SQLite", () => {
  it("starts with seeded KOLs and default floors", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "signal-"));
    tmpDirs.push(dir);
    const db = openDatabase(path.join(dir, "test.db"));
    expect(getDeskFilterSettings(db)).toEqual({
      kolOnly: false,
      signalLevel: "standard",
      allowFresh: true,
      requireEngagement: false,
      minLikes: 5,
      hideCrypto: true,
      hideMessagingApps: true,
    });
    expect(isKolHandle("DeItaone", getKolSpec(db))).toBe(true);
  });

  it("adds and removes handles on top of the seed, then reset restores it", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "signal-"));
    tmpDirs.push(dir);
    const db = openDatabase(path.join(dir, "test.db"));
    addKolHandle("MyDesk", db);
    removeKolHandle("zerohedge", db);
    const spec = getKolSpec(db);
    expect(isKolHandle("MyDesk", spec)).toBe(true);
    expect(isKolHandle("zerohedge", spec)).toBe(false);
    expect(isKolHandle("elonmusk", spec)).toBe(true);
    resetKolHandles(db);
    const restored = getKolSpec(db);
    expect(isKolHandle("MyDesk", restored)).toBe(false);
    expect(isKolHandle("zerohedge", restored)).toBe(true);
  });

  it("restores a removed seed handle without marking it custom", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "signal-"));
    tmpDirs.push(dir);
    const db = openDatabase(path.join(dir, "test.db"));
    removeKolHandle("zerohedge", db);
    addKolHandle("zerohedge", db);
    const spec = getKolSpec(db);
    expect(isKolHandle("zerohedge", spec)).toBe(true);
    expect(spec.added ?? []).not.toContain("zerohedge");
    expect(spec.removed ?? []).not.toContain("zerohedge");
  });

  it("rejects a malformed handle", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "signal-"));
    tmpDirs.push(dir);
    const db = openDatabase(path.join(dir, "test.db"));
    expect(() => addKolHandle("not a handle!", db)).toThrow(/1–15/);
  });

  it("drops non-KOL authors when kol only is on", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "signal-"));
    tmpDirs.push(dir);
    const db = openDatabase(path.join(dir, "test.db"));
    setDeskFilterSettings({ kolOnly: true }, db);
    expect(
      evaluateTweetSignal(
        catalyst("middesk_tape", {
          followersCount: 80_000,
          likeCount: 40,
          text: "$AAPL beats EPS; FOMC-sensitive names bid as guidance is raised.",
        }),
        db,
      ).pass,
    ).toBe(false);
    expect(evaluateTweetSignal(catalyst("DeItaone"), db).pass).toBe(true);
  });

  it("requires likes when engagement is on", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "signal-"));
    tmpDirs.push(dir);
    const db = openDatabase(path.join(dir, "test.db"));
    setDeskFilterSettings({ requireEngagement: true }, db);
    expect(evaluateTweetSignal(catalyst("DeItaone"), db).pass).toBe(false);
  });

  it("applies a custom min-likes floor", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "signal-"));
    tmpDirs.push(dir);
    const db = openDatabase(path.join(dir, "test.db"));
    setDeskFilterSettings({ minLikes: 50, allowFresh: false }, db);
    const weak = catalyst("middesk_tape", {
      followersCount: 8_000,
      likeCount: 12,
      text: "$AAPL beats EPS; FOMC-sensitive names bid as guidance is raised.",
    });
    expect(evaluateTweetSignal(weak, db).pass).toBe(false);
    setDeskFilterSettings({ minLikes: 5 }, db);
    expect(evaluateTweetSignal(weak, db).pass).toBe(true);
  });

  it("does not apply min likes to a Key Network Node unless Require likes is on", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "signal-"));
    tmpDirs.push(dir);
    const db = openDatabase(path.join(dir, "test.db"));
    expect(evaluateTweetSignal(catalyst("DeItaone"), db).pass).toBe(true);
    setDeskFilterSettings({ minLikes: 10 }, db);
    expect(evaluateTweetSignal(catalyst("DeItaone"), db).pass).toBe(true);
    setDeskFilterSettings({ requireEngagement: true }, db);
    expect(evaluateTweetSignal(catalyst("DeItaone"), db).pass).toBe(false);
    setDeskFilterSettings({ requireEngagement: false, minLikes: null }, db);
    expect(evaluateTweetSignal(catalyst("DeItaone"), db).pass).toBe(true);
  });

  it("hides crypto noise and Telegram funnels by default", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "signal-"));
    tmpDirs.push(dir);
    const db = openDatabase(path.join(dir, "test.db"));
    const token = catalyst("middesk_tape", {
      followersCount: 80_000,
      likeCount: 40,
      text: "Long $BTC into the weekly close",
    });
    const chat = catalyst("middesk_tape", {
      followersCount: 80_000,
      likeCount: 40,
      text: "$NVDA beats — join telegram t.me/flowdesk",
    });
    const stock = catalyst("middesk_tape", {
      followersCount: 80_000,
      likeCount: 40,
      text: "$COIN volume spike into the print",
    });
    expect(evaluateTweetSignal(token, db).pass).toBe(false);
    expect(evaluateTweetSignal(chat, db).pass).toBe(false);
    expect(evaluateTweetSignal(stock, db).pass).toBe(true);
    setDeskFilterSettings({ hideCrypto: false, hideMessagingApps: false }, db);
    expect(evaluateTweetSignal(token, db).pass).toBe(true);
    expect(evaluateTweetSignal(chat, db).pass).toBe(true);
  });

  it("re-filters the inbox when min likes is raised", () => {
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
    const tweet = catalyst("middesk_tape", {
      id: "tw-likes",
      followersCount: 8_000,
      likeCount: 12,
      text: "$AAPL beats EPS; FOMC-sensitive names bid as guidance is raised.",
    });
    expect(tryInsertMatch(rule, tweet, db).inserted).toBe(true);
    expect(listMatches({ quality: true }, db).some((m) => m.tweetId === "tw-likes")).toBe(true);
    setDeskFilterSettings({ minLikes: 50, allowFresh: false }, db);
    expect(evaluateTweetSignal(tweet, db).pass).toBe(false);
    expect(listMatches({ quality: true }, db).some((m) => m.tweetId === "tw-likes")).toBe(false);
  });

  it("reads follower counts from ingested matches", () => {
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
    tryInsertMatch(
      rule,
      catalyst("reuters", {
        followersCount: 25_000_000,
        likeCount: 40,
        text: "FOMC holds the interest rate.",
      }),
      db,
    );
    expect(listAuthorFollowerCounts(db).get("reuters")).toBe(25_000_000);
  });

  it("blocks an account from the inbox even when it is a node", () => {
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
    const tweet = catalyst("DeItaone", { id: "tw-block", followersCount: 80_000, likeCount: 40 });
    tryInsertMatch(rule, tweet, db);
    expect(listMatches({ quality: true }, db).some((m) => m.authorHandle === "DeItaone")).toBe(true);
    addBlockedHandle("DeItaone", db);
    expect(isBlockedHandle("DeItaone", getBlockedSpec(db))).toBe(true);
    expect(evaluateTweetSignal(tweet, db).pass).toBe(false);
    expect(listMatches({ quality: true }, db).some((m) => m.authorHandle.toLowerCase() === "deitaone")).toBe(false);
    removeBlockedHandle("DeItaone", db);
    expect(listMatches({ quality: true }, db).some((m) => m.authorHandle.toLowerCase() === "deitaone")).toBe(true);
    addBlockedHandle("DeItaone", db);
    resetBlockedHandles(db);
    expect(isBlockedHandle("DeItaone", getBlockedSpec(db))).toBe(false);
  });
});
