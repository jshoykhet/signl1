import { describe, expect, it } from "vitest";
import { compileFromAccounts, compileQuery, matchesQuery, normalizeAccounts } from "./query";

describe("normalizeAccounts", () => {
  it("strips @, lowercases, de-dupes, and drops invalid handles", () => {
    expect(normalizeAccounts(["@NVIDIA", "nvidia", " Apple ", "not a handle!!", ""])).toEqual([
      "nvidia",
      "apple",
    ]);
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
