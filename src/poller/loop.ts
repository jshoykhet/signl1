import { isDemoMode, POLLER_TICK_MS, xBearerToken } from "../lib/config";
import {
  getDb,
  getDeskCadenceMinutes,
  getMeta,
  getUserMeta,
  listDeskUserIds,
  listEnabledRulesForUser,
  markRulePolled,
  setMeta,
  setUserMeta,
  takeManualPollRequest,
  tryInsertMatch,
  evaluateTweetSignal,
} from "../lib/db";
import { isDigestDue } from "../lib/desk-settings";
import { DEMO_FIXTURES, VENTURE_DEMO_FIXTURES, fixtureToTweet } from "../lib/demo-fixtures";
import { notifyMatch, registerWhatsAppSender, flushWhatsAppDigestForUser } from "../lib/notify";
import { sendWhatsAppText, startWhatsAppBridge } from "./whatsapp-session";
import { matchesQuery } from "../lib/query";
import { batchCursor, combineRuleQueries, packRules } from "../lib/query-pack";
import type { NormalizedTweet, Rule } from "../lib/types";
import { recentSearch, XRateLimiter } from "../lib/x-client";

function isoNow(): string {
  return new Date().toISOString();
}

function heartbeat(mode: "demo" | "live") {
  setMeta("poller_heartbeat_at", isoNow());
  setMeta("poller_mode", mode);
}

function recordPoll(error?: string) {
  setMeta("poller_last_poll_at", isoNow());
  if (error) {
    setMeta("poller_last_error", error);
    setMeta("poller_last_error_at", isoNow());
  } else {
    setMeta("poller_last_error", "");
  }
}

function bumpSearchRequests() {
  const current = Number(getMeta("x_search_requests") ?? "0") || 0;
  setMeta("x_search_requests", String(current + 1));
}

function noteRateLimit(info: { remaining: number | null; limit: number | null; resetAt: number | null }) {
  if (info.remaining != null) setMeta("x_rate_limit_remaining", String(info.remaining));
  if (info.limit != null) setMeta("x_rate_limit_limit", String(info.limit));
  if (info.resetAt != null) setMeta("x_rate_limit_reset_at", new Date(info.resetAt).toISOString());
}

async function ingestTweet(rule: Rule, tweet: NormalizedTweet): Promise<boolean> {
  const verdict = evaluateTweetSignal(tweet, rule.userId || "");
  if (!verdict.pass) return false;
  const result = tryInsertMatch(rule, tweet);
  if (!result.inserted) return false;
  const notifyErrors = await notifyMatch(rule, tweet);
  if (notifyErrors.length) {
    console.warn(`[poller] notify failed for ${rule.name}: ${notifyErrors.join("; ")}`);
  }
  return true;
}

async function pollLiveBatch(rules: Rule[], token: string, limiter: XRateLimiter): Promise<number> {
  const query = combineRuleQueries(rules);
  if (!query) return 0;
  const cursor = batchCursor(rules);
  bumpSearchRequests();
  try {
    const result = await recentSearch({
      bearerToken: token,
      query,
      sinceId: cursor.sinceId,
      startTime: cursor.startTime,
      limiter,
    });
    noteRateLimit(result.rateLimit);
    let newest = cursor.sinceId;
    for (const tweet of result.tweets) {
      for (const rule of rules) {
        if (!matchesQuery(tweet, rule.query)) continue;
        await ingestTweet(rule, tweet);
      }
      if (!newest || BigInt(tweet.id) > BigInt(newest)) newest = tweet.id;
    }
    if (result.newestId && (!newest || BigInt(result.newestId) > BigInt(newest))) {
      newest = result.newestId;
    }
    const polledAt = isoNow();
    for (const rule of rules) {
      markRulePolled(rule.id, {
        lastPolledAt: polledAt,
        lastSinceId: newest,
        lastError: null,
      });
    }
    return result.tweets.length;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const polledAt = isoNow();
    for (const rule of rules) {
      markRulePolled(rule.id, { lastPolledAt: polledAt, lastError: message });
    }
    throw error;
  }
}

function nextDemoIndex(): number {
  const raw = getMeta("demo_index");
  const n = raw ? Number(raw) : 0;
  return Number.isFinite(n) ? n : 0;
}

const DEMO_POOL = [...DEMO_FIXTURES, ...VENTURE_DEMO_FIXTURES];

async function injectDemoMatches(rules: Rule[]) {
  if (rules.length === 0 || DEMO_POOL.length === 0) return;

  const index = nextDemoIndex();
  const cycle = Math.floor(index / DEMO_POOL.length);
  const offset = index % DEMO_POOL.length;

  for (let step = 0; step < DEMO_POOL.length; step += 1) {
    const fixture = DEMO_POOL[(offset + step) % DEMO_POOL.length];
    const tweetId = cycle === 0 ? fixture.id : `${fixture.id}-c${cycle}`;
    const tweet = fixtureToTweet(fixture, tweetId, isoNow());
    let inserted = false;
    for (const rule of rules) {
      if (!matchesQuery(tweet, rule.query)) continue;
      if (await ingestTweet(rule, tweet)) inserted = true;
    }
    setMeta("demo_index", String(index + step + 1));
    if (inserted) {
      for (const rule of rules) {
        if (matchesQuery(tweet, rule.query)) {
          markRulePolled(rule.id, { lastPolledAt: isoNow(), lastError: null });
        }
      }
      return;
    }
  }
  setMeta("demo_index", String(index + DEMO_POOL.length));
}

async function pollUserDesk(userId: string, demo: boolean, token: string | null, limiter: XRateLimiter) {
  const rules = listEnabledRulesForUser(userId);
  if (demo) {
    await injectDemoMatches(rules);
  } else {
    if (!token) throw new Error("X_BEARER_TOKEN missing");
    if (rules.length) {
      const batches = packRules(rules);
      setMeta("x_last_packed_queries", String(batches.length));
      let tweets = 0;
      for (const batch of batches) {
        tweets += await pollLiveBatch(batch, token, limiter);
      }
      if (batches.length) {
        console.log(
          `[poller] ${userId.slice(0, 8)} packed ${rules.length} rules into ${batches.length} search${batches.length === 1 ? "" : "es"}; ${tweets} tweet${tweets === 1 ? "" : "s"}`,
        );
      }
    }
  }
  setUserMeta(userId, "inbox_last_polled_at", isoNow());
  try {
    const sent = await flushWhatsAppDigestForUser(userId, new Date(), true);
    if (sent) console.log("[whatsapp] digest sent");
  } catch (error) {
    console.error(`[whatsapp] digest failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export async function runPollerLoop() {
  getDb();
  const demo = isDemoMode();
  setMeta("poller_started_at", isoNow());
  heartbeat(demo ? "demo" : "live");
  console.log(`[poller] starting in ${demo ? "DEMO" : "LIVE"} mode`);
  registerWhatsAppSender(sendWhatsAppText);
  void startWhatsAppBridge().catch((error) => {
    console.error("[whatsapp] bridge failed to start", error);
  });

  const limiter = new XRateLimiter();

  for (;;) {
    try {
      heartbeat(demo ? "demo" : "live");
      const forced = takeManualPollRequest();
      if (forced) console.log("[poller] manual re-poll requested");
      const token = demo ? null : xBearerToken();
      if (!demo && !token) throw new Error("X_BEARER_TOKEN missing");
      let didPoll = false;
      for (const userId of listDeskUserIds()) {
        const minutes = getDeskCadenceMinutes(userId);
        const lastAt = getUserMeta(userId, "inbox_last_polled_at");
        if (!forced && !isDigestDue(lastAt, minutes)) continue;
        await pollUserDesk(userId, demo, token, limiter);
        didPoll = true;
      }
      if (didPoll) recordPoll();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.startsWith("X API rate limited")) {
        console.warn(`[poller] ${message}`);
      } else {
        console.error(`[poller] ${message}`);
      }
      recordPoll(message);
    }
    await new Promise((resolve) => setTimeout(resolve, POLLER_TICK_MS));
  }
}
