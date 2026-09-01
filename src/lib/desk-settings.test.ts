import { describe, expect, it } from "vitest";
import {
  isDigestDue,
  parseBoolMeta,
  parseDigestMinutes,
  parseSignalLevel,
  parseWhatsAppAlertMode,
  SIGNAL_LEVELS,
} from "./desk-settings";

describe("desk settings parsers", () => {
  it("defaults signal level to standard", () => {
    expect(parseSignalLevel(null)).toBe("standard");
    expect(parseSignalLevel("high")).toBe("high");
    expect(SIGNAL_LEVELS.high.minLikes).toBeGreaterThan(SIGNAL_LEVELS.low.minLikes);
  });

  it("parses boolean meta with a fallback", () => {
    expect(parseBoolMeta(null, true)).toBe(true);
    expect(parseBoolMeta("0", true)).toBe(false);
    expect(parseBoolMeta("1", false)).toBe(true);
  });

  it("accepts digest cadence", () => {
    expect(parseWhatsAppAlertMode("digest")).toBe("digest");
    expect(parseWhatsAppAlertMode(null)).toBe("immediate");
    expect(parseDigestMinutes("15")).toBe(15);
    expect(parseDigestMinutes("9")).toBe(60);
  });

  it("treats a missing last digest as due", () => {
    expect(isDigestDue(null, 60, Date.parse("2026-09-01T16:00:00.000Z"))).toBe(true);
    expect(isDigestDue("2026-09-01T15:50:00.000Z", 60, Date.parse("2026-09-01T16:00:00.000Z"))).toBe(false);
    expect(isDigestDue("2026-09-01T14:00:00.000Z", 60, Date.parse("2026-09-01T16:00:00.000Z"))).toBe(true);
  });
});
