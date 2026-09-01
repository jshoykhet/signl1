import { describe, expect, it } from "vitest";
import { buildWhatsAppDigest, rankDigestItems } from "./whatsapp-digest";

function item(id: string, extras: { score?: number; likes?: number; kol?: boolean; text?: string } = {}) {
  return {
    rule: { name: "Tape" },
    tweet: {
      id,
      authorHandle: "desk",
      authorName: "",
      text: extras.text ?? `Item ${id}`,
      permalink: `https://x.com/desk/status/${id}`,
    },
    score: extras.score,
    likes: extras.likes,
    kol: extras.kol,
  };
}

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

  it("keeps the top 20 most important tweets", () => {
    const items = Array.from({ length: 25 }, (_, i) => item(String(i), { score: i, likes: i }));
    const text = buildWhatsAppDigest(items, 15);
    expect(text).toContain("top 20 of 25, last 15m");
    expect(text).toContain("+5 more in the inbox");
    expect(text).toContain("Item 24");
    expect(text).not.toContain("Item 4");
  });

  it("ranks by score, then likes, then KOL", () => {
    const ranked = rankDigestItems([
      item("a", { score: 10, likes: 100 }),
      item("b", { score: 40, likes: 1 }),
      item("c", { score: 40, likes: 9 }),
      item("d", { score: 10, likes: 100, kol: true }),
    ]);
    expect(ranked.map((row) => row.tweet.id)).toEqual(["c", "b", "d", "a"]);
  });
});
