import { describe, expect, it } from "vitest";
import { scoreDeskRelevance } from "./desk-relevance";

const vc = { mode: "venture" as const };

describe("venture relevance", () => {
  it("scores a priced round highly", () => {
    const s = scoreDeskRelevance("Anthropic raises $3.5bn Series E at a $60bn valuation, sources say.", vc);
    expect(s.substance).toBe(true);
    expect(s.score).toBeGreaterThanOrEqual(12);
  });

  it("scores a launch and a sourced acquisition", () => {
    expect(
      scoreDeskRelevance("Twenty-seven companies come out of stealth at Demo Day next week.", vc).substance,
    ).toBe(true);
    expect(
      scoreDeskRelevance("Stripe acquires the data startup in a $1.2bn deal, according to people familiar.", vc)
        .substance,
    ).toBe(true);
  });

  it("drops founder lifestyle and empty AI vibes", () => {
    expect(scoreDeskRelevance("Proud of this team. Office dogs won Friday.", vc).substance).toBe(false);
    expect(scoreDeskRelevance("AI is the future. Let's go.", vc).substance).toBe(false);
    expect(scoreDeskRelevance("AI is the future. Let's go.", vc).score).toBeLessThan(4);
  });

  it("does not treat FOMC prints as venture substance", () => {
    expect(scoreDeskRelevance("BREAKING: FOMC holds the funds rate", vc).substance).toBe(false);
  });
});
