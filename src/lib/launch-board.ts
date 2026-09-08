import { DEMO_FIXTURES, VENTURE_DEMO_FIXTURES, fixtureToTweet } from "./demo-fixtures";
import { scoreDeskRelevance } from "./desk-relevance";
import type { Match } from "./types";

export const LAUNCH_TOP_N = 20;
export const LAUNCH_HEAT_N = 8;
export const LAUNCH_THEME_N = 6;
export const LAUNCH_WINDOW_MS = 24 * 60 * 60 * 1000;

const THEME_WORDS = [
  "fomc",
  "powell",
  "cpi",
  "pce",
  "nfp",
  "fed",
  "yields",
  "treasury",
  "oil",
  "opec",
  "nvidia",
  "gpu",
  "ai",
  "openai",
  "anthropic",
  "funding",
  "series",
  "ipo",
  "acquisition",
  "tariff",
  "inflation",
  "payrolls",
];

export type LaunchTweet = {
  id: string;
  tweetId: string;
  authorHandle: string;
  authorName: string;
  text: string;
  permalink: string;
  matchedAt: string;
  tweetCreatedAt: string;
  likeCount: number;
  followersCount: number;
  signalScore: number;
  kol: boolean;
  ruleName: string;
};

export type LaunchTheme = {
  id: string;
  label: string;
  count: number;
  likes: number;
  sample: LaunchTweet;
};

function asTweet(match: Match): LaunchTweet {
  return {
    id: match.id,
    tweetId: match.tweetId,
    authorHandle: match.authorHandle,
    authorName: match.authorName,
    text: match.text,
    permalink: match.permalink,
    matchedAt: match.matchedAt,
    tweetCreatedAt: match.tweetCreatedAt,
    likeCount: match.likeCount ?? 0,
    followersCount: match.followersCount ?? 0,
    signalScore: match.signalScore ?? 0,
    kol: match.kol,
    ruleName: match.ruleName,
  };
}

export function uniqueByTweet(matches: Match[]): Match[] {
  const seen = new Set<string>();
  const out: Match[] = [];
  for (const match of matches) {
    if (seen.has(match.tweetId)) continue;
    seen.add(match.tweetId);
    out.push(match);
  }
  return out;
}

export function inLaunchWindow(iso: string, now = Date.now(), windowMs = LAUNCH_WINDOW_MS): boolean {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return false;
  return now - t <= windowMs && t <= now + 60_000;
}

const STOP = new Set([
  "the",
  "and",
  "for",
  "that",
  "this",
  "with",
  "from",
  "are",
  "was",
  "were",
  "has",
  "have",
  "had",
  "not",
  "but",
  "its",
  "into",
  "than",
  "then",
  "they",
  "them",
  "their",
  "about",
  "just",
  "over",
  "after",
  "been",
  "will",
  "said",
  "says",
  "say",
  "breaking",
]);

export function fingerprintTokens(text: string): Set<string> {
  const tokens = new Set<string>();
  const cleaned = (text ?? "")
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[^a-z0-9$%]+/g, " ");
  for (const word of cleaned.split(/\s+/)) {
    if (word.length < 3 || STOP.has(word)) continue;
    tokens.add(word);
  }
  return tokens;
}

export function textOverlap(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const token of a) {
    if (b.has(token)) inter += 1;
  }
  return inter / (a.size + b.size - inter);
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

function log10(n: number): number {
  return Math.log10(Math.max(0, n) + 1);
}

function matchMetrics(match: Match): { likes: number; followers: number; spread: number } {
  let retweets = 0;
  let quotes = 0;
  try {
    const raw = JSON.parse(match.rawJson || "{}") as {
      public_metrics?: { retweet_count?: number; quote_count?: number };
      tweet?: { public_metrics?: { retweet_count?: number; quote_count?: number } };
    };
    const metrics = raw.tweet?.public_metrics ?? raw.public_metrics;
    retweets = metrics?.retweet_count ?? 0;
    quotes = metrics?.quote_count ?? 0;
  } catch {
    /* likes/followers columns are enough */
  }
  const likes = match.likeCount ?? 0;
  return {
    likes,
    followers: Math.max(1, match.followersCount ?? 0),
    spread: likes + 2 * retweets + 2 * quotes,
  };
}

export type WorthContext = {
  overlap?: number;
  themeCounts?: Map<string, number>;
};

function zeitgeistBoost(text: string, themeCounts?: Map<string, number>): number {
  if (!themeCounts || themeCounts.size === 0) return 0;
  let best = 0;
  for (const key of extractThemeKeys(text)) {
    const count = themeCounts.get(key) ?? 0;
    if (count >= 2) best = Math.max(best, 12 * Math.log2(1 + count));
  }
  return Math.min(42, best);
}

function themeCountsIn(matches: Match[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const match of matches) {
    for (const key of extractThemeKeys(match.text)) {
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  return counts;
}

/**
 * Interestingness, not account size. Punch-above-weight engagement, a distinct
 * take, and themes the tape is clustering on beat a mega-account headline dump.
 */
export function worthScore(match: Match, now = Date.now(), ctx: WorthContext = {}): number {
  const created = new Date(match.tweetCreatedAt || match.matchedAt).getTime();
  const ageH = Number.isFinite(created) ? Math.max(0, (now - created) / 3_600_000) : 12;
  const recency = Math.max(0, 32 - ageH);
  const { likes, followers, spread } = matchMetrics(match);
  const desk = scoreDeskRelevance(match.text ?? "");
  const useful = desk.substance || desk.print || match.userLabel === "high";
  const density = likes / Math.sqrt(followers);
  const velocity = spread / Math.max(ageH, 0.35);
  let engagement = clamp(log10(density) * 55, 0, 90) + clamp(log10(velocity) * 40, 0, 80);
  if (!useful) engagement *= 0.2;

  const analysis = desk.reasons.includes("analysis");
  const perspective =
    desk.score * 5 +
    (desk.print ? 48 : 0) +
    (desk.substance ? 40 : 0) +
    (analysis ? 55 : 0) +
    (desk.spam ? -200 : 0);

  const overlap = clamp(ctx.overlap ?? 0, 0, 1);
  const uniqueness = (1 - overlap) * 100;
  const kol = match.kol && useful ? 12 : 0;
  const labeled =
    match.userLabel === "high" ? 160 : match.userLabel === "low" ? -220 : 0;

  return (
    engagement +
    perspective +
    uniqueness +
    zeitgeistBoost(match.text, ctx.themeCounts) +
    recency +
    kol +
    labeled
  );
}

const NEAR_DUP = 0.52;

export function rankWorthLookingAt(matches: Match[], now = Date.now(), limit = LAUNCH_TOP_N): LaunchTweet[] {
  const unique = uniqueByTweet(matches).filter((match) => match.userLabel !== "low");
  const fingerprinted = unique.map((match) => ({ match, tokens: fingerprintTokens(match.text) }));
  const themeCounts = themeCountsIn(unique);

  const scored = fingerprinted.map((row, index) => {
    let nearest = 0;
    for (let other = 0; other < fingerprinted.length; other++) {
      if (other === index) continue;
      nearest = Math.max(nearest, textOverlap(row.tokens, fingerprinted[other]!.tokens));
    }
    return {
      ...row,
      score: worthScore(row.match, now, { overlap: nearest, themeCounts }),
    };
  });
  scored.sort((a, b) => b.score - a.score);

  const picked: typeof scored = [];
  for (const candidate of scored) {
    if (picked.some((row) => textOverlap(row.tokens, candidate.tokens) >= NEAR_DUP)) continue;
    picked.push(candidate);
    if (picked.length >= limit) break;
  }
  return picked.map((row) => asTweet(row.match));
}

export function rankHighEngagement(matches: Match[], limit = LAUNCH_HEAT_N): LaunchTweet[] {
  return uniqueByTweet(matches)
    .filter((match) => (match.likeCount ?? 0) > 0 && match.userLabel !== "low")
    .sort((a, b) => (b.likeCount ?? 0) - (a.likeCount ?? 0) || worthScore(b) - worthScore(a))
    .slice(0, limit)
    .map(asTweet);
}

export function extractThemeKeys(text: string): string[] {
  const keys = new Set<string>();
  const body = text ?? "";
  for (const hit of body.matchAll(/\$([A-Z]{1,5})\b/g)) {
    keys.add(`$${hit[1]}`);
  }
  for (const hit of body.matchAll(/#([A-Za-z][A-Za-z0-9_]{1,24})/g)) {
    keys.add(`#${hit[1]}`);
  }
  const lower = body.toLowerCase();
  for (const word of THEME_WORDS) {
    if (new RegExp(`\\b${word}\\b`, "i").test(lower)) keys.add(word);
  }
  return [...keys];
}

function themeLabel(id: string): string {
  if (id.startsWith("$") || id.startsWith("#")) return id;
  if (id === "fomc") return "FOMC";
  if (id === "cpi") return "CPI";
  if (id === "pce") return "PCE";
  if (id === "nfp") return "Payrolls";
  if (id === "ai") return "AI";
  if (id === "ipo") return "IPO";
  if (id === "gpu") return "GPUs";
  return id.slice(0, 1).toUpperCase() + id.slice(1);
}

export function developingThemes(matches: Match[], limit = LAUNCH_THEME_N): LaunchTheme[] {
  const unique = uniqueByTweet(matches).filter((match) => match.userLabel !== "low");
  const buckets = new Map<string, { count: number; likes: number; sample: Match }>();
  for (const match of unique) {
    const keys = extractThemeKeys(match.text);
    if (keys.length === 0) keys.push(match.ruleName.toLowerCase());
    for (const key of keys) {
      const prev = buckets.get(key);
      const likes = match.likeCount ?? 0;
      if (!prev) {
        buckets.set(key, { count: 1, likes, sample: match });
        continue;
      }
      prev.count += 1;
      prev.likes += likes;
      if (worthScore(match) > worthScore(prev.sample)) prev.sample = match;
    }
  }
  return [...buckets.entries()]
    .filter(([, value]) => value.count >= 1)
    .sort((a, b) => b[1].count * 10 + b[1].likes - (a[1].count * 10 + a[1].likes))
    .slice(0, limit)
    .map(([id, value]) => ({
      id,
      label: themeLabel(id),
      count: value.count,
      likes: value.likes,
      sample: asTweet(value.sample),
    }));
}

export function demoMatchesForLaunch(now = Date.now()): Match[] {
  const pool = [...DEMO_FIXTURES, ...VENTURE_DEMO_FIXTURES];
  return pool.map((fixture, index) => {
    const createdAt = new Date(now - index * 11 * 60_000).toISOString();
    const tweet = fixtureToTweet(fixture, fixture.id, createdAt);
    const venture = /raised|raising|series|stealth|launch|funding|open source/i.test(tweet.text);
    return {
      id: `demo-launch-${tweet.id}`,
      tweetId: tweet.id,
      ruleId: venture ? "demo-venture" : "demo-macro",
      ruleName: venture ? "Funding" : "Macro",
      authorHandle: tweet.authorHandle,
      authorName: tweet.authorName,
      text: tweet.text,
      tweetCreatedAt: tweet.createdAt,
      permalink: tweet.permalink,
      rawJson: "{}",
      read: false,
      matchedAt: tweet.createdAt,
      followersCount: tweet.followersCount,
      likeCount: tweet.likeCount,
      signalScore: 70,
      userLabel: null,
      authorPrior: { high: 0, low: 0 },
      kol: true,
    };
  });
}

export function buildLaunchBoard(matches: Match[], now = Date.now()) {
  const recent = uniqueByTweet(matches).filter((match) =>
    inLaunchWindow(match.tweetCreatedAt || match.matchedAt, now),
  );
  const pool = recent.length >= 8 ? recent : uniqueByTweet(matches);
  return {
    windowHours: 24,
    usedFallbackWindow: recent.length < 8,
    top: rankWorthLookingAt(pool, now),
    heat: rankHighEngagement(pool),
    themes: developingThemes(pool),
  };
}
