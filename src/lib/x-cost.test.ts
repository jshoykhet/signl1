import { describe, expect, it } from "vitest";
import { estimateReadUsd, formatUsd, searchLookbackMs, X_POST_READ_USD, X_USER_READ_USD } from "./x-cost";

describe("X read cost", () => {
  it("prices posts and expanded authors separately", () => {
    expect(estimateReadUsd(100, 80)).toBe(100 * X_POST_READ_USD + 80 * X_USER_READ_USD);
    expect(formatUsd(1.3)).toBe("$1.30");
    expect(estimateReadUsd(0, 0)).toBe(0);
  });

  it("looks back two cadence windows with a 15-minute floor", () => {
    expect(searchLookbackMs(5)).toBe(15 * 60_000);
    expect(searchLookbackMs(15)).toBe(30 * 60_000);
    expect(searchLookbackMs(60)).toBe(2 * 60 * 60_000);
    expect(searchLookbackMs(600)).toBe(20 * 60 * 60_000);
  });
});
