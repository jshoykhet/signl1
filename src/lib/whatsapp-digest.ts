import type { NormalizedTweet, Rule } from "./types";
import { buildWhatsAppText } from "./whatsapp";

export type DigestItem = {
  rule: Pick<Rule, "name">;
  tweet: Pick<NormalizedTweet, "authorHandle" | "authorName" | "text" | "permalink">;
};

const MAX_ITEMS = 12;

export function buildWhatsAppDigest(items: DigestItem[], digestMinutes: number): string {
  if (!items.length) return "";
  const window =
    digestMinutes >= 60 && digestMinutes % 60 === 0
      ? `${digestMinutes / 60}h`
      : `${digestMinutes}m`;
  const head = `*Signal1 · digest* (${items.length} match${items.length === 1 ? "" : "es"}, last ${window})`;
  const shown = items.slice(0, MAX_ITEMS);
  const blocks = shown.map((item) => buildWhatsAppText(item.rule, item.tweet));
  const more = items.length > MAX_ITEMS ? `\n\n+${items.length - MAX_ITEMS} more in the inbox` : "";
  return [head, "", blocks.join("\n\n—\n\n"), more].join("\n").trim();
}
