import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  addKolHandle,
  evaluateTweetSignal,
  getDeskFilterSettings,
  getKolSpec,
  openDatabase,
  removeKolHandle,
  resetKolHandles,
  setDeskFilterSettings,
} from "./db";
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
      minLikes: null,
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
});
