import type { NormalizedTweet } from "./types";

export type DietNode = {
  handle: string;
  count: number;
  followers: number | null;
};

export type DietTheme = {
  token: string;
  kind: "ticker" | "tag";
  count: number;
};

export type DietRec = {
  title: string;
  detail: string;
};

export type DietReport = {
  handle: string;
  name: string;
  followers: number | null;
  verified: boolean;
  demo: boolean;
  windowDays: number;
  posted: number;
  originals: number;
  replies: number;
  retweets: number;
  likes: number;
  reposts: number;
  impressions: number | null;
  avgLikes: number;
  replyShare: number;
  themes: DietTheme[];
  outbound: DietNode[];
  inbound: DietNode[];
  hours: number[];
  recommendations: DietRec[];
  note: string;
};

const MENTION = /@([A-Za-z0-9_]{1,15})/g;
const TICKER = /\$([A-Za-z]{1,6})\b/g;
const TAG = /#([A-Za-z][A-Za-z0-9_]{1,30})/g;

export function parseXHandle(raw: string): string | null {
  const handle = raw.replace(/^@/, "").trim();
  if (!/^[A-Za-z0-9_]{1,15}$/.test(handle)) return null;
  return handle;
}

export function mentionedHandles(text: string, self: string): string[] {
  const mine = self.replace(/^@/, "").trim().toLowerCase();
  const out: string[] = [];
  const seen = new Set<string>();
  for (const match of text.matchAll(MENTION)) {
    const handle = match[1]?.toLowerCase();
    if (!handle || handle === mine || seen.has(handle)) continue;
    seen.add(handle);
    out.push(handle);
  }
  return out;
}

function collect(pattern: RegExp, text: string): string[] {
  const out: string[] = [];
  for (const match of text.matchAll(pattern)) {
    const token = match[1]?.toUpperCase();
    if (token) out.push(token);
  }
  return out;
}

function bump(map: Map<string, number>, key: string, n = 1) {
  map.set(key, (map.get(key) ?? 0) + n);
}

function topCount(map: Map<string, number>, limit: number): Array<[string, number]> {
  return [...map.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, limit);
}

function followersFromTweet(tweet: NormalizedTweet): number | null {
  return typeof tweet.followersCount === "number" && tweet.followersCount > 0 ? tweet.followersCount : null;
}

function inReplyToHandle(tweet: NormalizedTweet, usersById: Map<string, { username: string; followers: number }>): string | null {
  const raw = tweet.raw as { tweet?: { in_reply_to_user_id?: string | null } } | null;
  const id = raw?.tweet?.in_reply_to_user_id;
  if (!id) return null;
  return usersById.get(id)?.username.toLowerCase() ?? null;
}

function indexIncludedUsers(tweets: NormalizedTweet[]): Map<string, { username: string; followers: number }> {
  const map = new Map<string, { username: string; followers: number }>();
  for (const tweet of tweets) {
    const author = (tweet.raw as { author?: { id?: string; username?: string; public_metrics?: { followers_count?: number } } } | null)
      ?.author;
    if (author?.id && author.username) {
      map.set(author.id, {
        username: author.username,
        followers: author.public_metrics?.followers_count ?? tweet.followersCount ?? 0,
      });
    }
  }
  return map;
}

export function analyzeDiet(
  handle: string,
  own: NormalizedTweet[],
  inbound: NormalizedTweet[],
  opts?: { demo?: boolean; windowDays?: number },
): DietReport {
  const self = handle.replace(/^@/, "").trim().toLowerCase();
  const windowDays = opts?.windowDays ?? 7;
  const users = indexIncludedUsers([...own, ...inbound]);
  const profile = own[0] ?? inbound.find((tweet) => tweet.authorHandle.toLowerCase() === self);
  const outboundCounts = new Map<string, number>();
  const outboundFol = new Map<string, number>();
  const inboundCounts = new Map<string, number>();
  const inboundFol = new Map<string, number>();
  const tickers = new Map<string, number>();
  const tags = new Map<string, number>();
  const hours = Array.from({ length: 24 }, () => 0);
  let originals = 0;
  let replies = 0;
  let retweets = 0;
  let likes = 0;
  let reposts = 0;
  let impressions = 0;
  let impressionPosts = 0;

  const handleFollowers = new Map<string, number>();
  for (const user of users.values()) {
    handleFollowers.set(user.username.toLowerCase(), user.followers);
  }

  for (const tweet of own) {
    if (tweet.isRetweet) retweets += 1;
    else if (tweet.isReply) replies += 1;
    else originals += 1;
    likes += tweet.likeCount ?? 0;
    reposts += tweet.retweetCount ?? 0;
    if (typeof tweet.impressionCount === "number" && tweet.impressionCount > 0) {
      impressions += tweet.impressionCount;
      impressionPosts += 1;
    }
    const hour = new Date(tweet.createdAt).getUTCHours();
    if (Number.isFinite(hour)) hours[hour] += 1;
    const replyTo = inReplyToHandle(tweet, users);
    const mentions = mentionedHandles(tweet.text, self);
    const targets = replyTo && !mentions.includes(replyTo) ? [replyTo, ...mentions] : mentions;
    for (const other of targets) {
      if (other === self) continue;
      bump(outboundCounts, other);
      const fol = handleFollowers.get(other);
      if (typeof fol === "number") outboundFol.set(other, Math.max(outboundFol.get(other) ?? 0, fol));
    }
    for (const token of collect(TICKER, tweet.text)) bump(tickers, `$${token}`);
    for (const token of collect(TAG, tweet.text)) bump(tags, `#${token.toLowerCase()}`);
  }

  for (const tweet of inbound) {
    const who = tweet.authorHandle.toLowerCase();
    if (who === self) continue;
    bump(inboundCounts, who);
    const fol = followersFromTweet(tweet);
    if (fol) inboundFol.set(who, Math.max(inboundFol.get(who) ?? 0, fol));
  }

  const posted = own.length;
  const replyShare = posted ? replies / posted : 0;
  const themes: DietTheme[] = [
    ...topCount(tickers, 8).map(([token, count]) => ({ token, kind: "ticker" as const, count })),
    ...topCount(tags, 6).map(([token, count]) => ({ token, kind: "tag" as const, count })),
  ].sort((a, b) => b.count - a.count).slice(0, 10);

  const outbound: DietNode[] = topCount(outboundCounts, 12).map(([h, count]) => ({
    handle: h,
    count,
    followers: outboundFol.get(h) ?? null,
  }));
  const inboundNodes: DietNode[] = topCount(inboundCounts, 12).map(([h, count]) => ({
    handle: h,
    count,
    followers: inboundFol.get(h) ?? null,
  }));

  const report: DietReport = {
    handle: self,
    name: profile?.authorName ?? handle,
    followers: profile && profile.authorHandle.toLowerCase() === self ? followersFromTweet(profile) : own[0] ? followersFromTweet(own[0]) : null,
    verified: Boolean(profile?.verified),
    demo: opts?.demo === true,
    windowDays,
    posted,
    originals,
    replies,
    retweets,
    likes,
    reposts,
    impressions: impressionPosts ? impressions : null,
    avgLikes: posted ? likes / posted : 0,
    replyShare,
    themes,
    outbound,
    inbound: inboundNodes,
    hours,
    recommendations: [],
    note: "Inferred from the last 7 days of posts and mentions — not the full follower or following list. X does not give that graph on the shared search token.",
  };
  report.recommendations = recommendDiet(report);
  return report;
}

export function recommendDiet(report: DietReport): DietRec[] {
  const recs: DietRec[] = [];
  if (report.posted === 0) {
    recs.push({
      title: "No posts in the window",
      detail: `Nothing from @${report.handle} in the last ${report.windowDays} days. Reach starts with a short original — one claim, one number — not a reply.`,
    });
    return recs;
  }
  if (report.replyShare >= 0.6) {
    recs.push({
      title: "The feed is mostly replies",
      detail: `${Math.round(report.replyShare * 100)}% of recent posts are replies. Replies train the graph; originals travel. Aim for one standalone take per three replies.`,
    });
  } else if (report.replyShare < 0.15 && report.inbound.length > 3) {
    recs.push({
      title: "People mention you more than you talk back",
      detail: "Quote two inbound mentions this week with a useful add. Silence after a mention wastes the only warm traffic you have.",
    });
  }
  if (report.posted < 5) {
    recs.push({
      title: "Too quiet to compound",
      detail: `${report.posted} posts in ${report.windowDays} days. A short original once a day beats a weekend dump. Keep the lane, not the volume.`,
    });
  }
  const knownFol = report.outbound.filter((node) => node.followers != null);
  const tiny = knownFol.filter((node) => (node.followers ?? 0) < 5_000).length;
  const mega = knownFol.filter((node) => (node.followers ?? 0) > 500_000).length;
  if (knownFol.length >= 3 && tiny / knownFol.length >= 0.7) {
    recs.push({
      title: "The graph is small-room",
      detail: "Most accounts you @ have under 5k followers. Quote two mid-size desks (10k–80k) in your lane. They reply. Mega-accounts do not.",
    });
  }
  if (knownFol.length >= 3 && mega / knownFol.length >= 0.5) {
    recs.push({
      title: "Replies to giants get buried",
      detail: "Half the people you talk to are huge. Mix in mid-size accounts who will actually quote you back.",
    });
  }
  if (report.outbound.length <= 1 && report.posted >= 6) {
    recs.push({
      title: "Almost no conversation graph",
      detail: "You barely @ anyone. Reply to five posts in your lane with a fact they missed — not “this.” That is how following graphs grow.",
    });
  }
  if (report.themes.length >= 8) {
    recs.push({
      title: "The diet is scattered",
      detail: `Themes jump across ${report.themes.length} tickers and tags. Pick one or two lanes for a week so people (and the ranking) know what you are for.`,
    });
  } else if (report.themes.length === 0 && report.originals >= 3) {
    recs.push({
      title: "No hook in the text",
      detail: "No cashtags or topic tags in recent originals. Name the thing — $ticker, the print, the firm — so the right people can find it.",
    });
  }
  if (report.impressions && report.posted && report.likes / report.impressions < 0.004 && report.impressions > 2_000) {
    recs.push({
      title: "Seen more than clicked",
      detail: "Impressions are ahead of likes. Tighten the first line: one claim, one number, no throat-clearing.",
    });
  }
  const peak = report.hours.indexOf(Math.max(...report.hours));
  const quietDay = report.hours[peak] >= 3 && (peak <= 5 || peak >= 22);
  if (quietDay && report.posted >= 6) {
    recs.push({
      title: "Posting into a dead hour",
      detail: `A lot of posts land around ${String(peak).padStart(2, "0")}:00 UTC. Try a 13:00–16:00 UTC window (US morning / Europe close) for one week and compare likes.`,
    });
  }
  if (recs.length === 0) {
    recs.push({
      title: "Keep the lane, raise the originals",
      detail: "The mix is workable. Double down on the top theme, ship one sharper original a day, and reply to two mid-size accounts — not the same giant every time.",
    });
  }
  return recs.slice(0, 5);
}
