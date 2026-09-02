import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  addTickers,
  createRule,
  deleteRule,
  getWatchlist,
  listEnabledRules,
  openDatabase,
  replaceTickers,
  setWatchlistSettings,
} from "./db";
import { compileCashtagQuery } from "./tickers";

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

describe("watchlist cashtag rules", () => {
  it("compiles tickers into an extra enabled rule with $ cashtags", () => {
    const db = tempDb();
    const before = listEnabledRules(db).length;
    const watchlist = addTickers(U, "nvda, $aapl, tsla", db);
    expect(watchlist.tickers).toEqual(["AAPL", "NVDA", "TSLA"]);
    expect(watchlist.compiledQueries).toEqual([compileCashtagQuery(["AAPL", "NVDA", "TSLA"])]);
    expect(watchlist.compiledQueries[0]).toContain("$NVDA");
    expect(watchlist.compiledQueries[0]).not.toContain("nvda");
    const enabled = listEnabledRules(db);
    expect(enabled.length).toBe(before + 1);
    const rule = enabled.find((item) => item.kind === "watchlist");
    expect(rule?.name).toBe("Watchlist");
    expect(rule?.query).toBe(watchlist.compiledQueries[0]);
  });

  it("pauses screening without dropping the ticker list", () => {
    const db = tempDb();
    replaceTickers(U, ["SPY", "QQQ"], db);
    const paused = setWatchlistSettings(U, { enabled: false }, db);
    expect(paused.tickers).toEqual(["QQQ", "SPY"]);
    expect(paused.enabled).toBe(false);
    expect(listEnabledRules(db).some((rule) => rule.kind === "watchlist")).toBe(false);
    expect(getWatchlist(U, db).tickers).toEqual(["QQQ", "SPY"]);
  });

  it("blocks editing watchlist rules from the generic rules API", () => {
    const db = tempDb();
    addTickers(U, ["NVDA"], db);
    const rule = listEnabledRules(db).find((item) => item.kind === "watchlist");
    expect(rule).toBeTruthy();
    expect(() => deleteRule(rule!.id, U, db)).toThrow(/Watchlist/);
  });

  it("still allows ordinary custom rules", () => {
    const db = tempDb();
    const rule = createRule(
      U,
      {
        name: "Custom",
        enabled: true,
        queryInput: "FOMC",
        accounts: [],
        pollIntervalMs: 15_000,
        slackWebhookUrl: null,
        genericWebhookUrl: null,
      },
      db,
    );
    expect(rule.kind).toBe("custom");
    expect(deleteRule(rule.id, U, db)).toBe(true);
  });
});
