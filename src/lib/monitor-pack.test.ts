import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  createRule,
  ensureMonitorPack,
  ensureUserDesk,
  getMonitorMode,
  listEnabledRules,
  listRules,
  listRulesForMode,
  openDatabase,
  setMonitorMode,
  updateRule,
} from "./db";
import { X_MAX_QUERY_CHARS } from "./config";
import { compileQuery } from "./query";
import {
  DEFAULT_MONITORS,
  RETIRED_DEFAULT_MONITOR_NAMES,
  TECH_LEADERS_ACCOUNTS,
  VC_PUBLICATION_ACCOUNTS,
} from "./seed-rules";

const tmpDirs: string[] = [];
const U = "desk-a";

afterEach(() => {
  for (const dir of tmpDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

function tempDb() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "signal-"));
  tmpDirs.push(dir);
  return openDatabase(path.join(dir, "test.db"));
}

describe("monitor packs", () => {
  it("seeds Markets and VC defaults independently, all enabled", () => {
    const db = tempDb();
    ensureUserDesk(U, db);
    const markets = listRulesForMode(U, "markets", db);
    const vc = listRulesForMode(U, "vc", db);
    expect(markets.map((rule) => rule.name)).toEqual(["Watchlist", "Fed", "Oil", "Macro"]);
    expect(vc.map((rule) => rule.name)).toEqual([
      "Tech Leaders",
      "Funding Announcements",
      "Product Launches",
    ]);
    expect(markets.every((rule) => rule.mode === "markets")).toBe(true);
    expect(vc.every((rule) => rule.mode === "vc")).toBe(true);
    expect(markets.filter((rule) => rule.kind !== "watchlist").every((rule) => rule.enabled)).toBe(true);
    expect(vc.every((rule) => rule.enabled)).toBe(true);
    expect(listRules(U, db).some((rule) => RETIRED_DEFAULT_MONITOR_NAMES.includes(rule.name as never))).toBe(
      false,
    );
  });

  it("keeps Tech Leaders as people accounts, not publications", () => {
    const publications = new Set(VC_PUBLICATION_ACCOUNTS.map((handle) => handle.toLowerCase()));
    expect(TECH_LEADERS_ACCOUNTS.some((handle) => publications.has(handle.toLowerCase()))).toBe(false);
    expect(TECH_LEADERS_ACCOUNTS).toContain("pmarca");
    expect(TECH_LEADERS_ACCOUNTS).toContain("sama");
    expect(TECH_LEADERS_ACCOUNTS).not.toContain("TechCrunch");

    const compiled = compileQuery({
      query: "lang:en -is:retweet",
      accounts: [...TECH_LEADERS_ACCOUNTS],
    });
    expect(compiled.startsWith("(from:") || compiled.startsWith("from:")).toBe(true);
    expect(compiled).toContain("from:pmarca");
    expect(compiled).not.toContain("from:techcrunch");
    expect(compiled.length).toBeLessThanOrEqual(X_MAX_QUERY_CHARS);

    const db = tempDb();
    ensureUserDesk(U, db);
    const leaders = listRules(U, db).find((rule) => rule.name === "Tech Leaders");
    expect(leaders?.accounts).toEqual([...TECH_LEADERS_ACCOUNTS]);
    expect(leaders?.queryInput).toBe("lang:en -is:retweet");
  });

  it("persists monitor mode without changing the other pack's enabled flags", () => {
    const db = tempDb();
    ensureUserDesk(U, db);
    const oil = listRules(U, db).find((rule) => rule.name === "Oil")!;
    updateRule(oil.id, { enabled: false }, U, db);
    expect(getMonitorMode(U, db)).toBe("markets");
    setMonitorMode(U, "vc", db);
    expect(getMonitorMode(U, db)).toBe("vc");
    expect(listRules(U, db).find((rule) => rule.name === "Oil")?.enabled).toBe(false);
    expect(listRules(U, db).find((rule) => rule.name === "Funding Announcements")?.enabled).toBe(true);
    setMonitorMode(U, "markets", db);
    expect(listRules(U, db).find((rule) => rule.name === "Oil")?.enabled).toBe(false);
    expect(listRulesForMode(U, "vc", db).every((rule) => rule.enabled)).toBe(true);
  });

  it("migrates legacy mixed seeds without dropping a customized Fed query", () => {
    const db = tempDb();
    const customFed = '(FOMC OR Powell OR "dot plot") lang:en -is:retweet';
    createRule(
      U,
      {
        name: "Fed Watch",
        enabled: true,
        queryInput: customFed,
        accounts: [],
        pollIntervalMs: 15_000,
        slackWebhookUrl: null,
        genericWebhookUrl: null,
      },
      db,
    );
    createRule(
      U,
      {
        name: "Mag 7 tape",
        enabled: true,
        queryInput: "(earnings OR GPU) lang:en -is:retweet",
        accounts: ["nvidia"],
        pollIntervalMs: 15_000,
        slackWebhookUrl: null,
        genericWebhookUrl: null,
      },
      db,
    );
    createRule(
      U,
      {
        name: "VC desks",
        enabled: true,
        queryInput: "lang:en -is:retweet",
        accounts: ["TechCrunch"],
        pollIntervalMs: 15_000,
        slackWebhookUrl: null,
        genericWebhookUrl: null,
      },
      db,
    );
    createRule(
      U,
      {
        name: "Funding rounds",
        enabled: false,
        queryInput: '(raised OR "series a") lang:en -is:retweet',
        accounts: [],
        pollIntervalMs: 15_000,
        slackWebhookUrl: null,
        genericWebhookUrl: null,
      },
      db,
    );
    ensureMonitorPack(U, db);
    const rules = listRules(U, db);
    expect(rules.some((rule) => rule.name === "Fed Watch")).toBe(false);
    expect(rules.some((rule) => rule.name === "Mag 7 tape")).toBe(false);
    expect(rules.some((rule) => rule.name === "VC desks")).toBe(false);
    const fed = rules.find((rule) => rule.name === "Fed");
    expect(fed?.queryInput).toBe(customFed);
    expect(fed?.mode).toBe("markets");
    expect(rules.find((rule) => rule.name === "Funding Announcements")?.queryInput).toContain("series a");
    expect(rules.some((rule) => rule.name === "Macro" && rule.mode === "markets")).toBe(true);
    expect(rules.some((rule) => rule.name === "Tech Leaders" && rule.mode === "vc")).toBe(true);
    expect(rules.some((rule) => rule.name === "Watchlist" && rule.kind === "watchlist")).toBe(true);
  });

  it("does not poll an empty Watchlist placeholder", () => {
    const db = tempDb();
    ensureUserDesk(U, db);
    const watchlist = listRules(U, db).find((rule) => rule.kind === "watchlist");
    expect(watchlist).toBeTruthy();
    expect(listEnabledRules(db).some((rule) => rule.kind === "watchlist")).toBe(false);
  });
});

describe("default monitor queries", () => {
  it("keeps every default compiled query within the X budget", () => {
    for (const rule of DEFAULT_MONITORS) {
      const compiled = compileQuery({ query: rule.queryInput, accounts: rule.accounts });
      expect(compiled.length, rule.name).toBeLessThanOrEqual(X_MAX_QUERY_CHARS);
    }
  });
});
