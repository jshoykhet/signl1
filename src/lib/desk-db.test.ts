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
  getDeskCadenceMinutes,
  getDeskFilterSettings,
  getKolSpec,
  getStatus,
  getWatchlist,
  listAuthorFollowerCounts,
  listEnabledRulesForUser,
  listMatches,
  listRules,
  markRulePolled,
  openDatabase,
  ensureUserDesk,
  removeBlockedHandle,
  removeKolHandle,
  resetAccountWatchCursors,
  resetBlockedHandles,
  resetKolHandles,
  setDeskCadenceMinutes,
  setDeskFilterSettings,
  tryInsertMatch,
} from "./db";
import { isBlockedHandle } from "./blocked";
import { isKolHandle } from "./kol";
import type { NormalizedTweet } from "./types";

const tmpDirs: string[] = [];
const U = "desk-a";

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
    expect(getDeskFilterSettings(U, db)).toEqual({
      deskMode: "markets",
      kolOnly: false,
      signalLevel: "standard",
      allowFresh: true,
      requireEngagement: false,
      minLikes: 5,
      hideCrypto: true,
      hideMessagingApps: true,
    });
    expect(isKolHandle("DeItaone", getKolSpec(U, db))).toBe(true);
  });

  it("adds and removes handles on top of the seed, then reset restores it", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "signal-"));
    tmpDirs.push(dir);
    const db = openDatabase(path.join(dir, "test.db"));
    addKolHandle(U, "MyDesk", db);
    removeKolHandle(U, "zerohedge", db);
    const spec = getKolSpec(U, db);
    expect(isKolHandle("MyDesk", spec)).toBe(true);
    expect(isKolHandle("zerohedge", spec)).toBe(false);
    expect(isKolHandle("elonmusk", spec)).toBe(true);
    resetKolHandles(U, db);
    const restored = getKolSpec(U, db);
    expect(isKolHandle("MyDesk", restored)).toBe(false);
    expect(isKolHandle("zerohedge", restored)).toBe(true);
  });

  it("restores a removed seed handle without marking it custom", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "signal-"));
    tmpDirs.push(dir);
    const db = openDatabase(path.join(dir, "test.db"));
    removeKolHandle(U, "zerohedge", db);
    addKolHandle(U, "zerohedge", db);
    const spec = getKolSpec(U, db);
    expect(isKolHandle("zerohedge", spec)).toBe(true);
    expect(spec.added ?? []).not.toContain("zerohedge");
    expect(spec.removed ?? []).not.toContain("zerohedge");
  });

  it("rejects a malformed handle", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "signal-"));
    tmpDirs.push(dir);
    const db = openDatabase(path.join(dir, "test.db"));
    expect(() => addKolHandle(U, "not a handle!", db)).toThrow(/1–15/);
  });

  it("drops non-KOL authors when kol only is on", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "signal-"));
    tmpDirs.push(dir);
    const db = openDatabase(path.join(dir, "test.db"));
    setDeskFilterSettings(U, { kolOnly: true }, db);
    expect(
      evaluateTweetSignal(
        catalyst("middesk_tape", {
          followersCount: 80_000,
          likeCount: 40,
          text: "$AAPL beats EPS; FOMC-sensitive names bid as guidance is raised.",
        }),
        U,
        db,
      ).pass,
    ).toBe(false);
    expect(evaluateTweetSignal(catalyst("DeItaone"), U, db).pass).toBe(true);
  });

  it("requires likes when engagement is on", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "signal-"));
    tmpDirs.push(dir);
    const db = openDatabase(path.join(dir, "test.db"));
    setDeskFilterSettings(U, { requireEngagement: true }, db);
    expect(evaluateTweetSignal(catalyst("DeItaone"), U, db).pass).toBe(false);
  });

  it("applies a custom min-likes floor", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "signal-"));
    tmpDirs.push(dir);
    const db = openDatabase(path.join(dir, "test.db"));
    setDeskFilterSettings(U, { minLikes: 50, allowFresh: false }, db);
    const weak = catalyst("middesk_tape", {
      followersCount: 8_000,
      likeCount: 12,
      text: "$AAPL beats EPS; FOMC-sensitive names bid as guidance is raised.",
    });
    expect(evaluateTweetSignal(weak, U, db).pass).toBe(false);
    setDeskFilterSettings(U, { minLikes: 5 }, db);
    expect(evaluateTweetSignal(weak, U, db).pass).toBe(true);
  });

  it("does not apply min likes to a Key Network Node unless Require likes is on", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "signal-"));
    tmpDirs.push(dir);
    const db = openDatabase(path.join(dir, "test.db"));
    expect(evaluateTweetSignal(catalyst("DeItaone"), U, db).pass).toBe(true);
    setDeskFilterSettings(U, { minLikes: 10 }, db);
    expect(evaluateTweetSignal(catalyst("DeItaone"), U, db).pass).toBe(true);
    setDeskFilterSettings(U, { requireEngagement: true }, db);
    expect(evaluateTweetSignal(catalyst("DeItaone"), U, db).pass).toBe(false);
    setDeskFilterSettings(U, { requireEngagement: false, minLikes: null }, db);
    expect(evaluateTweetSignal(catalyst("DeItaone"), U, db).pass).toBe(true);
  });

  it("hides crypto noise and Telegram funnels by default", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "signal-"));
    tmpDirs.push(dir);
    const db = openDatabase(path.join(dir, "test.db"));
    const token = catalyst("middesk_tape", {
      followersCount: 80_000,
      likeCount: 40,
      text: "JUST IN: $BTC ETF inflows $2.1bn vs $800m expected",
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
    expect(evaluateTweetSignal(token, U, db).pass).toBe(false);
    expect(evaluateTweetSignal(chat, U, db).pass).toBe(false);
    expect(evaluateTweetSignal(stock, U, db).pass).toBe(true);
    setDeskFilterSettings(U, { hideCrypto: false, hideMessagingApps: false }, db);
    expect(evaluateTweetSignal(token, U, db).pass).toBe(true);
    expect(evaluateTweetSignal(chat, U, db).pass).toBe(true);
  });

  it("re-filters the inbox when min likes is raised", () => {
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
    const tweet = catalyst("middesk_tape", {
      id: "tw-likes",
      followersCount: 8_000,
      likeCount: 12,
      text: "$AAPL beats EPS; FOMC-sensitive names bid as guidance is raised.",
    });
    expect(tryInsertMatch(rule, tweet, db).inserted).toBe(true);
    expect(listMatches(U, { quality: true }, db).some((m) => m.tweetId === "tw-likes")).toBe(true);
    setDeskFilterSettings(U, { minLikes: 50, allowFresh: false }, db);
    expect(evaluateTweetSignal(tweet, U, db).pass).toBe(false);
    expect(listMatches(U, { quality: true }, db).some((m) => m.tweetId === "tw-likes")).toBe(false);
  });

  it("reads follower counts from ingested matches", () => {
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
    tryInsertMatch(
      rule,
      catalyst("reuters", {
        followersCount: 25_000_000,
        likeCount: 40,
        text: "FOMC holds the interest rate.",
      }),
      db,
    );
    expect(listAuthorFollowerCounts(U, db).get("reuters")).toBe(25_000_000);
  });

  it("blocks an account from the inbox even when it is a node", () => {
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
    const tweet = catalyst("DeItaone", { id: "tw-block", followersCount: 80_000, likeCount: 40 });
    tryInsertMatch(rule, tweet, db);
    expect(listMatches(U, { quality: true }, db).some((m) => m.authorHandle === "DeItaone")).toBe(true);
    addBlockedHandle(U, "DeItaone", db);
    expect(isBlockedHandle("DeItaone", getBlockedSpec(U, db))).toBe(true);
    expect(evaluateTweetSignal(tweet, U, db).pass).toBe(false);
    expect(listMatches(U, { quality: true }, db).some((m) => m.authorHandle.toLowerCase() === "deitaone")).toBe(false);
    removeBlockedHandle(U, "DeItaone", db);
    expect(listMatches(U, { quality: true }, db).some((m) => m.authorHandle.toLowerCase() === "deitaone")).toBe(true);
    addBlockedHandle(U, "DeItaone", db);
    resetBlockedHandles(U, db);
    expect(isBlockedHandle("DeItaone", getBlockedSpec(U, db))).toBe(false);
  });

  it("keeps two desks' inboxes isolated", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "signal-"));
    tmpDirs.push(dir);
    const db = openDatabase(path.join(dir, "test.db"));
    const a = "desk-a";
    const b = "desk-b";
    const ruleA = createRule(
      a,
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
      b,
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
    const tweet = catalyst("middesk_tape", {
      id: "tw-iso",
      followersCount: 8_000,
      likeCount: 12,
      text: "$AAPL beats EPS; FOMC-sensitive names bid as guidance is raised.",
    });
    expect(tryInsertMatch(ruleA, tweet, db).inserted).toBe(true);
    expect(listMatches(a, { quality: true }, db).some((m) => m.tweetId === "tw-iso")).toBe(true);
    expect(listMatches(b, { quality: true }, db).some((m) => m.tweetId === "tw-iso")).toBe(false);
    expect(tryInsertMatch(ruleB, tweet, db).inserted).toBe(true);
    expect(listMatches(b, { quality: true }, db).some((m) => m.tweetId === "tw-iso")).toBe(true);
    setDeskFilterSettings(a, { minLikes: 500, allowFresh: false }, db);
    expect(listMatches(a, { quality: true }, db).some((m) => m.tweetId === "tw-iso")).toBe(false);
    expect(listMatches(b, { quality: true }, db).some((m) => m.tweetId === "tw-iso")).toBe(true);
  });

  it("swaps Key Network Nodes when the desk mode changes without toggling monitors", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "signal-"));
    tmpDirs.push(dir);
    const db = openDatabase(path.join(dir, "test.db"));
    ensureUserDesk(U, db);
    expect(isKolHandle("DeItaone", getKolSpec(U, db))).toBe(true);
    expect(isKolHandle("TechCrunch", getKolSpec(U, db))).toBe(false);
    const before = listRules(U, db);
    expect(before.some((rule) => rule.name === "Fed" && rule.enabled && rule.mode === "markets")).toBe(true);
    expect(before.some((rule) => rule.name === "Funding Announcements" && rule.enabled && rule.mode === "vc")).toBe(
      true,
    );

    setDeskFilterSettings(U, { deskMode: "venture" }, db);
    expect(getDeskFilterSettings(U, db).deskMode).toBe("venture");
    expect(isKolHandle("TechCrunch", getKolSpec(U, db))).toBe(true);
    expect(isKolHandle("DeItaone", getKolSpec(U, db))).toBe(false);
    const afterVenture = listRules(U, db);
    expect(afterVenture.some((rule) => rule.name === "Funding Announcements" && rule.enabled)).toBe(true);
    expect(afterVenture.some((rule) => rule.name === "Fed" && rule.enabled)).toBe(true);

    const round = catalyst("techcrunch", {
      followersCount: 80_000,
      likeCount: 40,
      text: "Anthropic raises $3.5bn Series E at a $60bn valuation, sources say.",
    });
    expect(evaluateTweetSignal(round, U, db).pass).toBe(true);
    expect(evaluateTweetSignal(catalyst("DeItaone"), U, db).pass).toBe(false);

    setDeskFilterSettings(U, { deskMode: "markets" }, db);
    expect(isKolHandle("DeItaone", getKolSpec(U, db))).toBe(true);
    expect(listRules(U, db).some((rule) => rule.name === "Fed" && rule.enabled)).toBe(true);
    expect(listRules(U, db).some((rule) => rule.name === "Funding Announcements" && rule.enabled)).toBe(true);

    setDeskFilterSettings(U, { deskMode: "both" }, db);
    expect(getDeskFilterSettings(U, db).deskMode).toBe("both");
    expect(isKolHandle("DeItaone", getKolSpec(U, db))).toBe(true);
    expect(isKolHandle("TechCrunch", getKolSpec(U, db))).toBe(true);
    expect(evaluateTweetSignal(round, U, db).pass).toBe(true);
    expect(evaluateTweetSignal(catalyst("DeItaone"), U, db).pass).toBe(true);
    expect(listRules(U, db).some((rule) => rule.name === "Fed" && rule.enabled)).toBe(true);
    expect(listRules(U, db).some((rule) => rule.name === "Funding Announcements" && rule.enabled)).toBe(true);
  });

  it("uses one Settings cadence for inbox polling and WhatsApp", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "signal-"));
    tmpDirs.push(dir);
    const db = openDatabase(path.join(dir, "test.db"));
    ensureUserDesk(U, db);
    expect(getDeskCadenceMinutes(U, db)).toBe(15);
    expect(getStatus(U, { demoMode: true, bearerPresent: false }, db).cadenceMinutes).toBe(15);
    expect(new Set(listRules(U, db).map((rule) => rule.pollIntervalMs))).toEqual(new Set([15 * 60_000]));
    expect(getWatchlist(U, db).pollIntervalMs).toBe(15 * 60_000);

    expect(setDeskCadenceMinutes(U, 45, db)).toBe(45);
    expect(getDeskCadenceMinutes(U, db)).toBe(45);
    expect(getStatus(U, { demoMode: true, bearerPresent: false }, db).cadenceMinutes).toBe(45);
    expect(new Set(listRules(U, db).map((rule) => rule.pollIntervalMs))).toEqual(new Set([45 * 60_000]));
    expect(getWatchlist(U, db).pollIntervalMs).toBe(45 * 60_000);
    expect(listEnabledRulesForUser(U, db).every((rule) => rule.pollIntervalMs === 45 * 60_000)).toBe(true);

    expect(setDeskCadenceMinutes(U, 600, db)).toBe(600);
    expect(getDeskCadenceMinutes(U, db)).toBe(600);
  });

  it("clears account-watch cursors once so Tech Leaders can backfill", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "signal-"));
    tmpDirs.push(dir);
    const db = openDatabase(path.join(dir, "test.db"));
    ensureUserDesk(U, db);
    const leaders = listRules(U, db).find((rule) => rule.name === "Tech Leaders");
    expect(leaders).toBeTruthy();
    markRulePolled(leaders!.id, { lastPolledAt: new Date().toISOString(), lastSinceId: "2095371302093865208" }, db);
    const fed = listRules(U, db).find((rule) => rule.name === "Fed")!;
    markRulePolled(fed.id, { lastPolledAt: new Date().toISOString(), lastSinceId: "111" }, db);

    expect(resetAccountWatchCursors(db)).toBe(1);
    expect(listRules(U, db).find((rule) => rule.name === "Tech Leaders")!.lastSinceId).toBeNull();
    expect(listRules(U, db).find((rule) => rule.name === "Fed")!.lastSinceId).toBe("111");
    expect(resetAccountWatchCursors(db)).toBe(0);
  });

  it("ingests a watched Tech Leader post that would fail the keyword substance floor", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "signal-"));
    tmpDirs.push(dir);
    const db = openDatabase(path.join(dir, "test.db"));
    ensureUserDesk(U, db);
    setDeskFilterSettings(U, { deskMode: "both", signalLevel: "high" }, db);
    const leaders = listRules(U, db).find((rule) => rule.name === "Tech Leaders")!;
    const tweet = catalyst("sama", {
      id: "tw-leaders-1",
      followersCount: 2_800_000,
      likeCount: 0,
      retweetCount: 0,
      quoteCount: 0,
      replyCount: 0,
      verified: true,
      createdAt: "2026-09-01T10:00:00.000Z",
      text: "We launched GPT-5 mini for Plus this morning.",
    });
    expect(evaluateTweetSignal(tweet, U, db).pass).toBe(false);
    expect(evaluateTweetSignal(tweet, U, db, { watchedAuthor: true }).pass).toBe(true);
    expect(tryInsertMatch(leaders, tweet, db).inserted).toBe(true);
  });
});
