import { WATCHLIST_QUERY_BUDGET } from "./config";

const TICKER_RE = /^[A-Z][A-Z0-9.]{0,9}$/;
export const WATCHLIST_QUERY_SUFFIX = " lang:en -is:retweet";

export const WATCHLIST_SUGGESTIONS = [
  "NVDA",
  "AAPL",
  "MSFT",
  "AMZN",
  "GOOGL",
  "META",
  "TSLA",
  "SPY",
  "QQQ",
  "IWM",
] as const;

export function normalizeTickers(tickers: string[] | string | null | undefined): string[] {
  const raw = Array.isArray(tickers)
    ? tickers
    : typeof tickers === "string"
      ? tickers.split(/[\s,;]+/)
      : [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of raw) {
    const symbol = item.trim().replace(/^\$+/, "").toUpperCase();
    if (!symbol) continue;
    if (!TICKER_RE.test(symbol)) continue;
    if (seen.has(symbol)) continue;
    seen.add(symbol);
    out.push(symbol);
  }
  return out.sort();
}

export function rejectedTickers(tickers: string[] | string | null | undefined): string[] {
  const raw = Array.isArray(tickers)
    ? tickers
    : typeof tickers === "string"
      ? tickers.split(/[\s,;]+/)
      : [];
  const rejected: string[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    const original = item.trim();
    if (!original) continue;
    const symbol = original.replace(/^\$+/, "").toUpperCase();
    if (TICKER_RE.test(symbol)) continue;
    const key = original.toUpperCase();
    if (seen.has(key)) continue;
    seen.add(key);
    rejected.push(original);
  }
  return rejected;
}

export function compileCashtagQuery(tickers: string[] | string | null | undefined): string {
  const symbols = normalizeTickers(tickers);
  if (symbols.length === 0) return "";
  const body = symbols.length === 1 ? `$${symbols[0]}` : `(${symbols.map((symbol) => `$${symbol}`).join(" OR ")})`;
  return `${body}${WATCHLIST_QUERY_SUFFIX}`;
}

export function chunkTickersForQuery(
  tickers: string[] | string | null | undefined,
  maxChars = WATCHLIST_QUERY_BUDGET,
): string[][] {
  const symbols = normalizeTickers(tickers);
  const chunks: string[][] = [];
  let current: string[] = [];
  for (const symbol of symbols) {
    const candidate = [...current, symbol];
    if (compileCashtagQuery(candidate).length > maxChars && current.length > 0) {
      chunks.push(current);
      current = [symbol];
    } else {
      current = candidate;
    }
  }
  if (current.length) chunks.push(current);
  return chunks;
}
