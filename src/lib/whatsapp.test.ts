import { describe, expect, it } from "vitest";
import { buildWhatsAppText, formatPairingCode, isWhatsAppSocketReady, normalizeWhatsAppNumber, toOwnChatJid, toWhatsAppJid } from "./whatsapp";

describe("WhatsApp JIDs", () => {
  it("strips punctuation and builds a PN JID with country code", () => {
    expect(normalizeWhatsAppNumber("+1 (555) 123-4567")).toBe("15551234567");
    expect(toWhatsAppJid("+1 (555) 123-4567")).toBe("15551234567@s.whatsapp.net");
  });

  it("passes through group and user JIDs", () => {
    expect(toWhatsAppJid("120363012345678901@g.us")).toBe("120363012345678901@g.us");
    expect(toWhatsAppJid("15551234567@s.whatsapp.net")).toBe("15551234567@s.whatsapp.net");
  });

  it("rejects a number without a country code", () => {
    expect(() => toWhatsAppJid("5551234")).toThrow(/country code/);
  });

  it("strips the companion device suffix for a self-chat JID", () => {
    expect(toOwnChatJid("19177334993:1@s.whatsapp.net")).toBe("19177334993@s.whatsapp.net");
    expect(toOwnChatJid("131121811562691:1@lid")).toBe("131121811562691@lid");
  });

  it("treats an open socket as ready even when registered is unset", () => {
    expect(isWhatsAppSocketReady({ user: { id: "19177334993:1@s.whatsapp.net" } })).toBe(true);
    expect(isWhatsAppSocketReady({ user: null })).toBe(false);
    expect(isWhatsAppSocketReady(null)).toBe(false);
  });
});

describe("pairing code display", () => {
  it("formats an 8-character code as two groups", () => {
    expect(formatPairingCode("1esc35x1")).toBe("1ESC-35X1");
    expect(formatPairingCode("TFWB6MWJ")).toBe("TFWB-6MWJ");
  });

  it("returns null for empty input", () => {
    expect(formatPairingCode("")).toBeNull();
    expect(formatPairingCode(null)).toBeNull();
  });
});

describe("WhatsApp alert copy", () => {
  it("includes the rule, handle, body, and permalink", () => {
    const text = buildWhatsAppText(
      { name: "Fed Watch" },
      {
        authorHandle: "reuters",
        authorName: "Reuters",
        text: "FOMC holds the funds rate.",
        permalink: "https://x.com/reuters/status/1",
      },
    );
    expect(text).toContain("*Signal1 · Fed Watch*");
    expect(text).toContain("@reuters (Reuters)");
    expect(text).toContain("FOMC holds the funds rate.");
    expect(text).toContain("https://x.com/reuters/status/1");
  });
});
