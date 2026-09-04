import { describe, expect, it } from "vitest";
import { ruleFitsFocus, sqlFocusMode } from "./feed-scope";
import type { Rule } from "./types";

function rule(partial: Partial<Pick<Rule, "mode" | "enabled" | "query">>): Pick<Rule, "mode" | "enabled" | "query"> {
  return {
    mode: partial.mode ?? "markets",
    enabled: partial.enabled ?? true,
    query: partial.query ?? "from:deitaone lang:en -is:retweet",
  };
}

describe("ruleFitsFocus", () => {
  it("lets Markets search Key Leaders, Watchlist, and Fed — not Tech Leaders", () => {
    expect(ruleFitsFocus(rule({ mode: "markets" }), "markets")).toBe(true);
    expect(ruleFitsFocus(rule({ mode: "vc", query: "from:sama lang:en -is:retweet" }), "markets")).toBe(false);
  });

  it("lets Venture search Tech Leaders and funding — not Fed or Watchlist", () => {
    expect(ruleFitsFocus(rule({ mode: "vc" }), "venture")).toBe(true);
    expect(ruleFitsFocus(rule({ mode: "markets" }), "venture")).toBe(false);
  });

  it("lets Both search every enabled monitor", () => {
    expect(ruleFitsFocus(rule({ mode: "markets" }), "both")).toBe(true);
    expect(ruleFitsFocus(rule({ mode: "vc" }), "both")).toBe(true);
  });

  it("drops paused or empty queries in every Focus", () => {
    expect(ruleFitsFocus(rule({ enabled: false }), "both")).toBe(false);
    expect(ruleFitsFocus(rule({ query: "  " }), "markets")).toBe(false);
  });
});

describe("sqlFocusMode", () => {
  it("filters Markets and Venture at the SQL layer and leaves Both unfiltered", () => {
    expect(sqlFocusMode("markets")).toEqual({ sql: " AND r.mode = ?", params: ["markets"] });
    expect(sqlFocusMode("venture")).toEqual({ sql: " AND r.mode = ?", params: ["vc"] });
    expect(sqlFocusMode("both")).toEqual({ sql: "", params: [] });
  });
});
