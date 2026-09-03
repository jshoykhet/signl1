import { describe, expect, it } from "vitest";
import {
  isDigestDue,
  parseBoolMeta,
  parseDigestMinutes,
  parseMinLikes,
  parseSignalLevel,
  parseWhatsAppAlertMode,
  effectiveMinLikes,
  SIGNAL_LEVELS,
  cadenceLabel,
  cadenceMs,
  parseDeskMode,
} from "./desk-settings";

describe("desk settings parsers", () => {
  it("defaults signal level to standard", () => {
    expect(parseSignalLevel(null)).toBe("standard");
    expect(parseSignalLevel("high")).toBe("high");
    expect(SIGNAL_LEVELS.high.minLikes).toBeGreaterThan(SIGNAL_LEVELS.low.minLikes);
  });

  it("parses desk mode including Both", () => {
    expect(parseDeskMode(null)).toBe("markets");
    expect(parseDeskMode("markets")).toBe("markets");
    expect(parseDeskMode("venture")).toBe("venture");
    expect(parseDeskMode("vc")).toBe("venture");
    expect(parseDeskMode("both")).toBe("both");
  });

  it("parses boolean meta with a fallback", () => {
    expect(parseBoolMeta(null, true)).toBe(true);
    expect(parseBoolMeta("0", true)).toBe(false);
    expect(parseBoolMeta("1", false)).toBe(true);
  });

  it("accepts digest cadence", () => {
    expect(parseWhatsAppAlertMode("immediate")).toBe("digest");
    expect(parseWhatsAppAlertMode(null)).toBe("digest");
    expect(parseDigestMinutes("15")).toBe(15);
    expect(parseDigestMinutes("5")).toBe(5);
    expect(parseDigestMinutes("10")).toBe(10);
    expect(parseDigestMinutes("45")).toBe(45);
    expect(parseDigestMinutes("180")).toBe(180);
    expect(parseDigestMinutes("300")).toBe(300);
    expect(parseDigestMinutes("600")).toBe(600);
    expect(parseDigestMinutes("9")).toBe(10);
    expect(parseDigestMinutes("7")).toBe(5);
    expect(parseDigestMinutes("50")).toBe(45);
    expect(parseDigestMinutes(null)).toBe(15);
    expect(parseDigestMinutes(120)).toBe(120);
  });

  it("labels inbox cadence windows", () => {
    expect(cadenceLabel(10)).toBe("Every 10 minutes");
    expect(cadenceLabel(60)).toBe("Every 1 hour");
    expect(cadenceLabel(600)).toBe("Every 10 hours");
    expect(cadenceMs(15)).toBe(15 * 60_000);
  });

  it("parses a custom min-likes override", () => {
    expect(parseMinLikes(null)).toBeNull();
    expect(parseMinLikes("")).toBeNull();
    expect(parseMinLikes("0")).toBe(0);
    expect(parseMinLikes(50)).toBe(50);
    expect(effectiveMinLikes({ signalLevel: "standard", minLikes: 5 })).toBe(5);
    expect(effectiveMinLikes({ signalLevel: "low", minLikes: 25 })).toBe(25);
  });

  it("treats a missing last digest as due", () => {
    expect(isDigestDue(null, 60, Date.parse("2026-09-01T16:00:00.000Z"))).toBe(true);
    expect(isDigestDue("2026-09-01T15:50:00.000Z", 60, Date.parse("2026-09-01T16:00:00.000Z"))).toBe(false);
    expect(isDigestDue("2026-09-01T14:00:00.000Z", 60, Date.parse("2026-09-01T16:00:00.000Z"))).toBe(true);
  });
});
