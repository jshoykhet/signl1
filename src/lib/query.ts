export function normalizeAccounts(accounts: string[] | string | null | undefined): string[] {
  const raw = Array.isArray(accounts)
    ? accounts
    : typeof accounts === "string"
      ? accounts.split(/[\s,]+/)
      : [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of raw) {
    const handle = item.trim().replace(/^@/, "").toLowerCase();
    if (!handle) continue;
    if (!/^[a-z0-9_]{1,15}$/.test(handle)) continue;
    if (seen.has(handle)) continue;
    seen.add(handle);
    out.push(handle);
  }
  return out;
}

export function compileFromAccounts(accounts: string[]): string {
  const handles = normalizeAccounts(accounts);
  if (handles.length === 0) return "";
  if (handles.length === 1) return `from:${handles[0]}`;
  return `(${handles.map((h) => `from:${h}`).join(" OR ")})`;
}

export function compileQuery(input: {
  query?: string | null;
  accounts?: string[] | string | null;
}): string {
  const fromClause = compileFromAccounts(normalizeAccounts(input.accounts));
  const query = (input.query ?? "").trim();
  if (fromClause && query) return `${fromClause} ${query}`;
  return fromClause || query;
}

type Token =
  | { type: "OR" }
  | { type: "LPAREN" }
  | { type: "RPAREN" }
  | { type: "NOT" }
  | { type: "WORD"; value: string }
  | { type: "PHRASE"; value: string }
  | { type: "FROM"; value: string }
  | { type: "LANG"; value: string }
  | { type: "IS"; value: string }
  | { type: "HAS"; value: string };

type Ast =
  | { type: "AND"; nodes: Ast[] }
  | { type: "OR"; nodes: Ast[] }
  | { type: "NOT"; node: Ast }
  | { type: "WORD"; value: string }
  | { type: "PHRASE"; value: string }
  | { type: "FROM"; value: string }
  | { type: "LANG"; value: string }
  | { type: "IS"; value: string }
  | { type: "HAS"; value: string }
  | { type: "TRUE" };

export function tokenizeQuery(query: string): Token[] {
  const tokens: Token[] = [];
  const src = query.trim();
  let i = 0;

  const pushWordOrOp = (raw: string) => {
    if (!raw) return;
    if (/^or$/i.test(raw)) {
      tokens.push({ type: "OR" });
      return;
    }
    const negated = raw.startsWith("-") && raw.length > 1;
    const body = negated ? raw.slice(1) : raw;
    if (negated) tokens.push({ type: "NOT" });
    const op = /^(from|lang|is|has):(.+)$/i.exec(body);
    if (op) {
      const kind = op[1].toLowerCase();
      const value = op[2].replace(/^@/, "").toLowerCase();
      if (kind === "from") tokens.push({ type: "FROM", value });
      else if (kind === "lang") tokens.push({ type: "LANG", value });
      else if (kind === "is") tokens.push({ type: "IS", value });
      else tokens.push({ type: "HAS", value });
      return;
    }
    tokens.push({ type: "WORD", value: body.toLowerCase() });
  };

  while (i < src.length) {
    const ch = src[i];
    if (/\s/.test(ch)) {
      i += 1;
      continue;
    }
    if (ch === "(") {
      tokens.push({ type: "LPAREN" });
      i += 1;
      continue;
    }
    if (ch === ")") {
      tokens.push({ type: "RPAREN" });
      i += 1;
      continue;
    }
    if (ch === '"') {
      i += 1;
      let value = "";
      while (i < src.length && src[i] !== '"') {
        value += src[i];
        i += 1;
      }
      if (src[i] === '"') i += 1;
      tokens.push({ type: "PHRASE", value: value.toLowerCase() });
      continue;
    }
    let raw = "";
    while (i < src.length && !/\s/.test(src[i]) && src[i] !== "(" && src[i] !== ")") {
      if (src[i] === '"') break;
      raw += src[i];
      i += 1;
    }
    pushWordOrOp(raw);
  }
  return tokens;
}

function parseExpr(tokens: Token[], index: { i: number }): Ast {
  const parts: Ast[] = [parseAnd(tokens, index)];
  while (tokens[index.i]?.type === "OR") {
    index.i += 1;
    parts.push(parseAnd(tokens, index));
  }
  return parts.length === 1 ? parts[0] : { type: "OR", nodes: parts };
}

function parseAnd(tokens: Token[], index: { i: number }): Ast {
  const parts: Ast[] = [];
  while (index.i < tokens.length) {
    const t = tokens[index.i];
    if (t.type === "OR" || t.type === "RPAREN") break;
    parts.push(parseUnary(tokens, index));
  }
  if (parts.length === 0) return { type: "TRUE" };
  return parts.length === 1 ? parts[0] : { type: "AND", nodes: parts };
}

function parseUnary(tokens: Token[], index: { i: number }): Ast {
  const t = tokens[index.i];
  if (!t) return { type: "TRUE" };
  if (t.type === "NOT") {
    index.i += 1;
    return { type: "NOT", node: parseUnary(tokens, index) };
  }
  if (t.type === "LPAREN") {
    index.i += 1;
    const inner = parseExpr(tokens, index);
    if (tokens[index.i]?.type === "RPAREN") index.i += 1;
    return inner;
  }
  index.i += 1;
  if (t.type === "WORD") return { type: "WORD", value: t.value };
  if (t.type === "PHRASE") return { type: "PHRASE", value: t.value };
  if (t.type === "FROM") return { type: "FROM", value: t.value };
  if (t.type === "LANG") return { type: "LANG", value: t.value };
  if (t.type === "IS") return { type: "IS", value: t.value };
  if (t.type === "HAS") return { type: "HAS", value: t.value };
  return { type: "TRUE" };
}

export function parseQuery(query: string): Ast {
  const tokens = tokenizeQuery(query);
  if (tokens.length === 0) return { type: "TRUE" };
  return parseExpr(tokens, { i: 0 });
}

export type QueryTweet = {
  text: string;
  authorHandle: string;
  lang?: string;
  isRetweet?: boolean;
  isReply?: boolean;
};

function includesToken(haystack: string, needle: string): boolean {
  if (!needle) return true;
  const text = haystack.toLowerCase();
  const n = needle.toLowerCase();
  if (n.startsWith("#") || n.startsWith("$") || n.startsWith("@")) {
    return text.includes(n);
  }
  const escaped = n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^a-z0-9_])${escaped}([^a-z0-9_]|$)`, "i").test(text);
}

function evalAst(ast: Ast, tweet: QueryTweet): boolean {
  switch (ast.type) {
    case "TRUE":
      return true;
    case "AND":
      return ast.nodes.every((n) => evalAst(n, tweet));
    case "OR":
      return ast.nodes.some((n) => evalAst(n, tweet));
    case "NOT":
      return !evalAst(ast.node, tweet);
    case "WORD":
      return includesToken(tweet.text, ast.value);
    case "PHRASE":
      return tweet.text.toLowerCase().includes(ast.value.toLowerCase());
    case "FROM":
      return tweet.authorHandle.replace(/^@/, "").toLowerCase() === ast.value;
    case "LANG":
      return (tweet.lang ?? "en").toLowerCase() === ast.value;
    case "IS":
      if (ast.value === "retweet") return Boolean(tweet.isRetweet);
      if (ast.value === "reply") return Boolean(tweet.isReply);
      return true;
    case "HAS":
      if (ast.value === "links") return /https?:\/\//i.test(tweet.text);
      return true;
    default:
      return true;
  }
}

export function matchesQuery(tweet: QueryTweet, query: string): boolean {
  const compiled = query.trim();
  if (!compiled) return false;
  return evalAst(parseQuery(compiled), tweet);
}

export const QUERY_SYNTAX = [
  { op: "keyword", meaning: "Unquoted words are ANDed. Example: NVDA earnings" },
  { op: '"exact phrase"', meaning: "Match a contiguous phrase. Example: \"interest rate\"" },
  { op: "OR", meaning: "Either side may match. Example: FOMC OR Powell" },
  { op: "()", meaning: "Group clauses. Example: (hike OR cut) rates" },
  { op: "from:user", meaning: "Only posts by that account (no @). Example: from:federalreserve" },
  { op: "$TICKER", meaning: "Cashtag. Signal1 adds the $ for you from the Watchlist. Example: $NVDA" },
  { op: "-is:retweet", meaning: "Drop retweets. Highly recommended." },
  { op: "lang:en", meaning: "Restrict to English." },
  { op: "has:links", meaning: "Only posts that contain a URL." },
  { op: "-term", meaning: "Exclude a word or operator. Example: NVDA -giveaway" },
] as const;
