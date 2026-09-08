import { describe, expect, it } from "vitest";
import { grokModel, isGrokConfigured, parseJsonObject, xaiApiKey } from "./grok";

describe("Grok JSON parse", () => {
  it("extracts an object from fenced model output", () => {
    const parsed = parseJsonObject('Sure.\n```json\n{"queries":["$NVDA lang:en"],"lookbackHours":12}\n```');
    expect(parsed.lookbackHours).toBe(12);
    expect(parsed.queries).toEqual(["$NVDA lang:en"]);
  });
});

describe("Grok config", () => {
  it("defaults to grok-4-fast", () => {
    const prev = process.env["GROK_MODEL"];
    const prevX = process.env["XAI_MODEL"];
    try {
      delete process.env["GROK_MODEL"];
      delete process.env["XAI_MODEL"];
      expect(grokModel()).toBe("grok-4-fast");
    } finally {
      if (prev !== undefined) process.env["GROK_MODEL"] = prev;
      else delete process.env["GROK_MODEL"];
      if (prevX !== undefined) process.env["XAI_MODEL"] = prevX;
      else delete process.env["XAI_MODEL"];
    }
  });

  it("reads XAI_API_KEY without inlining", () => {
    const prevX = process.env["XAI_API_KEY"];
    const prevG = process.env["GROK_API_KEY"];
    try {
      delete process.env["XAI_API_KEY"];
      delete process.env["GROK_API_KEY"];
      expect(xaiApiKey()).toBeNull();
      expect(isGrokConfigured()).toBe(false);
      process.env["XAI_API_KEY"] = "xai-test-key";
      expect(xaiApiKey()).toBe("xai-test-key");
      expect(isGrokConfigured()).toBe(true);
    } finally {
      if (prevX !== undefined) process.env["XAI_API_KEY"] = prevX;
      else delete process.env["XAI_API_KEY"];
      if (prevG !== undefined) process.env["GROK_API_KEY"] = prevG;
      else delete process.env["GROK_API_KEY"];
    }
  });
});
