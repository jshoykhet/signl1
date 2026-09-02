/**
 * Venture-desk scoring: funding, launches, M&A, and sourced tech
 * announcements — not founder lifestyle, dunks, or "AI is the future" vibes.
 */

export type VentureScore = {
  score: number;
  spam: boolean;
  reasons: string[];
  substance: boolean;
};

const SPAM =
  /\b(giveaway|airdrop|whitelist|wl spot|mint now|nft drop|follow and rt|like and retweet|dm me for|signal group|guaranteed returns|100x gem|to the moon 🚀🚀|free course|tag 3 friends|drop a like|comment yes)\b/i;

const LIFESTYLE =
  /\b(good morning|beautiful morning|coffee with|dinner with|long walk|gym sesh|what a view|love this photo|birthday|vacation|rest in peace|\brip\b|congrats on|proud of this team|office dogs?|offsite)\b/i;

const DUNK =
  /\b(ratio(?:ed|['’]d)?|l take|w take|this you\b|imagine thinking|let him cook|ngmi|wagmi|this is the way|so true\b|touched grass|get a load of|ratio this)\b/i;

const FLASH = /\b(breaking|just in|flash|developing|urgent|exclusive|scoop)\b/i;

type Weighted = { re: RegExp; w: number };

const STRONG: Weighted[] = [
  {
    re: /\b(series [a-f]\b|pre-seed|seed round|seed extension|priced round|bridge round|first close|led the round|co-led|participated in the|inside round)\b/i,
    w: 14,
  },
  {
    re: /\b(raised|raising|raises|funding round|term sheet|post-money|pre-money|unicorn|decacorn|valuation)\b/i,
    w: 12,
  },
  {
    re: /\b(acquires|acquired by|acquisition|merger|take-private|tender offer|spin[- ]?off)\b/i,
    w: 12,
  },
  {
    re: /\b(ipo|s-1|direct listing|goes public|debuts on|spac)\b/i,
    w: 12,
  },
  {
    re: /\b(comes out of stealth|out of stealth|product launch|launches|launched|general availability|\bga\b|open sourced|open-sourced|demo day)\b/i,
    w: 12,
  },
  {
    re: /\b(yc\b|y combinator|product hunt|#1 (?:on )?product hunt)\b/i,
    w: 10,
  },
];

const WEAK: Weighted[] = [
  {
    re: /\b(startup|startups|founder|founders|venture|vc\b|saas|ai\b|llm|infra|enterprise|fintech|climate tech|deep tech)\b/i,
    w: 6,
  },
  {
    re: /\b(portfolio|lp\b|gps?\b|batch|accelerator|incubator)\b/i,
    w: 6,
  },
];

const NEWS: Weighted[] = [
  {
    re: /\b(according to|sources (?:say|said|tell|told)|people familiar|reports that|reported that|per (?:techcrunch|the information|axios|pitchbook)|announces|announced|confirmed)\b/i,
    w: 12,
  },
  {
    re: /\b(exclusive|scoop|filed|unveils|unveiled|introduces|introduced)\b/i,
    w: 10,
  },
];

const ANALYSIS: Weighted[] = [
  {
    re: /\b(thesis|why (?:we're|we are) (?:excited|in)|our take|the stack|here's why this matters|the market for|tam\b|bottleneck|founder-led)\b/i,
    w: 12,
  },
  {
    re: /\b(deal flow|mega-rounds?|pricing power|go-to-market|gtm\b|net-new|category-defining)\b/i,
    w: 8,
  },
];

const MARKET_NOUN =
  /\b(round|raise|raised|funding|valuation|startup|saas|ai\b|infra|enterprise|seed|series|stealth|launch|acquisition|ipo|term sheet)\b/i;

const CASHTAG = /\$[A-Z]{1,6}\b/g;
const PCT = /[+\-]?\d+(?:\.\d+)?\s?%/;
const BIG_NUMBER =
  /(?:\$\s?\d+(?:\.\d+)?\s?(?:bn|b|mm|m|k|trillion|billion|million)\b|\b\d+(?:\.\d+)?\s?(?:bps|bp|billion|million|trillion)\b)/i;

function hitsOf(text: string, list: Weighted[], reason: string, reasons: string[]): number {
  let score = 0;
  for (const { re, w } of list) {
    if (re.test(text)) {
      score += w;
      reasons.push(reason);
    }
  }
  return score;
}

export function scoreVentureRelevance(text: string, opts: { isReply?: boolean } = {}): VentureScore {
  const t = text.trim();
  if (!t) return { score: 0, spam: false, reasons: [], substance: false };
  if (SPAM.test(t)) return { score: 0, spam: true, reasons: ["promo/spam phrasing"], substance: false };

  const reasons: string[] = [];
  const cashtags = t.match(CASHTAG) ?? [];
  const hasCashtag = cashtags.length > 0;
  const hasPct = PCT.test(t);
  const hasSize = BIG_NUMBER.test(t);
  const hasNumber = hasPct || hasSize;
  const hasFlash = FLASH.test(t);
  const hasMarketNoun = MARKET_NOUN.test(t);

  const strongScore = hitsOf(t, STRONG, "catalyst", reasons);
  const weakScore = hitsOf(t, WEAK, "context", reasons);
  const newsScore = hitsOf(t, NEWS, "news", reasons);
  const analysisScore = hitsOf(t, ANALYSIS, "analysis", reasons);

  const hasStrong = strongScore > 0;
  const hasNews = newsScore > 0;
  const hasAnalysis = analysisScore > 0;
  const hasPayload = hasNumber && (hasCashtag || hasMarketNoun || hasStrong || hasNews);
  const substance = hasStrong || hasNews || hasAnalysis || hasPayload;

  if (LIFESTYLE.test(t) && !substance) {
    return { score: 0, spam: false, reasons: [], substance: false };
  }
  if (DUNK.test(t) && !substance) {
    return { score: 0, spam: false, reasons: ["dunk"], substance: false };
  }

  const words = t.split(/\s+/).filter(Boolean).length;
  if (opts.isReply && words < 14 && !substance) {
    return { score: 0, spam: false, reasons: ["reply dunk"], substance: false };
  }

  let score = strongScore + newsScore + analysisScore;

  if (hasFlash) {
    score += substance ? 12 : 4;
    reasons.push("flash");
  }
  if (hasCashtag && substance) {
    score += 8;
    reasons.push("cashtag");
  }
  if (hasPct && substance) {
    score += 6;
    reasons.push("percent move");
  }
  if (hasSize && substance) {
    score += 6;
    reasons.push("sized number");
  }
  if (weakScore && substance) {
    score += weakScore;
  } else if (weakScore && !substance) {
    score += Math.min(weakScore, 5);
    reasons.push("weak context");
  }

  if (DUNK.test(t) && substance) score = Math.max(0, score - 8);

  if (!substance) {
    score = Math.min(score, 3);
  }

  return { score, spam: false, reasons, substance };
}
