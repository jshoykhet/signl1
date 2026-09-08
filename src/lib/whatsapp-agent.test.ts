import { describe, expect, it } from "vitest";
import {
  compileAgentQuery,
  formatAgentResults,
  isExplicitAgentAsk,
  isSignl1Outbound,
  parseAgentMessage,
  senderIsAllowed,
  shouldSendAgentWelcome,
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

  it("does not treat our own replies as a new search", () => {
    expect(parseAgentMessage("Wait 5s, then search again.")).toBeNull();
    expect(parseAgentMessage("Wait 4s, then search again.")).toBeNull();
    expect(isSignl1Outbound("*Signl1* (3 matches, last 15m)")).toBe(true);
    expect(isExplicitAgentAsk("Wait 5s, then search again.")).toBe(false);
    expect(isExplicitAgentAsk("$NVDA")).toBe(true);
    expect(isExplicitAgentAsk("search FOMC")).toBe(true);
    expect(isExplicitAgentAsk("inbox")).toBe(true);
  });
});

describe("compileAgentQuery", () => {
  it("adds language and retweet filters once", () => {
    expect(compileAgentQuery("Powell lang:en -is:retweet")).toBe("Powell lang:en -is:retweet");
  });

  it("treats $NVDA and NVDA as cashtags, but not theme words", () => {
    expect(compileAgentQuery("$NVDA")).toBe("$NVDA lang:en -is:retweet");
    expect(compileAgentQuery("NVDA")).toBe("$NVDA lang:en -is:retweet");
    expect(compileAgentQuery("AI")).toBe("AI lang:en -is:retweet");
    expect(compileAgentQuery("FOMC")).toBe("FOMC lang:en -is:retweet");
  });

  it("strips find/search and drops a bare AND so X does not 400", () => {
    expect(compileAgentQuery("find nvidia earnings and guidance")).toBe(
      "nvidia earnings guidance lang:en -is:retweet",
    );
    expect(compileAgentQuery("oil AND gas")).toBe("oil gas lang:en -is:retweet");
    expect(compileAgentQuery('NVDA "supply and demand"')).toBe('NVDA "supply and demand" lang:en -is:retweet');
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
    expect(formatAgentResults({ label: "xyzzy", tweets: [] })).toContain("Nothing high-signal in the last 24 hours");
  });
});

describe("shouldSendAgentWelcome", () => {
  it("sends only while a first-link welcome is pending", () => {
    expect(shouldSendAgentWelcome("1")).toBe(true);
    expect(shouldSendAgentWelcome("")).toBe(false);
    expect(shouldSendAgentWelcome(null)).toBe(false);
  });
});
