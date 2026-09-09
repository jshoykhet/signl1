import type { NormalizedTweet } from "./types";

function tweet(
  handle: string,
  partial: Partial<NormalizedTweet> & Pick<NormalizedTweet, "id" | "text">,
): NormalizedTweet {
  return {
    authorHandle: handle,
    authorName: handle,
    createdAt: new Date(Date.now() - 3_600_000).toISOString(),
    lang: "en",
    isRetweet: false,
    isReply: /^@/.test(partial.text),
    permalink: `https://x.com/${handle}/status/${partial.id}`,
    raw: {
      tweet: { id: partial.id, text: partial.text, in_reply_to_user_id: null },
      author: {
        id: handle,
        username: handle,
        public_metrics: { followers_count: 12_400 },
      },
    },
    followersCount: 12_400,
    likeCount: 18,
    retweetCount: 2,
    replyCount: 4,
    quoteCount: 1,
    impressionCount: 9_200,
    verified: false,
    ...partial,
  };
}

export function demoDietTweets(handle: string): { own: NormalizedTweet[]; inbound: NormalizedTweet[] } {
  const h = handle.replace(/^@/, "").trim() || "middesk";
  const own: NormalizedTweet[] = [
    tweet(h, {
      id: "d1",
      text: "JUST IN: CPI 3.2% vs 3.1% expected. $SPX futures bid, $TLT offered.",
      isReply: false,
      likeCount: 42,
      impressionCount: 18_000,
      createdAt: new Date(Date.now() - 2 * 3600_000).toISOString(),
    }),
    tweet(h, {
      id: "d2",
      text: "@DeItaone the print is the print. Guidance is what moved $NVDA.",
      isReply: true,
      likeCount: 6,
      impressionCount: 2_100,
      createdAt: new Date(Date.now() - 5 * 3600_000).toISOString(),
      raw: {
        tweet: { id: "d2", text: "@DeItaone the print is the print.", in_reply_to_user_id: "delta" },
        author: { id: h, username: h, public_metrics: { followers_count: 12_400 } },
      },
    }),
    tweet(h, {
      id: "d3",
      text: "@zerohedge this is the same tape as last print. Fade the headline.",
      isReply: true,
      likeCount: 3,
      createdAt: new Date(Date.now() - 8 * 3600_000).toISOString(),
    }),
    tweet(h, {
      id: "d4",
      text: "FOMC hold is priced. The question is the dots, not the statement. $DXY",
      isReply: false,
      likeCount: 27,
      impressionCount: 11_000,
      createdAt: new Date(Date.now() - 26 * 3600_000).toISOString(),
    }),
    tweet(h, {
      id: "d5",
      text: "@smalldesk123 agree on crude but $CL is a positioning story not a demand one.",
      isReply: true,
      likeCount: 2,
      createdAt: new Date(Date.now() - 30 * 3600_000).toISOString(),
    }),
    tweet(h, {
      id: "d6",
      text: "RT @elonmusk interesting",
      isRetweet: true,
      isReply: false,
      likeCount: 0,
      createdAt: new Date(Date.now() - 40 * 3600_000).toISOString(),
    }),
  ];
  const inbound: NormalizedTweet[] = [
    tweet("reuters", {
      id: "i1",
      text: `@${h} sources say the CPI print leaked to two desks.`,
      followersCount: 25_000_000,
      likeCount: 120,
      authorName: "Reuters",
    }),
    tweet("midcapdesk", {
      id: "i2",
      text: `@${h} useful on guidance. more of this.`,
      followersCount: 18_000,
      likeCount: 9,
      authorName: "Midcap Desk",
    }),
    tweet("smalldesk123", {
      id: "i3",
      text: `@${h} wait why fade?`,
      followersCount: 900,
      likeCount: 1,
      authorName: "Small Desk",
    }),
  ];
  return { own, inbound };
}
