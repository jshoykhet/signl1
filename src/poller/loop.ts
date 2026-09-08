import { isDemoMode, POLLER_TICK_MS, xBearerToken } from "../lib/config";
import {
  getDb,
  getDeskCadenceMinutes,
  getMeta,
  getUserMeta,
  listDeskUserIds,
  listEnabledRulesForUser,
  markRulePolled,
  resetAccountWatchCursors,
  setMeta,
  setUserMeta,
  takeManualPollRequest,
  tryInsertMatch,
  evaluateTweetSignal,
} from "../lib/db";
import { isDigestDue } from "../lib/desk-settings";
import { DEMO_FIXTURES, VENTURE_DEMO_FIXTURES, fixtureToTweet } from "../lib/demo-fixtures";
import { notifyMatch } from "../lib/notify";
import { startWhatsAppBridge } from "./whatsapp-session";
import { isWatchedAuthor, matchesQuery } from "../lib/query";
import { batchIsAccountWatch, indexRulesByQuery, packQueryGroups, searchWindow } from "../lib/query-pack";
import { estimateReadUsd, searchLookbackMs } from "../lib/x-cost";
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

function recordSearchCost(posts: number, users: number) {
  const nextPosts = (Number(getMeta("x_posts_read") ?? "0") || 0) + posts;
  const nextUsers = (Number(getMeta("x_users_read") ?? "0") || 0) + users;
  setMeta("x_posts_read", String(nextPosts));
  setMeta("x_users_read", String(nextUsers));
  setMeta("x_last_poll_posts", String(posts));
  setMeta("x_last_poll_users", String(users));
  setMeta("x_estimated_cost_usd", estimateReadUsd(nextPosts, nextUsers).toFixed(4));
  setMeta("x_last_poll_cost_usd", estimateReadUsd(posts, users).toFixed(4));
}

function noteRateLimit(info: { remaining: number | null; limit: number | null; resetAt: number | null }) {
  if (info.remaining != null) setMeta("x_rate_limit_remaining", String(info.remaining));
  if (info.limit != null) setMeta("x_rate_limit_limit", String(info.limit));
  if (info.resetAt != null) setMeta("x_rate_limit_reset_at", new Date(info.resetAt).toISOString());
}

async function ingestTweet(rule: Rule, tweet: NormalizedTweet): Promise<boolean> {
  const verdict = evaluateTweetSignal(tweet, rule.userId || "", undefined, {
    watchedAuthor: isWatchedAuthor(rule.accounts, tweet.authorHandle),
  });
  if (!verdict.pass) return false;
  const result = tryInsertMatch(rule, tweet);
  if (!result.inserted) return false;
  const notifyErrors = await notifyMatch(rule, tweet);
  if (notifyErrors.length) {
    console.warn(`[poller] notify failed for ${rule.name}: ${notifyErrors.join("; ")}`);
  }
  return true;
}

async function pollLiveBatch(
  query: string,
  rules: Rule[],
  token: string,
  limiter: XRateLimiter,
  window: { sinceId: string | null; startTime: string | null },
): Promise<{ tweets: number; users: number }> {
  if (!query || rules.length === 0) return { tweets: 0, users: 0 };
  bumpSearchRequests();
  try {
    const result = await recentSearch({
      bearerToken: token,
      query,
      sinceId: window.sinceId,
      startTime: window.startTime,
      limiter,
    });
    noteRateLimit(result.rateLimit);
    let newest = window.sinceId;
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
    return { tweets: result.tweets.length, users: result.usersRead };
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

async function finishUserWindow(userId: string) {
  setUserMeta(userId, "inbox_last_polled_at", isoNow());
}

async function pollDemoDesk(userId: string) {
  await injectDemoMatches(listEnabledRulesForUser(userId));
  await finishUserWindow(userId);
}

async function pollLiveShared(
  due: Array<{ userId: string; minutes: number }>,
  token: string,
  limiter: XRateLimiter,
) {
  const cleared = resetAccountWatchCursors();
  if (cleared) console.log(`[poller] reset ${cleared} account-watch cursor${cleared === 1 ? "" : "s"} for 6h lookback`);
  const rules = due.flatMap((item) => listEnabledRulesForUser(item.userId));
  if (rules.length) {
    const batches = packQueryGroups(indexRulesByQuery(rules));
    setMeta("x_last_packed_queries", String(batches.length));
    const cadenceMinutes = Math.max(...due.map((item) => item.minutes));
    let posts = 0;
    let users = 0;
    for (const batch of batches) {
      const lookbackMs = searchLookbackMs(cadenceMinutes, {
        accountWatch: batchIsAccountWatch(batch.rules),
      });
      const result = await pollLiveBatch(
        batch.query,
        batch.rules,
        token,
        limiter,
        searchWindow(batch.rules, lookbackMs),
      );
      posts += result.tweets;
      users += result.users;
    }
    recordSearchCost(posts, users);
    const hqs = new Set(rules.map((rule) => rule.userId).filter(Boolean)).size;
    console.log(
      `[poller] shared ${due.length} HQ${due.length === 1 ? "" : "s"} (${hqs} with rules) into ${batches.length} search${batches.length === 1 ? "" : "es"}; ${posts} tweet${posts === 1 ? "" : "s"}`,
    );
  } else {
    recordSearchCost(0, 0);
  }
  for (const { userId } of due) {
    await finishUserWindow(userId);
  }
}

export async function runPollerLoop() {
  getDb();
  const demo = isDemoMode();
  setMeta("poller_started_at", isoNow());
  heartbeat(demo ? "demo" : "live");
  console.log(`[poller] starting in ${demo ? "DEMO" : "LIVE"} mode`);
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
      const due: Array<{ userId: string; minutes: number }> = [];
      for (const userId of listDeskUserIds()) {
        const minutes = getDeskCadenceMinutes(userId);
        const lastAt = getUserMeta(userId, "inbox_last_polled_at");
        if (!forced && !isDigestDue(lastAt, minutes)) continue;
        due.push({ userId, minutes });
      }
      if (due.length) {
        if (demo) {
          for (const { userId } of due) {
            await pollDemoDesk(userId);
          }
        } else {
          await pollLiveShared(due, token as string, limiter);
        }
        recordPoll();
      }
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
