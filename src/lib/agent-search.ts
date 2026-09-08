import { isMessagingPromo } from "./content-filters";
import { scoreDeskRelevance } from "./desk-relevance";
import { isKolHandle } from "./kol";
import { signalScore, type TweetQuality } from "./signal-filter";
import type { NormalizedTweet } from "./types";

/** Pull a wider recent-search page so ranking has something to pick from. */
export const AGENT_SEARCH_POOL = 40;
const DEFAULT_LIMIT = 6;

const FARM_CTA =
  /\b(follow (me|for more|for alpha|now)|like (and|&) (rt|retweet)|rt if you|drop a (like|follow)|comment (yes|below)|tag (a friend|\d+ friends)|turn on (post )?notifications|link(?:s)? in (my )?bio|subscribe to (my )?(free )?newsletter|join (my |our )?(vip |premium )?(discord|telegram|signal group)|use (code|my link)|smash (that )?like|bookmark this|share this thread|follow train|follow back)\b/i;

const FARM_HYPE =
  /\b(this is huge|you (need|have) to see this|wait for it|let that sink in|thread of the year|gm fam|don't fade this|unbelievable chart|insane setup)\b/i;

const FARM_HANDLE =
  /(?:^|_)(breaking|alerts?|headlines?|dailynews|newsbot|stockalerts?|cryptosignals?|alphadaily|marketwatchers?|newsdaily)(?:_|\d|$)/i;

const FARM_NAME =
  /\b(breaking news|stock alerts?|crypto signals?|daily (alpha|picks|news)|news dump|24\/7 alerts?)\b/i;

const THREAD_OPEN = /^(?:🧵|a thread\b|thread:|thread 🧵)/i;

export type AgentSearchOpts = {
  query?: string;
  limit?: number;
  now?: number;
};

export type ContentFarmVerdict = {
  farm: boolean;
  reasons: string[];
};

export function tweetToQuality(tweet: NormalizedTweet): TweetQuality {
  return {
    followersCount: tweet.followersCount,
    likeCount: tweet.likeCount,
    retweetCount: tweet.retweetCount,
    quoteCount: tweet.quoteCount,
    replyCount: tweet.replyCount,
    impressionCount: tweet.impressionCount,
    verified: tweet.verified,
    createdAt: tweet.createdAt,
    text: tweet.text,
    authorHandle: tweet.authorHandle,
    isReply: tweet.isReply,
  };
}

export function requestedFromHandle(query?: string | null): string | null {
  const match = /\bfrom:([A-Za-z0-9_]{1,15})\b/i.exec(query ?? "");
  return match ? match[1].toLowerCase() : null;
}

function hashtagCount(text: string): number {
  return text.match(/#\w+/g)?.length ?? 0;
}

function cashtagCount(text: string): number {
  return text.match(/\$[A-Za-z]{1,6}\b/g)?.length ?? 0;
}

function looksLikeFarmHandle(handle: string): boolean {
  const h = handle.replace(/^@/, "").toLowerCase();
  if (!h || isKolHandle(h)) return false;
  if (FARM_HANDLE.test(h)) return true;
  const newsy = /(news|alert|headline|breaking|daily|signals?|alpha|tips?)/.test(h);
  const digits = h.match(/\d/g)?.length ?? 0;
  if (newsy && digits >= 2) return true;
  if (newsy && /_|xx|hq|247|24/.test(h)) return true;
  return false;
}

function isEstablishedSource(tweet: Pick<NormalizedTweet, "verified" | "followersCount" | "authorHandle">): boolean {
  if (tweet.verified) return true;
  if (isKolHandle(tweet.authorHandle)) return true;
  return tweet.followersCount >= 80_000;
}

/**
 * Engagement-bait aggregators, numbered “alpha” threads, and CTA mills.
 * Established wires and Key Accounts only fail on explicit funnel copy.
 */
export function looksLikeContentFarm(
  tweet: Pick<NormalizedTweet, "text" | "authorHandle" | "authorName" | "followersCount" | "verified">,
  opts: { allowHandle?: string | null } = {},
): ContentFarmVerdict {
  const reasons: string[] = [];
  const text = tweet.text ?? "";
  const allow =
    opts.allowHandle && tweet.authorHandle.replace(/^@/, "").toLowerCase() === opts.allowHandle.toLowerCase();
  const established = isEstablishedSource(tweet);

  if (FARM_CTA.test(text) || isMessagingPromo(text)) reasons.push("cta");
  if (FARM_HYPE.test(text)) reasons.push("hype");
  if (hashtagCount(text) >= 5) reasons.push("hashtag dump");
  if (cashtagCount(text) >= 6) reasons.push("cashtag dump");

  const desk = scoreDeskRelevance(text, { isReply: text.trim().startsWith("@") });
  if (desk.spam) reasons.push("promo");
  if (THREAD_OPEN.test(text.trim()) && !desk.substance) reasons.push("thread bait");

  if (!allow && !established) {
    if (looksLikeFarmHandle(tweet.authorHandle)) reasons.push("farm handle");
    if (FARM_NAME.test(tweet.authorName ?? "")) reasons.push("farm name");
  }

  return { farm: reasons.length > 0, reasons };
}

export function agentRankScore(tweet: NormalizedTweet, now = Date.now()): number {
  const q = tweetToQuality(tweet);
  const desk = scoreDeskRelevance(tweet.text ?? "", { isReply: tweet.isReply });
  const created = new Date(tweet.createdAt).getTime();
  const ageH = Number.isFinite(created) ? Math.max(0, (now - created) / 3_600_000) : 12;
  const recency = Math.max(0, 36 - ageH * 1.5);
  return (
    signalScore(q) * 3 +
    desk.score * 5 +
    (desk.print ? 90 : 0) +
    (desk.substance ? 50 : 0) +
    (isKolHandle(tweet.authorHandle) ? 55 : 0) +
    (tweet.verified ? 22 : 0) +
    Math.log10(tweet.likeCount + 1) * 18 +
    recency
  );
}

function isLowSignalChatter(tweet: NormalizedTweet): boolean {
  const desk = scoreDeskRelevance(tweet.text ?? "", { isReply: tweet.isReply });
  if (desk.spam) return true;
  if (desk.substance || desk.print) return false;
  if (isKolHandle(tweet.authorHandle) || tweet.verified) return false;
  if (desk.reasons.some((reason) => reason === "lifestyle" || reason === "dunk" || reason === "reply dunk")) {
    return true;
  }
  return signalScore(tweetToQuality(tweet)) < 28;
}

/** Drop farms and empty chatter, then keep the highest-signal posts. */
export function rankAgentTweets(tweets: NormalizedTweet[], opts: AgentSearchOpts = {}): NormalizedTweet[] {
  const limit = opts.limit ?? DEFAULT_LIMIT;
  const now = opts.now ?? Date.now();
  const allowHandle = requestedFromHandle(opts.query);
  const seen = new Set<string>();
  const ranked: Array<{ tweet: NormalizedTweet; score: number }> = [];

  for (const tweet of tweets) {
    if (tweet.isRetweet) continue;
    if (seen.has(tweet.id)) continue;
    seen.add(tweet.id);
    if (looksLikeContentFarm(tweet, { allowHandle }).farm) continue;
    if (isLowSignalChatter(tweet)) continue;
    ranked.push({ tweet, score: agentRankScore(tweet, now) });
  }

  ranked.sort((a, b) => b.score - a.score);
  return ranked.slice(0, limit).map((row) => row.tweet);
}
