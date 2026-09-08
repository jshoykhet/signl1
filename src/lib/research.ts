import { isDemoMode, xBearerToken } from "./config";
import { DEMO_FIXTURES, VENTURE_DEMO_FIXTURES, fixtureToTweet } from "./demo-fixtures";
import { grokComplete, isGrokConfigured, parseJsonObject } from "./grok";
import { compileAgentQuery } from "./whatsapp-agent";
import { matchesQuery } from "./query";
import type { NormalizedTweet } from "./types";
import { recentSearch, XRateLimiter } from "./x-client";

export type ResearchHit = {
  id: string;
  authorHandle: string;
  authorName: string;
  text: string;
  permalink: string;
  likeCount: number;
  createdAt: string;
};

export type ResearchPlan = {
  queries: string[];
  lookbackHours: number;
  angle: string;
  grok: boolean;
};

export type ResearchResult = {
  question: string;
  plan: ResearchPlan;
  brief: string;
  hits: ResearchHit[];
  demo: boolean;
  grok: boolean;
};

const limiter = new XRateLimiter();

function clampHours(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return 24;
  return Math.min(24, Math.max(1, Math.round(n)));
}

function sanitizeQuery(raw: string): string {
  const compiled = compileAgentQuery(raw.replace(/[\n\r]+/g, " ").trim());
  return compiled.slice(0, 480);
}

export function planResearchFallback(question: string): ResearchPlan {
  const query = sanitizeQuery(question);
  return {
    queries: query ? [query] : ["lang:en -is:retweet"],
    lookbackHours: 24,
    angle: question.trim(),
    grok: false,
  };
}

export async function planResearch(question: string): Promise<ResearchPlan> {
  const fallback = planResearchFallback(question);
  if (!isGrokConfigured()) return fallback;
  try {
    const text = await grokComplete({
      json: true,
      timeoutMs: 18_000,
      system:
        "You write X (Twitter) recent-search queries for a markets/venture desk. Return JSON only: {\"queries\": string[], \"lookbackHours\": number, \"angle\": string}. One or two queries. Prefer cashtags, from: handles, and news language. Always include lang:en -is:retweet. lookbackHours 1-24. Never use the word AND — a space already means AND. Do not start a query with find or search. Quote phrases that contain the word and.",
      user: question,
    });
    const parsed = parseJsonObject(text);
    const queries = Array.isArray(parsed.queries)
      ? parsed.queries.map((item) => sanitizeQuery(String(item))).filter(Boolean)
      : [];
    return {
      queries: queries.slice(0, 2).length ? queries.slice(0, 2) : fallback.queries,
      lookbackHours: clampHours(parsed.lookbackHours),
      angle: typeof parsed.angle === "string" && parsed.angle.trim() ? parsed.angle.trim() : fallback.angle,
      grok: true,
    };
  } catch (error) {
    console.warn(`[research] grok plan failed: ${error instanceof Error ? error.message : String(error)}`);
    return fallback;
  }
}

function toHit(tweet: NormalizedTweet): ResearchHit {
  return {
    id: tweet.id,
    authorHandle: tweet.authorHandle,
    authorName: tweet.authorName,
    text: tweet.text,
    permalink: tweet.permalink,
    likeCount: tweet.likeCount,
    createdAt: tweet.createdAt,
  };
}

function searchFixtures(query: string, limit: number): NormalizedTweet[] {
  const now = new Date().toISOString();
  return [...DEMO_FIXTURES, ...VENTURE_DEMO_FIXTURES]
    .map((fixture) => fixtureToTweet(fixture, fixture.id, now))
    .filter((tweet) => matchesQuery(tweet, query))
    .slice(0, limit);
}

async function runQueries(plan: ResearchPlan): Promise<{ tweets: NormalizedTweet[]; demo: boolean }> {
  const token = xBearerToken();
  const demo = !token || isDemoMode();
  const startTime = new Date(Date.now() - plan.lookbackHours * 60 * 60 * 1000).toISOString();
  const collected: NormalizedTweet[] = [];
  const seen = new Set<string>();
  for (const query of plan.queries) {
    const batch = demo
      ? searchFixtures(query, 10)
      : (
          await recentSearch({
            bearerToken: token!,
            query,
            startTime,
            maxResults: 10,
            limiter,
          })
        ).tweets;
    for (const tweet of batch) {
      if (seen.has(tweet.id) || tweet.isRetweet) continue;
      seen.add(tweet.id);
      collected.push(tweet);
    }
  }
  collected.sort((a, b) => b.likeCount - a.likeCount);
  return { tweets: collected.slice(0, 12), demo };
}

function fallbackBrief(question: string, tweets: NormalizedTweet[], demo: boolean): string {
  if (!tweets.length) {
    return demo
      ? `No sample posts matched “${question.trim()}”. Try $NVDA, FOMC, or a Key Account handle.`
      : `Nothing in the last day matched “${question.trim()}”.`;
  }
  const lines = tweets.slice(0, 4).map((tweet) => `@${tweet.authorHandle}: ${tweet.text.replace(/\s+/g, " ").slice(0, 140)}`);
  return [
    demo ? "Sample tape (no live X token)." : "Live X search, no Grok key — raw hits:",
    ...lines,
  ].join("\n");
}

export async function writeResearchBrief(
  question: string,
  plan: ResearchPlan,
  tweets: NormalizedTweet[],
  demo: boolean,
): Promise<string> {
  if (!isGrokConfigured()) return fallbackBrief(question, tweets, demo);
  const catalog = tweets
    .map(
      (tweet, index) =>
        `${index + 1}. @${tweet.authorHandle} (${tweet.likeCount} likes) ${tweet.text.replace(/\s+/g, " ").slice(0, 280)}\n${tweet.permalink}`,
    )
    .join("\n\n");
  try {
    return await grokComplete({
      timeoutMs: 28_000,
      system:
        "You are Signl1, a terse markets/venture research desk. Write 5-8 sentences. What happened, who is saying it, disagreement, what to watch next. Cite @handles. No fluff, no lorem, no disclaimers. If the posts are thin, say so.",
      user: `Question: ${question}\nAngle: ${plan.angle}\nQueries: ${plan.queries.join(" | ")}\n\nPosts:\n${catalog || "(none)"}`,
    });
  } catch (error) {
    console.warn(`[research] grok brief failed: ${error instanceof Error ? error.message : String(error)}`);
    return fallbackBrief(question, tweets, demo);
  }
}

export async function runResearch(question: string): Promise<ResearchResult> {
  const trimmed = question.replace(/\s+/g, " ").trim();
  if (trimmed.length < 2) throw new Error("Ask a real question.");
  if (trimmed.length > 400) throw new Error("Keep the question under 400 characters.");
  const plan = await planResearch(trimmed);
  const { tweets, demo } = await runQueries(plan);
  const brief = await writeResearchBrief(trimmed, plan, tweets, demo);
  return {
    question: trimmed,
    plan,
    brief,
    hits: tweets.map(toHit),
    demo,
    grok: plan.grok && isGrokConfigured(),
  };
}
