import { X_MAX_RESULTS, X_MIN_REQUEST_GAP_MS, X_SEARCH_URL, X_SEARCH_URL_FALLBACK } from "./config";
import type { NormalizedTweet } from "./types";

export type RateLimitInfo = {
  remaining: number | null;
  limit: number | null;
  resetAt: number | null;
};

export type RecentSearchResult = {
  tweets: NormalizedTweet[];
  newestId: string | null;
  resultCount: number;
  rateLimit: RateLimitInfo;
  status: number;
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function headerInt(headers: Headers, name: string): number | null {
  const raw = headers.get(name);
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

/** Cap so a far-future X reset header cannot freeze the poller (and WhatsApp) for hours. */
export const X_RATE_LIMIT_WAIT_CAP_MS = 5_000;

export class XRateLimiter {
  remaining: number | null = null;
  resetAt: number | null = null;
  nextAllowedAt = 0;
  backoffUntil = 0;
  backoffMs = 1_000;

  expireWindow(now = Date.now()) {
    if (this.resetAt && now >= this.resetAt) {
      this.remaining = null;
      this.resetAt = null;
    }
    if (this.backoffUntil && now >= this.backoffUntil) {
      this.backoffUntil = 0;
    }
  }

  isWindowExhausted(now = Date.now()): boolean {
    this.expireWindow(now);
    return this.remaining !== null && this.remaining <= 0 && this.resetAt != null && this.resetAt > now;
  }

  async waitForSlot(): Promise<void> {
    const now = Date.now();
    this.expireWindow(now);
    if (this.isWindowExhausted(now)) {
      const secs = Math.max(1, Math.ceil((this.resetAt! - now) / 1000));
      throw new Error(`X API rate limited; ${secs}s until window reset`);
    }
    const wait = Math.max(0, this.nextAllowedAt - now, this.backoffUntil - now);
    if (wait > 0) await sleep(Math.min(wait, X_RATE_LIMIT_WAIT_CAP_MS));
    this.nextAllowedAt = Date.now() + X_MIN_REQUEST_GAP_MS;
  }

  noteHeaders(headers: Headers) {
    this.remaining = headerInt(headers, "x-rate-limit-remaining");
    const reset = headerInt(headers, "x-rate-limit-reset");
    this.resetAt = reset ? reset * 1000 : this.resetAt;
    this.backoffMs = 1_000;
    this.backoffUntil = 0;
  }

  note429(headers: Headers) {
    const retryAfter = headerInt(headers, "retry-after");
    const reset = headerInt(headers, "x-rate-limit-reset");
    const untilHeader = retryAfter != null ? Date.now() + retryAfter * 1000 : reset ? reset * 1000 : 0;
    this.backoffMs = Math.min(this.backoffMs * 2, 15 * 60_000);
    this.backoffUntil = Math.max(untilHeader, Date.now() + this.backoffMs);
    this.remaining = 0;
    if (reset) this.resetAt = reset * 1000;
  }

  noteError() {
    this.backoffMs = Math.min(this.backoffMs * 2, 5 * 60_000);
    this.backoffUntil = Date.now() + this.backoffMs;
  }
}

function parseSearchPayload(payload: unknown): { tweets: NormalizedTweet[]; newestId: string | null; resultCount: number } {
  const body = payload as {
    data?: Array<{
      id: string;
      text: string;
      author_id?: string;
      created_at?: string;
      lang?: string;
      public_metrics?: {
        like_count?: number;
        retweet_count?: number;
        reply_count?: number;
        quote_count?: number;
      };
    }>;
    includes?: {
      users?: Array<{
        id: string;
        username: string;
        name?: string;
        verified?: boolean;
        public_metrics?: { followers_count?: number };
      }>;
    };
    meta?: { newest_id?: string; result_count?: number };
  };
  const users = new Map((body.includes?.users ?? []).map((u) => [u.id, u]));
  const tweets: NormalizedTweet[] = (body.data ?? []).map((tweet) => {
    const user = tweet.author_id ? users.get(tweet.author_id) : undefined;
    const handle = user?.username ?? "unknown";
    const metrics = tweet.public_metrics ?? {};
    return {
      id: tweet.id,
      authorHandle: handle,
      authorName: user?.name ?? handle,
      text: tweet.text,
      createdAt: tweet.created_at ?? new Date().toISOString(),
      lang: tweet.lang ?? "und",
      isRetweet: tweet.text.startsWith("RT @"),
      isReply: false,
      permalink: `https://x.com/${handle}/status/${tweet.id}`,
      raw: {
        tweet,
        author: user ?? null,
      },
      followersCount: user?.public_metrics?.followers_count ?? 0,
      likeCount: metrics.like_count ?? 0,
      retweetCount: metrics.retweet_count ?? 0,
      replyCount: metrics.reply_count ?? 0,
      quoteCount: metrics.quote_count ?? 0,
      verified: Boolean(user?.verified),
    };
  });
  return {
    tweets,
    newestId: body.meta?.newest_id ?? tweets[0]?.id ?? null,
    resultCount: body.meta?.result_count ?? tweets.length,
  };
}

const X_FETCH_TIMEOUT_MS = 15_000;

async function readBody(res: Response): Promise<string> {
  return res.text();
}

export async function recentSearch(opts: {
  bearerToken: string;
  query: string;
  sinceId?: string | null;
  startTime?: string | null;
  limiter: XRateLimiter;
}): Promise<RecentSearchResult> {
  await opts.limiter.waitForSlot();

  const params = new URLSearchParams({
    query: opts.query,
    max_results: String(X_MAX_RESULTS),
    "tweet.fields": "created_at,author_id,lang,public_metrics",
    expansions: "author_id",
    "user.fields": "username,name,verified,public_metrics",
  });
  if (opts.sinceId) params.set("since_id", opts.sinceId);
  else if (opts.startTime) params.set("start_time", opts.startTime);

  const headers = {
    authorization: `Bearer ${opts.bearerToken}`,
    "user-agent": "signal-selfhost/1.0",
  };
  const primary = `${X_SEARCH_URL}?${params.toString()}`;
  const fallback = `${X_SEARCH_URL_FALLBACK}?${params.toString()}`;

  const signal = AbortSignal.timeout(X_FETCH_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(primary, { headers, signal });
    if (res.status === 404 || res.status === 530) {
      res = await fetch(fallback, { headers, signal });
    }
  } catch (error) {
    if (signal.aborted) {
      opts.limiter.noteError();
      throw new Error("X API request timed out after 15s");
    }
    try {
      res = await fetch(fallback, { headers, signal: AbortSignal.timeout(X_FETCH_TIMEOUT_MS) });
    } catch {
      opts.limiter.noteError();
      throw error instanceof Error ? error : new Error(String(error));
    }
  }

  const raw = await readBody(res);
  const rateLimit: RateLimitInfo = {
    remaining: headerInt(res.headers, "x-rate-limit-remaining"),
    limit: headerInt(res.headers, "x-rate-limit-limit"),
    resetAt: (() => {
      const reset = headerInt(res.headers, "x-rate-limit-reset");
      return reset ? reset * 1000 : null;
    })(),
  };

  if (res.status === 429) {
    opts.limiter.note429(res.headers);
    throw new Error(`X API rate limited (429). ${raw.slice(0, 200)}`);
  }
  if (!res.ok) {
    opts.limiter.noteError();
    throw new Error(`X API ${res.status}: ${raw.slice(0, 300)}`);
  }

  opts.limiter.noteHeaders(res.headers);
  let payload: unknown = {};
  try {
    payload = raw ? JSON.parse(raw) : {};
  } catch {
    opts.limiter.noteError();
    throw new Error("X API returned invalid JSON");
  }
  const parsed = parseSearchPayload(payload);
  return { ...parsed, rateLimit, status: res.status };
}
