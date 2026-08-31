export function alreadySeen(seenIds: Iterable<string>, tweetId: string): boolean {
  const id = tweetId.trim();
  if (!id) return true;
  if (seenIds instanceof Set) return seenIds.has(id);
  for (const existing of seenIds) {
    if (existing === id) return true;
  }
  return false;
}

export function rememberTweet(seenIds: Set<string>, tweetId: string): boolean {
  const id = tweetId.trim();
  if (!id || seenIds.has(id)) return false;
  seenIds.add(id);
  return true;
}

export function matchDedupeKey(ruleId: string, tweetId: string): string {
  return `${ruleId}:${tweetId}`;
}
