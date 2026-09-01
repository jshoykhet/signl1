const LIKE_ESCAPE = /[%_\\]/g;

export function tokenizeSearch(query: string): string[] {
  return query
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .map((token) => token.replace(/^@/, ""))
    .filter(Boolean)
    .slice(0, 8);
}

export function escapeLike(token: string): string {
  return token.replace(LIKE_ESCAPE, (ch) => `\\${ch}`);
}

export function likePattern(token: string): string {
  return `%${escapeLike(token)}%`;
}

export function matchSearchHaystack(input: {
  text: string;
  authorHandle: string;
  authorName: string;
  ruleName: string;
  tweetId: string;
}): string {
  return [
    input.text,
    input.authorHandle,
    `@${input.authorHandle}`,
    input.authorName,
    input.ruleName,
    input.tweetId,
  ]
    .join(" ")
    .toLowerCase();
}

export function matchesSearchQuery(
  input: {
    text: string;
    authorHandle: string;
    authorName: string;
    ruleName: string;
    tweetId: string;
  },
  query: string,
): boolean {
  const tokens = tokenizeSearch(query);
  if (tokens.length === 0) return true;
  const haystack = matchSearchHaystack(input);
  return tokens.every((token) => haystack.includes(token));
}
