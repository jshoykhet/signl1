import { afterEach, describe, expect, it } from "vitest";
import { siteUrl } from "./site";

const KEYS = ["AUTH_URL", "DOMAIN"] as const;
const prev: Partial<Record<(typeof KEYS)[number], string | undefined>> = {};

afterEach(() => {
  for (const key of KEYS) {
    if (prev[key] === undefined) delete process.env[key];
    else process.env[key] = prev[key];
  }
});

function snapshot() {
  for (const key of KEYS) prev[key] = process.env[key];
}

describe("siteUrl", () => {
  it("prefers a public AUTH_URL", () => {
    snapshot();
    process.env.AUTH_URL = "https://signl1.xyz/";
    expect(siteUrl().href).toBe("https://signl1.xyz/");
  });

  it("ignores localhost AUTH_URL so share cards stay on the public host", () => {
    snapshot();
    process.env.AUTH_URL = "http://127.0.0.1:3847";
    delete process.env.DOMAIN;
    expect(siteUrl().host).toBe("signl1.xyz");
  });
});
