import { describe, expect, it } from "vitest";
import { buildWhatsAppDigest } from "./whatsapp-digest";

describe("WhatsApp digest copy", () => {
  it("summarizes matches with a window header", () => {
    const text = buildWhatsAppDigest(
      [
        {
          rule: { name: "Fed Watch" },
          tweet: {
            authorHandle: "reuters",
            authorName: "Reuters",
            text: "FOMC holds.",
            permalink: "https://x.com/reuters/status/1",
          },
        },
      ],
      60,
    );
    expect(text).toContain("*Signal1 · digest* (1 match, last 1h)");
    expect(text).toContain("*Signal1 · Fed Watch*");
    expect(text).toContain("@reuters");
  });

  it("caps long batches", () => {
    const items = Array.from({ length: 14 }, (_, i) => ({
      rule: { name: "Tape" },
      tweet: {
        authorHandle: "desk",
        authorName: "",
        text: `Item ${i}`,
        permalink: `https://x.com/desk/status/${i}`,
      },
    }));
    const text = buildWhatsAppDigest(items, 15);
    expect(text).toContain("14 matches, last 15m");
    expect(text).toContain("+2 more in the inbox");
  });
});
