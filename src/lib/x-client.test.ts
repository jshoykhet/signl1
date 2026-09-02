import { afterEach, describe, expect, it, vi } from "vitest";
import { XRateLimiter } from "./x-client";

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
