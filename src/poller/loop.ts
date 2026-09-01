import {
  DEMO_INJECT_INTERVAL_MS,
  isDemoMode,
  LIVE_IDLE_BACKOFF_CAP_MS,
  POLLER_TICK_MS,
  xBearerToken,
} from "../lib/config";
import {
  getDb,
  getMeta,
  listEnabledRules,
  markRulePolled,
  setMeta,
  takeManualPollRequest,
  tryInsertMatch,
  evaluateTweetSignal,
} from "../lib/db";
import { DEMO_FIXTURES, fixtureToTweet } from "../lib/demo-fixtures";
import { notifyMatch, registerWhatsAppSender } from "../lib/notify";
import { sendWhatsAppText, startWhatsAppBridge } from "./whatsapp-session";
import { matchesQuery } from "../lib/query";
import {
  batchCursor,
  combineRuleQueries,
  isLivePackDue,
  nextIdleBackoffMs,
  packRules,
} from "../lib/query-pack";
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
  const verdict = evaluateTweetSignal(tweet);
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

async function injectDemoMatches() {
  const rules = listEnabledRules();
  if (rules.length === 0 || DEMO_FIXTURES.length === 0) return;

  const index = nextDemoIndex();
  const cycle = Math.floor(index / DEMO_FIXTURES.length);
  const offset = index % DEMO_FIXTURES.length;

  for (let step = 0; step < DEMO_FIXTURES.length; step += 1) {
    const fixture = DEMO_FIXTURES[(offset + step) % DEMO_FIXTURES.length];
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
  setMeta("demo_index", String(index + DEMO_FIXTURES.length));
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
  let lastDemoInject = 0;

  for (;;) {
    try {
      heartbeat(demo ? "demo" : "live");
      const forced = takeManualPollRequest();
      if (forced) {
        setMeta("poller_idle_backoff_ms", "0");
        console.log("[poller] manual re-poll requested");
      }
      if (demo) {
        if (forced || Date.now() - lastDemoInject >= DEMO_INJECT_INTERVAL_MS) {
          await injectDemoMatches();
          lastDemoInject = Date.now();
          recordPoll();
        }
      } else {
        const token = xBearerToken();
        if (!token) throw new Error("X_BEARER_TOKEN missing");
        const rules = listEnabledRules();
        const idleBackoffMs = forced ? 0 : Number(getMeta("poller_idle_backoff_ms") ?? "0") || 0;
        if (forced || isLivePackDue(rules, Date.now(), idleBackoffMs)) {
          const batches = packRules(rules);
          setMeta("x_last_packed_queries", String(batches.length));
          let tweets = 0;
          for (const batch of batches) {
            tweets += await pollLiveBatch(batch, token, limiter);
          }
          const nextBackoff = nextIdleBackoffMs(idleBackoffMs, tweets, LIVE_IDLE_BACKOFF_CAP_MS);
          setMeta("poller_idle_backoff_ms", String(nextBackoff));
          if (batches.length) {
            console.log(
              `[poller] packed ${rules.length} rules into ${batches.length} search${batches.length === 1 ? "" : "es"}; ${tweets} tweet${tweets === 1 ? "" : "s"}`,
            );
          }
          recordPoll();
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[poller] ${message}`);
      recordPoll(message);
    }
    await new Promise((resolve) => setTimeout(resolve, POLLER_TICK_MS));
  }
}
