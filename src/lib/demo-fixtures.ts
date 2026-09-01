import type { NormalizedTweet } from "./types";

export type DemoFixture = Omit<
  NormalizedTweet,
  "permalink" | "raw" | "followersCount" | "likeCount" | "retweetCount" | "replyCount" | "quoteCount" | "verified"
> &
  Partial<Pick<NormalizedTweet, "followersCount" | "likeCount" | "retweetCount" | "replyCount" | "quoteCount" | "verified">> & {
    raw?: unknown;
  };

const DESK_METRICS: Record<string, Pick<NormalizedTweet, "followersCount" | "likeCount" | "retweetCount" | "replyCount" | "quoteCount" | "verified">> = {
  federalreserve: { followersCount: 1_200_000, likeCount: 340, retweetCount: 120, replyCount: 45, quoteCount: 22, verified: true },
  newyorkfed: { followersCount: 480_000, likeCount: 90, retweetCount: 40, replyCount: 12, quoteCount: 8, verified: true },
  reuters: { followersCount: 25_000_000, likeCount: 520, retweetCount: 210, replyCount: 80, quoteCount: 30, verified: true },
  ft: { followersCount: 8_400_000, likeCount: 210, retweetCount: 70, replyCount: 25, quoteCount: 14, verified: true },
  nvidia: { followersCount: 5_600_000, likeCount: 890, retweetCount: 300, replyCount: 110, quoteCount: 40, verified: true },
  apple: { followersCount: 9_200_000, likeCount: 640, retweetCount: 180, replyCount: 90, quoteCount: 28, verified: true },
  meta: { followersCount: 14_000_000, likeCount: 410, retweetCount: 95, replyCount: 60, quoteCount: 18, verified: true },
  microsoft: { followersCount: 13_500_000, likeCount: 470, retweetCount: 130, replyCount: 55, quoteCount: 20, verified: true },
  iea: { followersCount: 310_000, likeCount: 75, retweetCount: 40, replyCount: 10, quoteCount: 6, verified: true },
  bloomberg: { followersCount: 9_100_000, likeCount: 260, retweetCount: 90, replyCount: 35, quoteCount: 16, verified: true },
  opecsecretariat: { followersCount: 220_000, likeCount: 55, retweetCount: 30, replyCount: 8, quoteCount: 5, verified: true },
  zerohedge: { followersCount: 2_000_000, likeCount: 310, retweetCount: 140, replyCount: 90, quoteCount: 25, verified: false },
  business: { followersCount: 9_100_000, likeCount: 180, retweetCount: 60, replyCount: 22, quoteCount: 11, verified: true },
};

function deskMetrics(handle: string) {
  return (
    DESK_METRICS[handle] ?? {
      followersCount: 85_000,
      likeCount: 40,
      retweetCount: 8,
      replyCount: 4,
      quoteCount: 2,
      verified: false,
    }
  );
}

export const DEMO_FIXTURES: DemoFixture[] = [
  {
    id: "demo-1001",
    authorHandle: "federalreserve",
    authorName: "Federal Reserve",
    text: "The Federal Open Market Committee decided to hold the federal funds rate unchanged. The Committee remains attentive to inflation risks and the path of interest rate policy.",
    createdAt: "2026-08-31T14:05:00.000Z",
    lang: "en",
    isRetweet: false,
    isReply: false,
  },
  {
    id: "demo-1002",
    authorHandle: "newyorkfed",
    authorName: "New York Fed",
    text: "Markets Desk: overnight reverse repo take-up remains elevated. Watch liquidity conditions into month-end as money-market rates stay pinned near the floor of the fed funds target range.",
    createdAt: "2026-08-31T14:18:00.000Z",
    lang: "en",
    isRetweet: false,
    isReply: false,
  },
  {
    id: "demo-1003",
    authorHandle: "reuters",
    authorName: "Reuters",
    text: "BREAKING: Chair Powell says the FOMC is not on a preset course and will adjust interest rate policy if incoming data warrant. Markets price a higher chance of a cut later this year.",
    createdAt: "2026-08-31T15:02:00.000Z",
    lang: "en",
    isRetweet: false,
    isReply: false,
  },
  {
    id: "demo-1004",
    authorHandle: "ft",
    authorName: "Financial Times",
    text: "US 10-year yield slips after a cooler PCE print. Traders debate whether the Fed has room to ease even as services inflation stays sticky.",
    createdAt: "2026-08-31T15:40:00.000Z",
    lang: "en",
    isRetweet: false,
    isReply: false,
  },
  {
    id: "demo-2001",
    authorHandle: "nvidia",
    authorName: "NVIDIA",
    text: "Q2 earnings: data center revenue beat consensus on continued Hopper and Blackwell GPU demand. Guidance for Q3 assumes supply remains the constraint, not AI demand.",
    createdAt: "2026-08-31T16:01:00.000Z",
    lang: "en",
    isRetweet: false,
    isReply: false,
  },
  {
    id: "demo-2002",
    authorHandle: "nvidia",
    authorName: "NVIDIA",
    text: "Blackwell rack-scale systems are ramping with cloud partners. We remain sold out of leading-edge AI GPUs through the next two quarters.",
    createdAt: "2026-08-31T16:22:00.000Z",
    lang: "en",
    isRetweet: false,
    isReply: false,
  },
  {
    id: "demo-2003",
    authorHandle: "apple",
    authorName: "Apple",
    text: "September event preview: iPhone ASP mix and Services growth in focus. Wall Street wants a clean beat on guidance after a cautious June quarter.",
    createdAt: "2026-08-31T16:44:00.000Z",
    lang: "en",
    isRetweet: false,
    isReply: false,
  },
  {
    id: "demo-2004",
    authorHandle: "meta",
    authorName: "Meta",
    text: "Reality Labs remains a drag, but family of apps ad revenue is tracking above plan on AI ranking. Capex guide for GPU clusters is unchanged.",
    createdAt: "2026-08-31T17:05:00.000Z",
    lang: "en",
    isRetweet: false,
    isReply: false,
  },
  {
    id: "demo-2005",
    authorHandle: "microsoft",
    authorName: "Microsoft",
    text: "Azure growth reaccelerates as OpenAI and Copilot workloads fill GPU capacity. FY guidance raised; management flags a still-tight supply of AI accelerators.",
    createdAt: "2026-08-31T17:21:00.000Z",
    lang: "en",
    isRetweet: false,
    isReply: false,
  },
  {
    id: "demo-3001",
    authorHandle: "iea",
    authorName: "IEA",
    text: "Oil Market Report: OPEC+ spare capacity is tightening as voluntary cuts hold. We revise the WTI and Brent balances to a modest deficit in Q4.",
    createdAt: "2026-08-31T17:48:00.000Z",
    lang: "en",
    isRetweet: false,
    isReply: false,
  },
  {
    id: "demo-3002",
    authorHandle: "bloomberg",
    authorName: "Bloomberg",
    text: "Crude oil jumps after a larger-than-expected inventory draw. WTI trades through $82 with traders citing OPEC discipline and a firmer dollar fade.",
    createdAt: "2026-08-31T18:06:00.000Z",
    lang: "en",
    isRetweet: false,
    isReply: false,
  },
  {
    id: "demo-3003",
    authorHandle: "opecsecretariat",
    authorName: "OPEC Secretariat",
    text: "OPEC and non-OPEC participating countries reaffirm the decision to maintain current production adjustments. The Joint Ministerial Monitoring Committee meets next month.",
    createdAt: "2026-08-31T18:19:00.000Z",
    lang: "en",
    isRetweet: false,
    isReply: false,
  },
  {
    id: "demo-4001",
    authorHandle: "zerohedge",
    authorName: "ZeroHedge",
    text: "2s10s steepens as the front end prices two interest rate cuts. Powell's press conference is being read as a door left ajar, not a pivot.",
    createdAt: "2026-08-31T18:33:00.000Z",
    lang: "en",
    isRetweet: false,
    isReply: false,
  },
  {
    id: "demo-4002",
    authorHandle: "business",
    authorName: "Bloomberg Business",
    text: "Mag 7 breadth is narrowing: NVDA and MSFT carry the tape on AI capex, while AAPL waits on earnings mix and META digests a higher GPU spend print.",
    createdAt: "2026-08-31T18:41:00.000Z",
    lang: "en",
    isRetweet: false,
    isReply: false,
  },
  {
    id: "demo-5001",
    authorHandle: "bloomberg",
    authorName: "Bloomberg",
    text: "Tape: $NVDA and $MSFT catch a bid into the close as AI capex prints land. $AAPL lags on mix; $SPY holds the session high.",
    createdAt: "2026-08-31T19:02:00.000Z",
    lang: "en",
    isRetweet: false,
    isReply: false,
  },
  {
    id: "demo-5002",
    authorHandle: "zerohedge",
    authorName: "ZeroHedge",
    text: "Dealer gamma flips in $TSLA after a delivery beat. Watch $QQQ and $IWM into the bell — this is a cashtag tape, not a press release.",
    createdAt: "2026-08-31T19:14:00.000Z",
    lang: "en",
    isRetweet: false,
    isReply: false,
  },
];

export function fixtureToTweet(fixture: DemoFixture, tweetId: string, createdAt: string): NormalizedTweet {
  const permalink = `https://x.com/${fixture.authorHandle}/status/${tweetId}`;
  const metrics = deskMetrics(fixture.authorHandle);
  const followersCount = fixture.followersCount ?? metrics.followersCount;
  const likeCount = fixture.likeCount ?? metrics.likeCount;
  const retweetCount = fixture.retweetCount ?? metrics.retweetCount;
  const replyCount = fixture.replyCount ?? metrics.replyCount;
  const quoteCount = fixture.quoteCount ?? metrics.quoteCount;
  const verified = fixture.verified ?? metrics.verified;
  const raw = {
    id: tweetId,
    text: fixture.text,
    created_at: createdAt,
    author_id: fixture.authorHandle,
    lang: fixture.lang,
    source: "signal-demo",
    fixture_id: fixture.id,
    public_metrics: {
      like_count: likeCount,
      retweet_count: retweetCount,
      reply_count: replyCount,
      quote_count: quoteCount,
    },
    author: {
      username: fixture.authorHandle,
      name: fixture.authorName,
      verified,
      public_metrics: { followers_count: followersCount },
    },
  };
  return {
    id: tweetId,
    authorHandle: fixture.authorHandle,
    authorName: fixture.authorName,
    text: fixture.text,
    createdAt,
    lang: fixture.lang,
    isRetweet: fixture.isRetweet,
    isReply: fixture.isReply,
    permalink,
    raw,
    followersCount,
    likeCount,
    retweetCount,
    replyCount,
    quoteCount,
    verified,
  };
}
