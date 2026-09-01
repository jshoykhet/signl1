import { afterEach, describe, expect, it } from "vitest";
import { isBlockedHandle, isEnvBlockedHandle, listBlockedHandles, loadBlockedHandleSet } from "./blocked";

describe("blocked handle list", () => {
  afterEach(() => {
    delete process.env.BLOCKED_HANDLES;
  });

  it("starts empty", () => {
    expect(listBlockedHandles({})).toEqual([]);
    expect(isBlockedHandle("zerohedge", {})).toBe(false);
  });

  it("unions BLOCKED_HANDLES with added, minus removed", () => {
    const set = loadBlockedHandleSet({
      BLOCKED_HANDLES: "@SpamDesk, noise_bot",
      added: ["MyBlock"],
      removed: ["noise_bot"],
    });
    expect(set.has("spamdesk")).toBe(true);
    expect(set.has("myblock")).toBe(true);
    expect(set.has("noise_bot")).toBe(false);
    expect(isEnvBlockedHandle("SpamDesk", { BLOCKED_HANDLES: "@SpamDesk, noise_bot" })).toBe(true);
  });
});
