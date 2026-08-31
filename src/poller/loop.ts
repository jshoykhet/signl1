import {
  DEMO_INJECT_INTERVAL_MS,
  isDemoMode,
  POLLER_TICK_MS,
  xBearerToken,
} from "../lib/config";
import {
  getDb,
  getMeta,
  listEnabledRules,
  markRulePolled,
  setMeta,
  tryInsertMatch,
} from "../lib/db";
import { DEMO_FIXTURES, fixtureToTweet } from "../lib/demo-fixtures";
import { notifyMatch } from "../lib/notify";
import { matchesQuery } from "../lib/query";
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

async function ingestTweet(rule: Rule, tweet: NormalizedTweet): Promise<boolean> {
  const result = tryInsertMatch(rule, tweet);
  if (!result.inserted) return false;
  const notifyErrors = await notifyMatch(rule, tweet);
  if (notifyErrors.length) {
    console.warn(`[poller] notify failed for ${rule.name}: ${notifyErrors.join("; ")}`);
  }
  return true;
}

async function pollLiveRule(rule: Rule, token: string, limiter: XRateLimiter) {
  const startTime = rule.lastSinceId ? null : rule.createdAt;
  try {
    const result = await recentSearch({
      bearerToken: token,
      query: rule.query,
      sinceId: rule.lastSinceId,
      startTime,
      limiter,
    });
    let newest = rule.lastSinceId;
    for (const tweet of result.tweets) {
      await ingestTweet(rule, tweet);
      if (!newest || BigInt(tweet.id) > BigInt(newest)) newest = tweet.id;
    }
    if (result.newestId && (!newest || BigInt(result.newestId) > BigInt(newest))) {
      newest = result.newestId;
    }
    markRulePolled(rule.id, {
      lastPolledAt: isoNow(),
      lastSinceId: newest,
      lastError: null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    markRulePolled(rule.id, { lastPolledAt: isoNow(), lastError: message });
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

  const limiter = new XRateLimiter();
  let lastDemoInject = 0;

  for (;;) {
    try {
      heartbeat(demo ? "demo" : "live");
      if (demo) {
        if (Date.now() - lastDemoInject >= DEMO_INJECT_INTERVAL_MS) {
          await injectDemoMatches();
          lastDemoInject = Date.now();
          recordPoll();
        }
      } else {
        const token = xBearerToken();
        if (!token) throw new Error("X_BEARER_TOKEN missing");
        const rules = listEnabledRules();
        const due = rules.filter((rule) => {
          if (!rule.lastPolledAt) return true;
          return Date.now() - new Date(rule.lastPolledAt).getTime() >= rule.pollIntervalMs;
        });
        for (const rule of due) {
          await pollLiveRule(rule, token, limiter);
        }
        if (due.length) recordPoll();
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[poller] ${message}`);
      recordPoll(message);
    }
    await new Promise((resolve) => setTimeout(resolve, POLLER_TICK_MS));
  }
}
