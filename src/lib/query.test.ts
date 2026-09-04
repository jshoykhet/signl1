import { describe, expect, it } from "vitest";
import { X_MAX_QUERY_CHARS, WATCHLIST_QUERY_BUDGET } from "./config";
import {
  chunkHandlesForFromQuery,
  compileFromAccounts,
  compileKeyLeadersQuery,
  compileQuery,
  isWatchedAuthor,
  matchesQuery,
  normalizeAccounts,
} from "./query";

describe("normalizeAccounts", () => {
  it("strips @, lowercases, de-dupes, and drops invalid handles", () => {
    expect(normalizeAccounts(["@NVIDIA", "nvidia", " Apple ", "not a handle!!", ""])).toEqual([
      "nvidia",
      "apple",
    ]);
  });
});

describe("isWatchedAuthor", () => {
  it("matches a handle on the rule account list, ignoring @ and case", () => {
    expect(isWatchedAuthor(["pmarca", "Sama"], "sama")).toBe(true);
    expect(isWatchedAuthor(["pmarca", "sama"], "@Sama")).toBe(true);
    expect(isWatchedAuthor(["pmarca"], "elonmusk")).toBe(false);
    expect(isWatchedAuthor([], "sama")).toBe(false);
  });
});

describe("compileQuery", () => {
  it("compiles a single account to from:user", () => {
    expect(compileFromAccounts(["federalreserve"])).toBe("from:federalreserve");
  });

  it("compiles multiple accounts with OR grouping", () => {
    expect(compileQuery({ accounts: ["nvidia", "apple"] })).toBe("(from:nvidia OR from:apple)");
  });

  it("combines accounts helper with the free-text query", () => {
    expect(compileQuery({ query: "earnings -is:retweet", accounts: ["nvidia", "msft"] })).toBe(
      "(from:nvidia OR from:msft) earnings -is:retweet",
    );
  });

  it("returns only the query when no accounts are set", () => {
    expect(compileQuery({ query: 'FOMC lang:en -is:retweet', accounts: [] })).toBe(
      "FOMC lang:en -is:retweet",
    );
  });
});

describe("matchesQuery", () => {
  const powell = {
    text: "Chair Powell says the FOMC will adjust interest rate policy if data warrant.",
    authorHandle: "reuters",
    lang: "en",
    isRetweet: false,
  };

  it("matches OR groups, phrases, lang, and -is:retweet", () => {
    expect(
      matchesQuery(powell, '(FOMC OR "interest rate" OR Powell) lang:en -is:retweet'),
    ).toBe(true);
  });

  it("rejects retweets when -is:retweet is present", () => {
    expect(matchesQuery({ ...powell, isRetweet: true }, "Powell -is:retweet")).toBe(false);
  });

  it("matches from: operators against the author handle", () => {
    expect(
      matchesQuery(
        { text: "data center GPU demand beat", authorHandle: "nvidia", lang: "en" },
        "(from:nvidia OR from:apple) GPU",
      ),
    ).toBe(true);
    expect(
      matchesQuery(
        { text: "data center GPU demand beat", authorHandle: "amd", lang: "en" },
        "(from:nvidia OR from:apple) GPU",
      ),
    ).toBe(false);
  });
});

describe("chunkHandlesForFromQuery", () => {
  it("packs from: handles so each compiled Key Leaders query stays under the X budget", () => {
    const handles = Array.from({ length: 80 }, (_, i) => `desk${String(i).padStart(2, "0")}`);
    const chunks = chunkHandlesForFromQuery(handles, WATCHLIST_QUERY_BUDGET);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.flat()).toEqual(handles);
    for (const chunk of chunks) {
      const compiled = compileKeyLeadersQuery(chunk);
      expect(compiled.length).toBeLessThanOrEqual(WATCHLIST_QUERY_BUDGET);
      expect(compiled.length).toBeLessThanOrEqual(X_MAX_QUERY_CHARS);
      expect(compiled).toContain("from:");
      expect(compiled).toContain("lang:en");
      expect(compiled).toContain("-is:retweet");
    }
  });

  it("keeps a small list as a single from: query", () => {
    expect(chunkHandlesForFromQuery(["DeItaone", "FirstSquawk"], WATCHLIST_QUERY_BUDGET)).toEqual([
      ["deitaone", "firstsquawk"],
    ]);
    expect(compileKeyLeadersQuery(["deitaone", "firstsquawk"])).toBe(
      "(from:deitaone OR from:firstsquawk) lang:en -is:retweet",
    );
  });
});
