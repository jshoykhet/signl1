import { describe, expect, it } from "vitest";
import { buildHandleListItems, seedAccountsForMonitor } from "./handle-list";
import { TECH_LEADERS_ACCOUNTS } from "./seed-rules";

describe("seedAccountsForMonitor", () => {
  it("returns the Tech Leaders seed list", () => {
    expect(seedAccountsForMonitor("Tech Leaders")).toEqual([...TECH_LEADERS_ACCOUNTS]);
  });

  it("returns empty for keyword monitors and unknown names", () => {
    expect(seedAccountsForMonitor("Fed")).toEqual([]);
    expect(seedAccountsForMonitor("Custom")).toEqual([]);
  });
});

describe("buildHandleListItems", () => {
  it("keeps removed seed handles as restorable rows and marks extras as added", () => {
    const items = buildHandleListItems(["pmarca", "sama"], ["sama", "karpathy"], { sama: 2_800_000 });
    expect(items).toEqual([
      {
        handle: "karpathy",
        source: "added",
        active: true,
        followers: null,
        profileUrl: "https://x.com/karpathy",
      },
      {
        handle: "pmarca",
        source: "seed",
        active: false,
        followers: null,
        profileUrl: "https://x.com/pmarca",
      },
      {
        handle: "sama",
        source: "seed",
        active: true,
        followers: 2_800_000,
        profileUrl: "https://x.com/sama",
      },
    ]);
  });
});
