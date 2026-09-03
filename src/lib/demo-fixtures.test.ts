import { describe, expect, it } from "vitest";
import { compileQuery, matchesQuery } from "./query";
import { compileCashtagQuery } from "./tickers";
import { DEMO_FIXTURES, VENTURE_DEMO_FIXTURES, fixtureToTweet } from "./demo-fixtures";
import { passesSignalFilter } from "./signal-filter";
import { MARKETS_SEED_RULES, VENTURE_SEED_RULES } from "./seed-rules";

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

  it("covers each seeded Markets monitor with at least two matches", () => {
    for (const rule of MARKETS_SEED_RULES) {
      const query = compileQuery({ query: rule.queryInput, accounts: rule.accounts });
      const hits = DEMO_FIXTURES.filter((fixture) => matchesQuery(fixture, query));
      expect(hits.length, `expected hits for ${rule.name}: ${query}`).toBeGreaterThanOrEqual(2);
    }
  });

  it("covers a Mag 7 cashtag screen with at least two matches", () => {
    const query = compileCashtagQuery(["NVDA", "AAPL", "MSFT", "TSLA", "SPY", "QQQ"]);
    const hits = DEMO_FIXTURES.filter((fixture) => matchesQuery(fixture, query));
    expect(hits.length).toBeGreaterThanOrEqual(2);
  });

  it("assigns high-signal desk metrics so fixtures pass the quality filter", () => {
    for (const fixture of DEMO_FIXTURES) {
      const tweet = fixtureToTweet(fixture, fixture.id, fixture.createdAt);
      expect(passesSignalFilter(tweet).pass, fixture.authorHandle).toBe(true);
      expect(tweet.followersCount).toBeGreaterThanOrEqual(50);
      expect(tweet.likeCount).toBeGreaterThanOrEqual(5);
    }
  });
});

describe("venture demo fixtures", () => {
  it("covers each VC seed monitor with at least two matches", () => {
    for (const rule of VENTURE_SEED_RULES) {
      const query = compileQuery({ query: rule.queryInput, accounts: rule.accounts });
      const hits = VENTURE_DEMO_FIXTURES.filter((fixture) => matchesQuery(fixture, query));
      expect(hits.length, `expected hits for ${rule.name}: ${query}`).toBeGreaterThanOrEqual(2);
    }
  });

  it("passes the venture quality filter", () => {
    for (const fixture of VENTURE_DEMO_FIXTURES) {
      const tweet = fixtureToTweet(fixture, fixture.id, fixture.createdAt);
      expect(passesSignalFilter(tweet, Date.now(), { deskMode: "venture" }).pass, fixture.authorHandle).toBe(true);
    }
  });

  it("in both mode keeps markets and venture fixtures", () => {
    for (const fixture of [...DEMO_FIXTURES, ...VENTURE_DEMO_FIXTURES]) {
      const tweet = fixtureToTweet(fixture, fixture.id, fixture.createdAt);
      expect(passesSignalFilter(tweet, Date.now(), { deskMode: "both" }).pass, fixture.authorHandle).toBe(true);
    }
  });
});
