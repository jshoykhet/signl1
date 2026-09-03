import { describe, expect, it } from "vitest";
import { DEFAULT_KOL_HANDLES, isKolHandle, kolProfileUrl, listKolRows, loadKolHandleSet, normalizeHandle, seedKolHandles } from "./kol";

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

  it("lets the user add and remove handles from the seed", () => {
    const trimmed = loadKolHandleSet({ removed: ["zerohedge"], added: ["MyDesk"] });
    expect(trimmed.has("zerohedge")).toBe(false);
    expect(trimmed.has("mydesk")).toBe(true);
    expect(trimmed.has("elonmusk")).toBe(true);
  });

  it("matches handles case-insensitively", () => {
    expect(isKolHandle("ZeroHedge", { KOL_HANDLES: "", KOL_HANDLES_MODE: "append" })).toBe(true);
    expect(isKolHandle("DeItaone")).toBe(true);
    expect(isKolHandle("not_a_kol")).toBe(false);
    expect(isKolHandle(null)).toBe(false);
  });

  it("exposes removed seed handles as inactive table rows", () => {
    const rows = listKolRows({ added: ["MyDesk"], removed: ["zerohedge"] });
    expect(rows.find((row) => row.handle === "mydesk")).toEqual({
      handle: "mydesk",
      source: "added",
      active: true,
    });
    expect(rows.find((row) => row.handle === "zerohedge")).toEqual({
      handle: "zerohedge",
      source: "seed",
      active: false,
    });
    expect(rows.find((row) => row.handle === "elonmusk")?.active).toBe(true);
  });

  it("builds X profile URLs", () => {
    expect(kolProfileUrl("@WSJ")).toBe("https://x.com/wsj");
    expect(kolProfileUrl("DeItaone")).toBe("https://x.com/deitaone");
  });

  it("seeds venture wires, funds, and reporters in venture mode", () => {
    const set = loadKolHandleSet({ deskMode: "venture" });
    for (const handle of ["TechCrunch", "a16z", "sequoia", "ycombinator", "EricNewcomer", "pmarca", "garrytan"]) {
      expect(set.has(normalizeHandle(handle)), handle).toBe(true);
    }
    expect(set.has("deitaone")).toBe(false);
    expect(set.size).toBe(new Set(seedKolHandles("venture").map(normalizeHandle)).size);
    expect(set.size).toBe(100);
  });

  it("keeps markets seeds as the default", () => {
    expect(seedKolHandles("markets")).toEqual(DEFAULT_KOL_HANDLES);
    expect(loadKolHandleSet({ deskMode: "markets" }).has("deitaone")).toBe(true);
    expect(loadKolHandleSet({ deskMode: "venture" }).has("techcrunch")).toBe(true);
  });

  it("unions markets and venture seeds in both mode", () => {
    const set = loadKolHandleSet({ deskMode: "both" });
    expect(set.has("deitaone")).toBe(true);
    expect(set.has("techcrunch")).toBe(true);
    expect(set.has("a16z")).toBe(true);
    expect(set.size).toBe(new Set(seedKolHandles("both").map(normalizeHandle)).size);
    expect(set.size).toBeGreaterThan(seedKolHandles("markets").length);
    expect(set.size).toBeGreaterThan(seedKolHandles("venture").length);
  });
});
