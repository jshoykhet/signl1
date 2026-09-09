import { describe, expect, it } from "vitest";
import { analyzeDiet, mentionedHandles, parseXHandle, recommendDiet } from "./diet";
import { demoDietTweets } from "./diet-demo";

describe("diet parse", () => {
  it("accepts a normal handle and rejects junk", () => {
    expect(parseXHandle("@DeItaone")).toBe("DeItaone");
    expect(parseXHandle("bad!!")).toBeNull();
    expect(parseXHandle("")).toBeNull();
  });

  it("drops self-mentions", () => {
    expect(mentionedHandles("@me hello @DeItaone", "me")).toEqual(["deitaone"]);
  });
});

describe("diet analysis", () => {
  it("reads themes, graph, and reach tips from a week of posts", () => {
    const { own, inbound } = demoDietTweets("middesk");
    const report = analyzeDiet("middesk", own, inbound);
    expect(report.posted).toBe(6);
    expect(report.replies).toBeGreaterThan(0);
    expect(report.themes.some((theme) => theme.token === "$SPX" || theme.token === "$NVDA")).toBe(true);
    expect(report.outbound.some((node) => node.handle === "deitaone")).toBe(true);
    expect(report.inbound.some((node) => node.handle === "reuters")).toBe(true);
    expect(report.recommendations.length).toBeGreaterThan(0);
    expect(report.note).toMatch(/not the full follower/i);
  });

  it("flags an empty handle", () => {
    const recs = recommendDiet(
      analyzeDiet("ghost", [], []),
    );
    expect(recs[0]?.title).toMatch(/No posts/i);
  });
});
