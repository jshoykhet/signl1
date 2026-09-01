import { describe, expect, it } from "vitest";
import { buildWhatsAppText, normalizeWhatsAppNumber, toWhatsAppJid } from "./whatsapp";

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
