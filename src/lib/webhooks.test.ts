import { describe, expect, it } from "vitest";
import { buildGenericWebhookPayload, buildSlackWebhookPayload } from "./webhooks";

const rule = {
  id: "rule-fed",
  name: "Fed Watch",
  query: '(FOMC OR Powell) lang:en -is:retweet',
};

const tweet = {
  id: "1988771",
  authorHandle: "reuters",
  authorName: "Reuters",
  text: "Chair Powell says the FOMC is not on a preset course.",
  createdAt: "2026-08-31T15:02:00.000Z",
  permalink: "https://x.com/reuters/status/1988771",
};

describe("webhook payloads", () => {
  it("emits a stable generic JSON contract", () => {
    const payload = buildGenericWebhookPayload(rule, tweet);
    expect(payload).toEqual({
      event: "signal.match",
      rule: {
        id: "rule-fed",
        name: "Fed Watch",
        query: rule.query,
      },
      tweet: {
        id: "1988771",
        author_handle: "reuters",
        author_name: "Reuters",
        text: tweet.text,
        created_at: tweet.createdAt,
        permalink: tweet.permalink,
      },
    });
    expect(payload.event).toBe("signal.match");
    expect(Object.keys(payload.tweet).sort()).toEqual(
      ["author_handle", "author_name", "created_at", "id", "permalink", "text"].sort(),
    );
  });

  it("emits Slack incoming-webhook blocks with the tweet permalink", () => {
    const payload = buildSlackWebhookPayload(rule, tweet);
    expect(payload.text).toContain("[Fed Watch]");
    expect(payload.text).toContain("@reuters");
    expect(payload.unfurl_links).toBe(false);
    expect(payload.blocks[0]).toMatchObject({ type: "header" });
    const actions = payload.blocks.find((block) => block.type === "actions") as {
      elements: Array<{ url: string }>;
    };
    expect(actions.elements[0].url).toBe(tweet.permalink);
  });
});
