import { kolProfileUrl } from "./kol";
import { normalizeAccounts } from "./query";
import { DEFAULT_MONITORS } from "./seed-rules";

export type HandleListSource = "seed" | "added";

export type HandleListItem = {
  handle: string;
  source: HandleListSource;
  active: boolean;
  followers: number | null;
  profileUrl: string;
};

export function seedAccountsForMonitor(name: string | null | undefined): string[] {
  if (!name?.trim()) return [];
  const seed = DEFAULT_MONITORS.find((monitor) => monitor.name === name.trim());
  return seed ? [...seed.accounts] : [];
}

export function followerLookup(
  followers: Map<string, number> | Record<string, number | null | undefined> | undefined,
  handle: string,
): number | null {
  if (!followers) return null;
  const key = handle.replace(/^@/, "").toLowerCase();
  if (followers instanceof Map) {
    const n = followers.get(key);
    return typeof n === "number" ? n : null;
  }
  const n = followers[key];
  return typeof n === "number" ? n : null;
}

/** Seed handles stay as rows when removed so they can be restored, matching Key Network Nodes. */
export function buildHandleListItems(
  seed: string[],
  current: string[],
  followers?: Map<string, number> | Record<string, number | null | undefined>,
): HandleListItem[] {
  const seedSet = new Set(normalizeAccounts(seed));
  const currentSet = new Set(normalizeAccounts(current));
  const handles = new Set([...seedSet, ...currentSet]);
  return [...handles]
    .sort((a, b) => a.localeCompare(b))
    .map((handle) => ({
      handle,
      source: seedSet.has(handle) ? "seed" : "added",
      active: currentSet.has(handle),
      followers: followerLookup(followers, handle),
      profileUrl: kolProfileUrl(handle),
    }));
}
