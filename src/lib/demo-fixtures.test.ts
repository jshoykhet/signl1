import { describe, expect, it } from "vitest";
import { compileQuery } from "./query";
import { DEMO_FIXTURES } from "./demo-fixtures";
import { matchesQuery } from "./query";

const SEED_QUERIES = [
  compileQuery({
    query: '(FOMC OR "interest rate" OR "fed funds" OR Powell) lang:en -is:retweet',
    accounts: [],
  }),
  compileQuery({
    query: "(earnings OR guidance OR GPU OR AI) lang:en -is:retweet",
    accounts: ["nvidia", "apple", "meta", "microsoft"],
  }),
  compileQuery({
    query: '(OPEC OR "crude oil" OR WTI OR Brent) lang:en -is:retweet',
    accounts: [],
  }),
];

describe("demo fixtures", () => {
  it("ships a handful of finance/markets tweets", () => {
    expect(DEMO_FIXTURES.length).toBeGreaterThanOrEqual(8);
    for (const fixture of DEMO_FIXTURES) {
      expect(fixture.id).toBeTruthy();
      expect(fixture.authorHandle).toMatch(/^[A-Za-z0-9_]+$/);
      expect(fixture.text.length).toBeGreaterThan(40);
      expect(fixture.isRetweet).toBe(false);
      expect(fixture.lang).toBe("en");
    }
  });

  it("covers each seeded sample rule with at least two matches", () => {
    for (const query of SEED_QUERIES) {
      const hits = DEMO_FIXTURES.filter((fixture) => matchesQuery(fixture, query));
      expect(hits.length, `expected hits for ${query}`).toBeGreaterThanOrEqual(2);
    }
  });
});
