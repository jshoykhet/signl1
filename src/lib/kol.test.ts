import { describe, expect, it } from "vitest";
import { DEFAULT_KOL_HANDLES, isKolHandle, loadKolHandleSet, normalizeHandle } from "./kol";

describe("KOL list", () => {
  it("seeds wires, squawk, All-In, and official desks", () => {
    const set = loadKolHandleSet({});
    for (const handle of ["zerohedge", "elonmusk", "chamath", "DeItaone", "deltaone", "federalreserve", "reuters", "WSJ", "Bloomberg"]) {
      expect(set.has(normalizeHandle(handle)), handle).toBe(true);
    }
    expect(set.size).toBeGreaterThanOrEqual(80);
    expect(new Set(DEFAULT_KOL_HANDLES.map(normalizeHandle)).size).toBe(set.size);
  });

  it("appends KOL_HANDLES by default", () => {
    const set = loadKolHandleSet({ KOL_HANDLES: "@MyDesk, extra_tape" });
    expect(set.has("mydesk")).toBe(true);
    expect(set.has("extra_tape")).toBe(true);
    expect(set.has("zerohedge")).toBe(true);
  });

  it("replace mode uses only the env list", () => {
    const set = loadKolHandleSet({
      KOL_HANDLES: "onlyme",
      KOL_HANDLES_MODE: "replace",
    });
    expect([...set]).toEqual(["onlyme"]);
  });

  it("matches handles case-insensitively", () => {
    expect(isKolHandle("ZeroHedge", { KOL_HANDLES: "", KOL_HANDLES_MODE: "append" })).toBe(true);
  });
});
