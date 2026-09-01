import { describe, expect, it } from "vitest";
import { escapeLike, likePattern, matchesSearchQuery, tokenizeSearch } from "./search";

describe("tokenizeSearch", () => {
  it("splits on whitespace, strips @, and caps token count", () => {
    expect(tokenizeSearch("  @Reuters  Powell ")).toEqual(["reuters", "powell"]);
  });
});

describe("matchesSearchQuery", () => {
  const match = {
    text: "Chair Powell says the FOMC is not on a preset course.",
    authorHandle: "reuters",
    authorName: "Reuters",
    ruleName: "Fed Watch",
    tweetId: "1988771",
  };

  it("matches handle, rule, and tweet text as AND tokens", () => {
    expect(matchesSearchQuery(match, "powell reuters")).toBe(true);
    expect(matchesSearchQuery(match, "fed watch")).toBe(true);
    expect(matchesSearchQuery(match, "1988771")).toBe(true);
    expect(matchesSearchQuery(match, "nvidia")).toBe(false);
  });

  it("treats an empty query as a match", () => {
    expect(matchesSearchQuery(match, "   ")).toBe(true);
  });
});

describe("likePattern", () => {
  it("escapes LIKE wildcards", () => {
    expect(escapeLike("100%_off")).toBe("100\\%\\_off");
    expect(likePattern("a%b")).toBe("%a\\%b%");
  });
});
