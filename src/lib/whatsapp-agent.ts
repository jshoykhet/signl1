import { X_MAX_QUERY_CHARS } from "./config";
import type { NormalizedTweet } from "./types";
import { isSameWhatsAppUser } from "./whatsapp";

export const AGENT_RESULT_LIMIT = 6;
export const AGENT_LOOKBACK_HOURS = 24;
export const AGENT_COOLDOWN_MS = 8_000;

export type AgentIntent =
  | { kind: "help" }
  | { kind: "status" }
  | { kind: "inbox" }
  | { kind: "search"; raw: string; query: string };

const COMMANDS: Array<{ kind: Exclude<AgentIntent["kind"], "search">; re: RegExp }> = [
  { kind: "help", re: /^(help|\?|hi|hello|hey|start|menu)$/i },
  { kind: "status", re: /^(status|whoami|linked)$/i },
  { kind: "inbox", re: /^(inbox|latest|digest|tape)$/i },
];

export function stripSearchPrefix(text: string): string {
  return text.replace(/^(search|find|look\s*up|lookup|show me|show|get)\s+/i, "").trim();
}

/** Short words that are themes/macro, not cashtags. `$NVDA` still compiles as a ticker. */
const BARE_TICKER_STOP = new Set([
  "ai",
  "fed",
  "fomc",
  "cpi",
  "pce",
  "nfp",
  "gdp",
  "ipo",
  "gpu",
  "gpus",
  "oil",
  "opec",
  "wti",
  "ism",
  "pmi",
  "dxy",
  "ecb",
  "boe",
  "sec",
  "fda",
  "imf",
  "macro",
  "series",
]);

export function compileAgentQuery(raw: string): string {
  let q = raw.trim().replace(/\s+/g, " ");
  if (!q) return "";
  const ticker = /^\$([A-Za-z]{1,5})$/.exec(q) ?? /^([A-Za-z]{1,5})$/.exec(q);
  if (ticker && (q.startsWith("$") || !BARE_TICKER_STOP.has(ticker[1].toLowerCase()))) {
    return `$${ticker[1].toUpperCase()} lang:en -is:retweet`;
  }
  const from =
    /^(?:from:|@)([A-Za-z0-9_]{1,15})$/.exec(q) ?? /^@([A-Za-z0-9_]{1,15})\s*$/.exec(q);
  if (from) return `from:${from[1].toLowerCase()} lang:en -is:retweet`;
  if (!/\blang:/i.test(q)) q = `${q} lang:en`;
  if (!/-is:retweet/i.test(q)) q = `${q} -is:retweet`;
  if (q.length > X_MAX_QUERY_CHARS) q = q.slice(0, X_MAX_QUERY_CHARS);
  return q;
}

export function parseAgentMessage(text: string): AgentIntent | null {
  const trimmed = text.replace(/\s+/g, " ").trim();
  if (!trimmed) return null;
  for (const command of COMMANDS) {
    if (command.re.test(trimmed)) return { kind: command.kind };
  }
  const raw = stripSearchPrefix(trimmed);
  if (!raw || raw.length < 2) return { kind: "help" };
  const query = compileAgentQuery(raw);
  if (!query) return { kind: "help" };
  return { kind: "search", raw, query };
}

export function senderIsAllowed(sender: string, allowed: string[]): boolean {
  return allowed.some((id) => isSameWhatsAppUser(sender, id));
}

export function agentHelpText(): string {
  return [
    "*Signl1 agent*",
    "Text a search. I check the last 24 hours on X and reply with the best posts.",
    "",
    "• `$NVDA` or `NVDA`",
    "• `@federalreserve` or `from:reuters`",
    "• `search FOMC cut`",
    "• `inbox` — latest posts already on your desk",
    "• `status` — link and mode",
    "• `help`",
    "",
    "Only the destination number on Settings can ask. Each search spends one X request.",
  ].join("\n");
}

export function formatAgentResults(opts: {
  label: string;
  tweets: Array<
    Pick<NormalizedTweet, "authorHandle" | "authorName" | "text" | "permalink"> & {
      likeCount?: number | null;
    }
  >;
  demo?: boolean;
  emptyHint?: string;
}): string {
  if (!opts.tweets.length) {
    return [
      `*Signl1 search* · ${opts.label}`,
      opts.demo ? "Sample tape. No match in the fixtures." : (opts.emptyHint ?? "Nothing in the last 24 hours."),
    ].join("\n");
  }
  const head = opts.demo
    ? `*Signl1 search* · ${opts.label} · sample posts`
    : `*Signl1 search* · ${opts.label} · last ${AGENT_LOOKBACK_HOURS}h`;
  const blocks = opts.tweets.slice(0, AGENT_RESULT_LIMIT).map((tweet, index) => {
    const likes = tweet.likeCount != null ? ` · ${tweet.likeCount} likes` : "";
    const preview = tweet.text.length > 280 ? `${tweet.text.slice(0, 277)}…` : tweet.text;
    return `${index + 1}. *@${tweet.authorHandle}*${likes}\n${preview}\n${tweet.permalink}`;
  });
  return [head, "", blocks.join("\n\n")].join("\n");
}
