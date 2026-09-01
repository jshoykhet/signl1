/**
 * Scores whether a tweet is the kind of thing an event-driven trader,
 * fundamental investor, or market maker would actually want on the tape:
 * catalysts, numbers, flow, policy — not lifestyle chatter or promo spam.
 */

const SPAM =
  /\b(giveaway|airdrop|whitelist|wl spot|mint now|nft drop|follow and rt|like and retweet|dm me for|signal group|guaranteed returns|100x gem|to the moon 🚀🚀|free course)\b/i;

const CATALYST: { re: RegExp; w: number }[] = [
  { re: /\bbreaking\b|\bjust in\b|\bflash\b|\burgen(?:t|cy)\b/i, w: 14 },
  {
    re: /\b(fomc|ecb|boj|pboc|cpi|ppi|nfp|payrolls|pce|gdp|ism|pmi|jobless|jackson hole|rate cut|rate hike|dot plot|\bqt\b|\bqe\b|balance sheet)\b/i,
    w: 14,
  },
  {
    re: /\b(earnings|eps|ebitda|guidance|beat|miss|downgrade|upgrade|pt\b|price target|initiate[sd]?|overweight|underweight|buy rating|sell rating)\b/i,
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
    re: /\b(opec|opec\+|production cut|spr\b|strategic petroleum|brent|wti|crack spread|rig count)\b/i,
    w: 12,
  },
  {
    re: /\b(halt(?:ed)?|circuit breaker|limit up|limit down|trading halt|luld|short squeeze|gamma squeeze|max pain)\b/i,
    w: 12,
  },
  {
    re: /\b(option flow|unusual options|dark pool|block trade|print[s]?\b|above ask|below bid|iceberg|spoof)\b/i,
    w: 10,
  },
  {
    re: /\b(s&p|nasdaq|dow|russell|vix|treasury|yields?|curve|inversion|dxy|dollar|fx\b|forex|btc|eth|spot bitcoin)\b/i,
    w: 8,
  },
  {
    re: /\b(interest rate|funds rate|federal funds|open market committee|inflation|disinflation|hawkish|dovish)\b/i,
    w: 10,
  },
  {
    re: /\b(fed|federal reserve|powell|yellen|bessent|lagarde|bailey|kugler|waller|bowman)\b/i,
    w: 10,
  },
  {
    re: /\b(gpu|gpus|semiconductor|foundry|hbm|blackwell|hopper|capex|sold out|sold-out)\b/i,
    w: 8,
  },
  {
    re: /\b(tariff|sanction|export control|chip ban|opec|geopolitics|strait of hormuz|red sea)\b/i,
    w: 10,
  },
  {
    re: /\b(revenue|margin|buyback|dividend|capex|free cash flow|fcf|book value|nav\b|aum\b|inflow|outflow|redemption)\b/i,
    w: 8,
  },
];

const CASHTAG = /\$[A-Z]{1,6}\b/;
const PCT = /[+\-]?\d+(?:\.\d+)?\s?%/;
const BIG_NUMBER = /\$\s?\d+(?:\.\d+)?\s?(?:bn|b|mm|m|k|trillion|billion|million)\b/i;

export type DeskScore = {
  score: number;
  spam: boolean;
  reasons: string[];
};

export function scoreDeskRelevance(text: string): DeskScore {
  const t = text.trim();
  if (!t) return { score: 0, spam: false, reasons: [] };
  if (SPAM.test(t)) return { score: 0, spam: true, reasons: ["promo/spam phrasing"] };

  let score = 0;
  const reasons: string[] = [];

  if (CASHTAG.test(t)) {
    score += 12;
    reasons.push("cashtag");
  }
  if (PCT.test(t)) {
    score += 6;
    reasons.push("percent move");
  }
  if (BIG_NUMBER.test(t)) {
    score += 6;
    reasons.push("sized number");
  }

  for (const { re, w } of CATALYST) {
    if (re.test(t)) {
      score += w;
      reasons.push("catalyst");
    }
  }

  return { score, spam: false, reasons };
}

export function isDeskRelevant(text: string, minScore: number): boolean {
  const s = scoreDeskRelevance(text);
  if (s.spam) return false;
  return s.score >= minScore;
}
