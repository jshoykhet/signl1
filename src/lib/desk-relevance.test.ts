import { describe, expect, it } from "vitest";
import { hasAnalyticalOrNewsValue, scoreDeskRelevance } from "./desk-relevance";

describe("desk relevance", () => {
  it("scores a cashtag earnings print highly", () => {
    const s = scoreDeskRelevance("$NVDA beats EPS; guidance raised 12%");
    expect(s.spam).toBe(false);
    expect(s.substance).toBe(true);
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
    expect(scoreDeskRelevance("Great dinner with friends last night.").substance).toBe(false);
  });

  it("flags promo spam", () => {
    const s = scoreDeskRelevance("Join my signal group — guaranteed returns and a huge giveaway");
    expect(s.spam).toBe(true);
  });

  it("drops cashtag-only posts with no news or analysis", () => {
    const s = scoreDeskRelevance("$AAPL $MSFT $NVDA looking clean into the close");
    expect(s.substance).toBe(false);
    expect(s.score).toBeLessThan(12);
    expect(hasAnalyticalOrNewsValue("$TSLA bouncing, who is buying")).toBe(false);
  });

  it("drops breaking/just-in with no payload", () => {
    expect(hasAnalyticalOrNewsValue("JUST IN: watching")).toBe(false);
    expect(hasAnalyticalOrNewsValue("BREAKING: wow")).toBe(false);
    expect(scoreDeskRelevance("JUST IN: watching").score).toBeLessThan(4);
  });

  it("keeps sourced news and analytical takes without a cashtag", () => {
    expect(
      hasAnalyticalOrNewsValue(
        "Powell says the takeaway from this print is that the 10-year is pricing in two rate cuts, not a pivot.",
      ),
    ).toBe(true);
    expect(
      hasAnalyticalOrNewsValue(
        "Sources say the company will announce a $4bn secondary offering after the close.",
      ),
    ).toBe(true);
    expect(scoreDeskRelevance("CPI 3.2% vs 3.1% expected; hotter than the median estimate.").substance).toBe(
      true,
    );
  });

  it("keeps positioning into a known print when a ticker is tagged", () => {
    expect(hasAnalyticalOrNewsValue("$COIN volume spike into the print")).toBe(true);
  });

  it("drops reply dunks that add no facts", () => {
    const s = scoreDeskRelevance("this you? L take", { isReply: true });
    expect(s.substance).toBe(false);
    expect(s.score).toBe(0);
  });

  it("does not treat fed/inflation name-drops as news", () => {
    expect(hasAnalyticalOrNewsValue("man inflation is crazy out here")).toBe(false);
    expect(hasAnalyticalOrNewsValue("the fed really hates us")).toBe(false);
  });

  it("in both mode keeps a markets print and a venture round", () => {
    expect(
      scoreDeskRelevance("BREAKING: FOMC holds the funds rate", { mode: "both" }).substance,
    ).toBe(true);
    expect(
      scoreDeskRelevance("Anthropic raises $3.5bn Series E at a $60bn valuation, sources say.", {
        mode: "both",
      }).substance,
    ).toBe(true);
    expect(scoreDeskRelevance("Great dinner with friends last night.", { mode: "both" }).substance).toBe(
      false,
    );
  });
});
