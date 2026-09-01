import { describe, expect, it } from "vitest";
import { scoreDeskRelevance } from "./desk-relevance";

describe("desk relevance", () => {
  it("scores a cashtag earnings print highly", () => {
    const s = scoreDeskRelevance("$NVDA beats EPS; guidance raised 12%");
    expect(s.spam).toBe(false);
    expect(s.score).toBeGreaterThanOrEqual(12);
  });

  it("scores FOMC / CPI language", () => {
    expect(scoreDeskRelevance("BREAKING: FOMC holds the funds rate").score).toBeGreaterThanOrEqual(12);
    expect(scoreDeskRelevance("JUST IN: CPI 3.2% vs 3.1% expected").score).toBeGreaterThanOrEqual(12);
    expect(
      scoreDeskRelevance(
        "The Federal Open Market Committee decided to hold the federal funds rate unchanged.",
      ).score,
    ).toBeGreaterThanOrEqual(10);
  });

  it("treats lifestyle copy as empty tape", () => {
    expect(scoreDeskRelevance("Great dinner with friends last night.").score).toBe(0);
  });

  it("flags promo spam", () => {
    const s = scoreDeskRelevance("Join my signal group — guaranteed returns and a huge giveaway");
    expect(s.spam).toBe(true);
  });
});
