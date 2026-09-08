import { describe, expect, it } from "vitest";
import { planResearchFallback } from "./research";

describe("research fallback planner", () => {
  it("turns a ticker question into an X query", () => {
    const plan = planResearchFallback("$NVDA earnings");
    expect(plan.grok).toBe(false);
    expect(plan.queries[0]).toContain("lang:en");
    expect(plan.queries[0]).toContain("-is:retweet");
  });

  it("compiles a handle search", () => {
    const plan = planResearchFallback("@federalreserve");
    expect(plan.queries[0]).toContain("from:federalreserve");
  });

  it("does not turn a theme word into a cashtag", () => {
    const plan = planResearchFallback("AI");
    expect(plan.queries[0]).toMatch(/^AI /);
    expect(plan.queries[0]).not.toContain("$AI");
  });
});
