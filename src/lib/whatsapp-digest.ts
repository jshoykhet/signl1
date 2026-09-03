import type { NormalizedTweet, Rule } from "./types";
import { DIGEST_TOP_N } from "./desk-settings";
import { buildWhatsAppText } from "./whatsapp";

export type DigestItem = {
  rule: Pick<Rule, "name">;
  tweet: Pick<NormalizedTweet, "authorHandle" | "authorName" | "text" | "permalink"> & { id?: string };
  score?: number | null;
  likes?: number | null;
  kol?: boolean;
};

function digestKey(item: DigestItem): string {
  return item.tweet.id || item.tweet.permalink || `${item.tweet.authorHandle}:${item.tweet.text}`;
}

export function digestImportance(item: DigestItem): number {
  return (item.score ?? 0) * 1_000 + (item.likes ?? 0) * 10 + (item.kol ? 80 : 0);
}

export function rankDigestItems(items: DigestItem[], limit = DIGEST_TOP_N): DigestItem[] {
  const best = new Map<string, { item: DigestItem; index: number }>();
  items.forEach((item, index) => {
    const prev = best.get(digestKey(item));
    if (!prev || digestImportance(item) > digestImportance(prev.item)) {
      best.set(digestKey(item), { item, index });
    }
  });
  return [...best.values()]
    .sort((a, b) => {
      const diff = digestImportance(b.item) - digestImportance(a.item);
      if (diff !== 0) return diff;
      return a.index - b.index;
    })
    .slice(0, limit)
    .map((entry) => entry.item);
}

export function buildWhatsAppDigest(items: DigestItem[], digestMinutes: number, topN = DIGEST_TOP_N): string {
  if (!items.length) return "";
  const uniqueCount = new Set(items.map(digestKey)).size;
  const ranked = rankDigestItems(items, topN);
  const window =
    digestMinutes >= 60 && digestMinutes % 60 === 0
      ? `${digestMinutes / 60}h`
      : `${digestMinutes}m`;
  const scope =
    uniqueCount > ranked.length
      ? `top ${ranked.length} of ${uniqueCount}`
      : `${ranked.length} match${ranked.length === 1 ? "" : "es"}`;
  const head = `*Signl1 · digest* (${scope}, last ${window})`;
  const blocks = ranked.map((item) => buildWhatsAppText(item.rule, item.tweet));
  const more = uniqueCount > ranked.length ? `\n\n+${uniqueCount - ranked.length} more in the inbox` : "";
  return [head, "", blocks.join("\n\n—\n\n"), more].join("\n").trim();
}
