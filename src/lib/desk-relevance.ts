import type { DeskMode } from "./desk-mode";
import { scoreVentureRelevance } from "./venture-relevance";

/**
 * Scores whether a tweet is the kind of thing an event-driven trader,
 * fundamental investor, or market maker would actually want on the tape:
 * sourced news, prints vs expectations, or an analytical take — not
 * cashtag-only chatter, vibe posts, or quote dunks.
 */

const SPAM =
  /\b(giveaway|airdrop|whitelist|wl spot|mint now|nft drop|follow and rt|like and retweet|dm me for|signal group|guaranteed returns|100x gem|to the moon 🚀🚀|free course|tag 3 friends|drop a like|comment yes)\b/i;

const LIFESTYLE =
  /\b(good morning|beautiful morning|coffee with|dinner with|long walk|gym sesh|what a view|love this photo|birthday|vacation|rest in peace|\brip\b|congrats on)\b/i;

const DUNK =
  /\b(ratio(?:ed|['’]d)?|l take|w take|this you\b|imagine thinking|let him cook|ngmi|wagmi|this is the way|so true\b|touched grass|get a load of|ratio this)\b/i;

/** Flash language is not substance by itself. */
const FLASH = /\b(breaking|just in|flash|developing|urgent|exclusive)\b/i;

type Weighted = { re: RegExp; w: number };

/** Named events, prints, corporate actions — enough on their own. */
const STRONG: Weighted[] = [
  {
    re: /\b(fomc|federal open market committee|ecb|boj|pboc|cpi|ppi|nfp|payrolls|pce|gdp|ism|pmi|jobless|jackson hole|rate cuts?|rate hikes?|dot plot|\bqt\b|\bqe\b|balance sheet)\b/i,
    w: 14,
  },
  {
    re: /\b(earnings|eps|ebitda|guidance|beats?|miss(?:es|ed)?|downgrade[sd]?|upgrade[sd]?|price target|\bpt\b|initiate[sd]?|overweight|underweight|buy rating|sell rating|delivery beat)\b/i,
    w: 12,
  },
  {
    re: /\b(merger|acquisition|takeover|buyout|lbo|spin[- ]?off|ipo|secondary offering|follow[- ]on|atm offering|convertible|debt raise|bond sale|tender offer)\b/i,
    w: 12,
  },
  {
    re: /\b(bankrupt(?:cy)?|chapter 11|default|going concern|impairment|restatement|sec filing|8-k|10-k|10-q|s-1|13f|13d|form 4)\b/i,
    w: 12,
  },
  {
    re: /\b(opec|opec\+|production cuts?|spr\b|strategic petroleum|brent|wti|crack spread|rig count|inventory (?:draw|build)|inventories)\b/i,
    w: 12,
  },
  {
    re: /\b(halt(?:ed)?|circuit breaker|limit up|limit down|trading halt|luld|short squeeze|gamma squeeze|max pain)\b/i,
    w: 12,
  },
  {
    re: /\b(option flow|unusual options|dark pool|block trade|dealer gamma|above ask|below bid|iceberg)\b/i,
    w: 10,
  },
  {
    re: /\b(tariff|sanction|export control|chip ban|geopolitics|strait of hormuz|red sea)\b/i,
    w: 10,
  },
  {
    re: /\b(reverse repo|on rrp|money-market|money market|take-up|sofr|term premium|breakeven(?:s)?)\b/i,
    w: 10,
  },
  {
    re: /\b(sold[- ]out|remain sold out|still-tight supply|supply remains the constraint)\b/i,
    w: 10,
  },
];

/** Context words. Need a print, source, take, or number to count as substance. */
const WEAK: Weighted[] = [
  {
    re: /\b(s&p|nasdaq|dow|russell|vix|treasury|yields?|curve|inversion|dxy|dollar|fx\b|forex|spy|qqq)\b/i,
    w: 6,
  },
  {
    re: /\b(interest rate|funds rate|federal funds|open market committee|inflation|disinflation|hawkish|dovish)\b/i,
    w: 8,
  },
  {
    re: /\b(fed|federal reserve|powell|yellen|bessent|lagarde|bailey|kugler|waller|bowman)\b/i,
    w: 8,
  },
  {
    re: /\b(gpu|gpus|semiconductor|foundry|hbm|blackwell|hopper|capex|sold out|sold-out)\b/i,
    w: 8,
  },
  {
    re: /\b(revenue|margin|buyback|dividend|capex|free cash flow|fcf|book value|\bnav\b|\baum\b|inflow|outflow|redemption)\b/i,
    w: 8,
  },
  {
    re: /\b(print[s]?|into the print|into the number|into the decision)\b/i,
    w: 8,
  },
];

const NEWS: Weighted[] = [
  {
    re: /\b(according to|sources (?:say|said|tell|told)|people familiar|reports that|reported that|per (?:bloomberg|reuters|wsj|ft|cnbc|ap\b)|press release|announces|announced|confirmed|statement from|decided to|data (?:show|shows|showed)|came in at|published|(?:vs|versus)\b.{0,24}\b(?:expected|estimates?|consensus|exp)\b)\b/i,
    w: 12,
  },
  {
    re: /\b(vs (?:est(?:imates?)?|exp(?:ected)?|consensus)|versus (?:estimates?|consensus)|beat consensus|missed estimates|hotter than|cooler than|larger than expected|in line with|above (?:plan|consensus)|below consensus)\b/i,
    w: 12,
  },
  {
    re: /\b(y\/y|m\/m|yoy|mom|seasonally adjusted|\bsaar\b|nfp dump|payrolls print)\b/i,
    w: 8,
  },
];

const ANALYSIS: Weighted[] = [
  {
    re: /\b(implies|implying|suggests that|this means|the takeaway|key takeaway|our take|our view|worth noting|note that|net-net|the implication|reading this as|here'?s why|here'?s what matters|breakdown|thesis)\b/i,
    w: 12,
  },
  {
    re: /\b(pricing in|priced in|priced for|odds of|probability|historically|compared (?:with|to)|relative to|vs last|not a (?:pivot|preset|mid-meeting)|door left|remains (?:the constraint|attentive)|reaccelerates|tracking (?:above|below)|breadth is narrowing)\b/i,
    w: 10,
  },
  {
    re: /\b(traders (?:debate|cite|see|read)|watch liquidity|supply remains|lags on mix|into the bell|not about .+, it'?s about)\b/i,
    w: 8,
  },
];

const MARKET_NOUN =
  /\b(yield|yields|spread|spreads|payrolls?|print|oil|crude|gold|dollar|index|futures?|vol\b|vix|earnings|gdp|cpi|ppi|nfp|pce|treasury|auction|issuance|guidance|revenue|eps|inventory|inventories|opec|brent|wti|gpu|capex|margin|buyback|dividend|inflow|outflow|bps|basis points?|10-year|2-year|30-year|two-year|five-year|2s10s|sofr|liquidity|repo|fed funds|funds rate|inflation|oil market)\b/i;

/** Positioning into a known event, only substance with a ticker or market noun. */
const EVENT_POSITIONING =
  /\b(into the print|into the number|into the (?:cpi|fomc|nfp|pce|payrolls|decision|release)|volume spike)\b/i;

const CASHTAG = /\$[A-Z]{1,6}\b/g;
const PCT = /[+\-]?\d+(?:\.\d+)?\s?%/;
const BIG_NUMBER =
  /(?:\$\s?\d+(?:\.\d+)?\s?(?:bn|b|mm|m|k|trillion|billion|million)\b|\b\d+(?:\.\d+)?\s?(?:bps|bp|billion|million|trillion)\b)/i;

export type DeskScore = {
  score: number;
  spam: boolean;
  reasons: string[];
  /** True when the copy has a news hook or an analytical take, not just tickers or "breaking". */
  substance: boolean;
};

export type DeskRelevanceOpts = {
  isReply?: boolean;
  mode?: DeskMode;
};

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

function pickBetterDeskScore(a: DeskScore, b: DeskScore): DeskScore {
  const rank = (s: DeskScore) => (s.spam ? -1 : (s.substance ? 1_000 : 0) + s.score);
  return rank(b) > rank(a) ? b : a;
}

function scoreMarketsRelevance(text: string, opts: DeskRelevanceOpts = {}): DeskScore {
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
  const hasPositioning = EVENT_POSITIONING.test(t) && (hasCashtag || hasMarketNoun || hasStrong);
  const substance = hasStrong || hasNews || hasAnalysis || hasPayload || hasPositioning;

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
  if (hasCashtag) {
    if (substance) {
      score += 12;
      reasons.push("cashtag");
    } else {
      score += Math.min(6, 3 * cashtags.length);
      reasons.push("cashtag only");
    }
  }
  if (hasPositioning) {
    score += 8;
    reasons.push("positioning");
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
    score += Math.min(weakScore, 6);
    reasons.push("weak context");
  }

  if (DUNK.test(t) && substance) score = Math.max(0, score - 8);

  if (!substance) {
    score = Math.min(score, 3);
  }

  return { score, spam: false, reasons, substance };
}

export function scoreDeskRelevance(text: string, opts: DeskRelevanceOpts = {}): DeskScore {
  if (opts.mode === "venture") return scoreVentureRelevance(text, opts);
  const markets = scoreMarketsRelevance(text, opts);
  if (opts.mode !== "both") return markets;
  return pickBetterDeskScore(markets, scoreVentureRelevance(text, opts));
}

export function hasAnalyticalOrNewsValue(text: string, opts: DeskRelevanceOpts = {}): boolean {
  return scoreDeskRelevance(text, opts).substance;
}

export function isDeskRelevant(text: string, minScore: number, opts: DeskRelevanceOpts = {}): boolean {
  const s = scoreDeskRelevance(text, opts);
  if (s.spam) return false;
  return s.substance && s.score >= minScore;
}
