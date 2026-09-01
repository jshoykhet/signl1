import { scoreDeskRelevance } from "./desk-relevance";
import { SIGNAL_LEVELS, type SignalLevel } from "./desk-settings";
import { isKolHandle } from "./kol";

export const MIN_FOLLOWERS = 50;
export const MIN_LIKES = 5;
export const MIN_SIGNAL_SCORE = 18;
/** Accounts this large typically draw likes; a brand-new post may still be at 0. */
export const ESTABLISHED_FOLLOWERS = 10_000;
export const FRESH_TWEET_MS = 10 * 60_000;
/** After this many net-low labels, new posts from the author are dropped. */
export const SUPPRESS_LOW_LABELS = 2;
/** After this many net-high labels, floors are relaxed for the author. */
export const BOOST_HIGH_LABELS = 2;
const PRIOR_SCORE_WEIGHT = 30;
export const MIN_DESK_SCORE = 12;
export const KOL_MIN_DESK_SCORE = 4;
export const BOOST_MIN_DESK_SCORE = 8;
export const ESTABLISHED_MIN_DESK_SCORE = 8;
export const KOL_SCORE_BONUS = 22;

export type UserLabel = "high" | "low";

export type AuthorPrior = {
  high: number;
  low: number;
};

export type TweetQuality = {
  followersCount: number;
  likeCount: number;
  retweetCount: number;
  replyCount: number;
  quoteCount: number;
  verified: boolean;
  createdAt: string;
  text?: string;
  authorHandle?: string;
};

export type SignalContext = {
  userLabel?: UserLabel | null;
  prior?: AuthorPrior | null;
  kolOnly?: boolean;
  signalLevel?: SignalLevel;
  allowFresh?: boolean;
  requireEngagement?: boolean;
  minLikes?: number | null;
  kol?: boolean;
  blocked?: boolean;
};

export type PriorAdjustment = {
  scoreDelta: number;
  suppress: boolean;
  boost: boolean;
  net: number;
};

export type SignalVerdict = {
  pass: boolean;
  score: number;
  reasons: string[];
  establishedFresh: boolean;
  userLabel: UserLabel | null;
  prior: PriorAdjustment;
  kol: boolean;
  deskScore: number;
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

export function isEstablishedFresh(q: TweetQuality, now = Date.now(), freshMs = FRESH_TWEET_MS): boolean {
  if (q.followersCount < ESTABLISHED_FOLLOWERS) return false;
  const created = new Date(q.createdAt).getTime();
  if (!Number.isFinite(created)) return false;
  const age = now - created;
  return age >= 0 && age < freshMs;
}

export function priorAdjustment(prior: AuthorPrior | null | undefined): PriorAdjustment {
  const high = prior?.high ?? 0;
  const low = prior?.low ?? 0;
  const n = high + low;
  if (n === 0) {
    return { scoreDelta: 0, suppress: false, boost: false, net: 0 };
  }
  const net = high - low;
  const rate = net / (n + 2);
  return {
    scoreDelta: Math.round(rate * PRIOR_SCORE_WEIGHT),
    suppress: low >= SUPPRESS_LOW_LABELS && low > high,
    boost: high >= BOOST_HIGH_LABELS && high > low,
    net,
  };
}

export function deskFloor(
  q: TweetQuality,
  opts: { kol: boolean; boost: boolean; signalLevel?: SignalLevel },
): number {
  const level = SIGNAL_LEVELS[opts.signalLevel ?? "standard"];
  if (opts.kol) return level.kolMinDesk;
  if (opts.boost) return Math.min(BOOST_MIN_DESK_SCORE, level.minDesk);
  if (q.followersCount >= ESTABLISHED_FOLLOWERS || q.verified) return level.establishedMinDesk;
  return level.minDesk;
}

export function passesSignalFilter(
  q: TweetQuality,
  now = Date.now(),
  ctx: SignalContext = {},
): SignalVerdict {
  const prior = priorAdjustment(ctx.prior);
  const userLabel = ctx.userLabel === "high" || ctx.userLabel === "low" ? ctx.userLabel : null;
  const kol = ctx.kol ?? isKolHandle(q.authorHandle);
  const blocked = ctx.blocked === true;
  const level = SIGNAL_LEVELS[ctx.signalLevel ?? "standard"];
  const allowFresh = ctx.allowFresh !== false;
  const requireEngagement = ctx.requireEngagement === true;
  const kolOnly = ctx.kolOnly === true;
  const desk = scoreDeskRelevance(q.text ?? "");
  const baseScore = signalScore(q);
  const score = clamp(baseScore + prior.scoreDelta + (kol ? KOL_SCORE_BONUS : 0), 0, 100);
  const establishedFresh = isEstablishedFresh(q, now, level.freshMs);
  const reasons: string[] = [];

  if (blocked) {
    return {
      pass: false,
      score,
      reasons: ["blocked"],
      establishedFresh,
      userLabel,
      prior,
      kol,
      deskScore: desk.score,
    };
  }

  if (userLabel === "high") {
    return {
      pass: true,
      score,
      reasons: ["labeled high"],
      establishedFresh,
      userLabel,
      prior,
      kol,
      deskScore: desk.score,
    };
  }
  if (userLabel === "low") {
    return {
      pass: false,
      score,
      reasons: ["labeled low"],
      establishedFresh,
      userLabel,
      prior,
      kol,
      deskScore: desk.score,
    };
  }
  if (prior.suppress) {
    return {
      pass: false,
      score,
      reasons: [`author prior ${prior.net} (${ctx.prior?.high ?? 0} high / ${ctx.prior?.low ?? 0} low)`],
      establishedFresh,
      userLabel,
      prior,
      kol,
      deskScore: desk.score,
    };
  }

  if (desk.spam) {
    return {
      pass: false,
      score,
      reasons: desk.reasons,
      establishedFresh,
      userLabel,
      prior,
      kol,
      deskScore: 0,
    };
  }

  if (kolOnly && !kol) {
    return {
      pass: false,
      score,
      reasons: ["not a key network node"],
      establishedFresh,
      userLabel,
      prior,
      kol,
      deskScore: desk.score,
    };
  }

  const skipFloors =
    prior.boost ||
    (!requireEngagement && ((allowFresh && establishedFresh) || kol));
  const minDesk = deskFloor(q, { kol, boost: prior.boost, signalLevel: ctx.signalLevel });
  const minLikes = typeof ctx.minLikes === "number" ? ctx.minLikes : level.minLikes;
  // Level default still lets nodes / fresh desks skip likes. A number the operator
  // picks is a hard floor for everyone (except labeled-high / blocked).
  const skipLikeFloor = skipFloors && typeof ctx.minLikes !== "number";

  if (q.followersCount < level.minFollowers && !prior.boost && !kol) {
    reasons.push(`followers ${q.followersCount} < ${level.minFollowers}`);
  }

  if (q.likeCount < minLikes && !skipLikeFloor) {
    reasons.push(`likes ${q.likeCount} < ${minLikes}`);
  }

  if (score < level.minScore && !skipFloors) {
    reasons.push(`score ${score} < ${level.minScore}`);
  }

  if (desk.score < minDesk) {
    reasons.push(`desk ${desk.score} < ${minDesk}`);
  }

  if (kol) reasons.push("node");

  return {
    pass: reasons.filter((r) => r !== "node").length === 0,
    score,
    reasons,
    establishedFresh,
    userLabel,
    prior,
    kol,
    deskScore: desk.score,
  };
}
