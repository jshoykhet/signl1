import { afterEach, describe, expect, it } from "vitest";
import { getFirebasePublicConfig, isFirebaseAuthConfigured } from "./firebase-config";

const KEYS = [
  "FIREBASE_API_KEY",
  "FIREBASE_AUTH_DOMAIN",
  "FIREBASE_PROJECT_ID",
  "FIREBASE_APP_ID",
  "FIREBASE_MESSAGING_SENDER_ID",
  "FIREBASE_AUTH_TESTING",
] as const;

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

describe("Firebase public config", () => {
  it("is missing until the web config is complete", () => {
    snapshot();
    for (const key of KEYS) delete process.env[key];
    expect(isFirebaseAuthConfigured()).toBe(false);
    expect(getFirebasePublicConfig()).toBeNull();
  });

  it("reads the web config from env", () => {
    snapshot();
    process.env.FIREBASE_API_KEY = "test-key";
    process.env.FIREBASE_AUTH_DOMAIN = "signl1.firebaseapp.com";
    process.env.FIREBASE_PROJECT_ID = "signl1";
    process.env.FIREBASE_APP_ID = "1:1:web:abc";
    process.env.FIREBASE_AUTH_TESTING = "1";
    expect(getFirebasePublicConfig()).toEqual({
      apiKey: "test-key",
      authDomain: "signl1.firebaseapp.com",
      projectId: "signl1",
      appId: "1:1:web:abc",
      messagingSenderId: undefined,
      testing: true,
    });
  });
});
