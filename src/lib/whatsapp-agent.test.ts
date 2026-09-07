import { describe, expect, it } from "vitest";
import {
  compileAgentQuery,
  formatAgentResults,
  parseAgentMessage,
  senderIsAllowed,
} from "./whatsapp-agent";

describe("parseAgentMessage", () => {
  it("treats greetings as help", () => {
    expect(parseAgentMessage("help")?.kind).toBe("help");
    expect(parseAgentMessage("Hi")?.kind).toBe("help");
    expect(parseAgentMessage("?")?.kind).toBe("help");
  });

  it("parses inbox and status", () => {
    expect(parseAgentMessage("inbox")?.kind).toBe("inbox");
    expect(parseAgentMessage("latest")?.kind).toBe("inbox");
    expect(parseAgentMessage("status")?.kind).toBe("status");
  });

  it("turns a ticker or handle into an X query", () => {
    expect(parseAgentMessage("$NVDA")).toEqual({
      kind: "search",
      raw: "$NVDA",
      query: "$NVDA lang:en -is:retweet",
    });
    expect(parseAgentMessage("search @Reuters")).toEqual({
      kind: "search",
      raw: "@Reuters",
      query: "from:reuters lang:en -is:retweet",
    });
    expect(parseAgentMessage("FOMC cut")?.kind).toBe("search");
    expect(parseAgentMessage("FOMC cut")).toMatchObject({
      query: "FOMC cut lang:en -is:retweet",
    });
  });

  it("ignores empty text", () => {
    expect(parseAgentMessage("   ")).toBeNull();
  });
});

describe("compileAgentQuery", () => {
  it("adds language and retweet filters once", () => {
    expect(compileAgentQuery("Powell lang:en -is:retweet")).toBe("Powell lang:en -is:retweet");
  });
});

describe("senderIsAllowed", () => {
  it("matches a destination number to a device JID", () => {
    expect(senderIsAllowed("19177334993:4@s.whatsapp.net", ["19177334993"])).toBe(true);
    expect(senderIsAllowed("15551234567@s.whatsapp.net", ["19177334993"])).toBe(false);
  });
});

describe("formatAgentResults", () => {
  it("includes handle, snippet, and permalink", () => {
    const text = formatAgentResults({
      label: "$NVDA",
      tweets: [
        {
          authorHandle: "reuters",
          authorName: "Reuters",
          text: "Nvidia beats.",
          permalink: "https://x.com/reuters/status/1",
          likeCount: 120,
        },
      ],
    });
    expect(text).toContain("$NVDA");
    expect(text).toContain("@reuters");
    expect(text).toContain("https://x.com/reuters/status/1");
    expect(text).toContain("120 likes");
  });

  it("explains an empty live search", () => {
    expect(formatAgentResults({ label: "xyzzy", tweets: [] })).toContain("Nothing in the last 24 hours");
  });
});
