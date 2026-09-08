import { afterEach, describe, expect, it } from "vitest";
import { DEFAULT_GOOGLE_CLIENT_ID, googleClientId, isGoogleAuthConfigured } from "./google-auth";

const KEYS = ["GOOGLE_CLIENT_ID", "AUTH_GOOGLE_CLIENT_ID"] as const;
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

describe("Google client ID", () => {
  it("falls back to the Signl1 web client", () => {
    snapshot();
    for (const key of KEYS) delete process.env[key];
    expect(googleClientId()).toBe(DEFAULT_GOOGLE_CLIENT_ID);
    expect(isGoogleAuthConfigured()).toBe(true);
  });

  it("lets GOOGLE_CLIENT_ID override the default", () => {
    snapshot();
    process.env.GOOGLE_CLIENT_ID = "  other-client.apps.googleusercontent.com  ";
    expect(googleClientId()).toBe("other-client.apps.googleusercontent.com");
  });
});
