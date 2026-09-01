export const MIN_FOLLOWERS = 50;
export const MIN_LIKES = 5;
export const MIN_SIGNAL_SCORE = 18;
/** Accounts this large typically draw likes; a brand-new post may still be at 0. */
export const ESTABLISHED_FOLLOWERS = 10_000;
export const FRESH_TWEET_MS = 10 * 60_000;

export type TweetQuality = {
  followersCount: number;
  likeCount: number;
  retweetCount: number;
  replyCount: number;
  quoteCount: number;
  verified: boolean;
  createdAt: string;
};

export type SignalVerdict = {
  pass: boolean;
  score: number;
  reasons: string[];
  establishedFresh: boolean;
};

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

function logScale(value: number, decades: number, weight: number): number {
  if (value <= 0) return 0;
  return clamp((Math.log10(value + 1) / decades) * weight, 0, weight);
}

/**
 * 0–100 score. Account size dominates so desks that never get likes stay low
 * even if a single post scrapes past the like floor.
 */
export function signalScore(q: TweetQuality): number {
  const followScore = logScale(q.followersCount, 6, 50);
  const likeScore = logScale(q.likeCount, 4, 22);
  const spreadScore = logScale(q.retweetCount + q.quoteCount, 3.5, 12);
  const replyScore = logScale(q.replyCount, 3, 6);
  const verifiedBonus = q.verified ? 8 : 0;
  return Math.round(followScore + likeScore + spreadScore + replyScore + verifiedBonus);
}

export function isEstablishedFresh(q: TweetQuality, now = Date.now()): boolean {
  if (q.followersCount < ESTABLISHED_FOLLOWERS) return false;
  const created = new Date(q.createdAt).getTime();
  if (!Number.isFinite(created)) return false;
  const age = now - created;
  return age >= 0 && age < FRESH_TWEET_MS;
}

export function passesSignalFilter(q: TweetQuality, now = Date.now()): SignalVerdict {
  const score = signalScore(q);
  const establishedFresh = isEstablishedFresh(q, now);
  const reasons: string[] = [];

  if (q.followersCount < MIN_FOLLOWERS) {
    reasons.push(`followers ${q.followersCount} < ${MIN_FOLLOWERS}`);
  }

  if (q.likeCount < MIN_LIKES && !establishedFresh) {
    reasons.push(`likes ${q.likeCount} < ${MIN_LIKES}`);
  }

  if (score < MIN_SIGNAL_SCORE && !establishedFresh) {
    reasons.push(`score ${score} < ${MIN_SIGNAL_SCORE}`);
  }

  return { pass: reasons.length === 0, score, reasons, establishedFresh };
}
