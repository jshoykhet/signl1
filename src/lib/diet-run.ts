import { isDemoMode, xBearerToken } from "./config";
import { analyzeDiet, parseXHandle, type DietReport } from "./diet";
import { demoDietTweets } from "./diet-demo";
import { recentSearch, XRateLimiter } from "./x-client";

const limiter = new XRateLimiter();

export async function runDiet(rawHandle: string): Promise<DietReport> {
  const handle = parseXHandle(rawHandle);
  if (!handle) throw new Error("Enter an X handle — letters, numbers, underscore, max 15.");
  if (isDemoMode() || !xBearerToken()) {
    const sample = demoDietTweets(handle);
    return analyzeDiet(handle, sample.own, sample.inbound, { demo: true, windowDays: 7 });
  }
  const token = xBearerToken()!;
  const startTime = new Date(Date.now() - 7 * 24 * 60 * 60_000).toISOString();
  const own = await recentSearch({
    bearerToken: token,
    query: `from:${handle}`,
    startTime,
    limiter,
  });
  const inbound = await recentSearch({
    bearerToken: token,
    query: `(@${handle} OR to:${handle}) -from:${handle}`,
    startTime,
    limiter,
  });
  return analyzeDiet(handle, own.tweets, inbound.tweets, { demo: false, windowDays: 7 });
}
