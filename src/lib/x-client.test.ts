import { afterEach, describe, expect, it, vi } from "vitest";
import { describeFetchError, XRateLimiter } from "./x-client";

describe("describeFetchError", () => {
  it("includes the connect-timeout cause that Node hides behind fetch failed", () => {
    const err = new TypeError("fetch failed");
    (err as Error & { cause: Error }).cause = new Error(
      "Connect Timeout Error (attempted addresses: 172.66.0.227:443, timeout: 10000ms)",
    );
    expect(describeFetchError(err)).toContain("Connect Timeout Error");
    expect(describeFetchError(err)).toContain("fetch failed");
  });

  it("returns a plain error message when there is no cause", () => {
    expect(describeFetchError(new Error("X API 401"))).toBe("X API 401");
  });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("XRateLimiter.waitForSlot", () => {
  it("throws immediately when remaining is 0 and reset is hours away", async () => {
    vi.useFakeTimers();
    const limiter = new XRateLimiter();
    limiter.remaining = 0;
    limiter.resetAt = Date.now() + 4 * 60 * 60 * 1000;
    const pending = limiter.waitForSlot();
    await expect(pending).rejects.toThrow(/rate limited/i);
  });

  it("still uses the last remaining request instead of sleeping until reset", async () => {
    vi.useFakeTimers();
    const limiter = new XRateLimiter();
    limiter.remaining = 1;
    limiter.resetAt = Date.now() + 4 * 60 * 60 * 1000;
    const pending = limiter.waitForSlot();
    await vi.advanceTimersByTimeAsync(0);
    await expect(pending).resolves.toBeUndefined();
  });

  it("allows a probe after the reset timestamp has passed", async () => {
    vi.useFakeTimers();
    const limiter = new XRateLimiter();
    const start = Date.now();
    limiter.remaining = 0;
    limiter.resetAt = start + 1_000;
    await expect(limiter.waitForSlot()).rejects.toThrow(/rate limited/i);
    await vi.advanceTimersByTimeAsync(1_001);
    await expect(limiter.waitForSlot()).resolves.toBeUndefined();
    expect(limiter.remaining).toBeNull();
  });
});
