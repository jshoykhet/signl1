import { scoreDeskRelevance } from "./desk-relevance";
import {
  extractThemeKeys,
  inLaunchWindow,
  fingerprintTokens,
  LAUNCH_HEAT_N,
  LAUNCH_THEME_N,
  LAUNCH_TOP_N,
  matchToLaunchTweet,
  textOverlap,
  themeLabel,
  uniqueByTweet,
  worthScore,
  type LaunchTweet,
} from "./launch-board";
import type { Match } from "./types";

export const LAUNCH_STORY_N = 12;
const MERGE_OVERLAP = 0.42;

export type LaunchStory = {
  id: string;
  themeId: string;
  themeLabel: string;
  headline: string;
  summary: string;
  reason: string;
  velocity: number;
  velocityLabel: string;
  sourceCount: number;
  sources: LaunchTweet[];
  tracked: boolean;
  muted: boolean;
};

export type LaunchPrefs = {
  tracked?: string[];
  muted?: string[];
};

export function primaryThemeKey(text: string, fallback = ""): string {
  const keys = extractThemeKeys(text);
  const cash = keys.find((key) => key.startsWith("$"));
  if (cash) return cash;
  const hash = keys.find((key) => key.startsWith("#"));
  if (hash) return hash;
  const word = keys.find((key) => !key.startsWith("$") && !key.startsWith("#"));
  if (word) return word;
  return fallback;
}

export function firstSentence(text: string): string {
  const cleaned = (text ?? "")
    .replace(/https?:\/\/\S+/g, "")
    .replace(/^(?:@\w+\s+)+/, "")
    .replace(/\s+/g, " ")
    .replace(/^breaking:\s*/i, "")
    .trim();
  if (!cleaned) return "";
  const sentence = cleaned.split(/(?<=[.!?])\s+/)[0] ?? cleaned;
  return sentence.trim();
}

function sentences(text: string): string[] {
  const cleaned = (text ?? "")
    .replace(/https?:\/\/\S+/g, "")
    .replace(/^(?:@\w+\s+)+/, "")
    .replace(/\s+/g, " ")
    .replace(/^breaking:\s*/i, "")
    .trim();
  if (!cleaned) return [];
  return cleaned.split(/(?<=[.!?])\s+/).map((part) => part.trim()).filter(Boolean);
}

function capSentence(text: string, max: number): string {
  const raw = firstSentence(text);
  if (!raw) return "";
  const capped = raw.charAt(0).toUpperCase() + raw.slice(1);
  if (capped.length <= max) return capped;
  return `${capped.slice(0, max - 1).replace(/\s+\S*$/, "")}…`;
}

function capText(raw: string, max: number): string {
  if (!raw) return "";
  const capped = raw.charAt(0).toUpperCase() + raw.slice(1);
  if (capped.length <= max) return capped;
  return `${capped.slice(0, max - 1).replace(/\s+\S*$/, "")}…`;
}

export function storyHeadline(text: string): string {
  return capSentence(text, 92) || "Developing on the tape";
}

export function storySummary(members: Match[], headline: string): string {
  const ranked = [...members].sort((a, b) => worthScore(b) - worthScore(a));
  const head = headline.trim().toLowerCase();
  for (const match of ranked) {
    const desk = scoreDeskRelevance(match.text ?? "");
    for (const part of sentences(match.text ?? "")) {
      const sentence = capText(part, 168);
      if (!sentence) continue;
      if (sentence.trim().toLowerCase() === head) continue;
      if (desk.substance || desk.print || sentence.length > 48) {
        return /[.!?]$/.test(sentence) ? sentence : `${sentence}.`;
      }
    }
  }
  const lead = ranked[0];
  if (!lead) return "On the desk in the last 24 hours.";
  const n = members.length;
  return `${n} source${n === 1 ? "" : "s"} on the tape, led by @${lead.authorHandle}.`;
}

export function tweetVelocity(match: Match, now = Date.now()): number {
  const likes = match.likeCount ?? 0;
  const followers = Math.max(1, match.followersCount ?? 0);
  const created = new Date(match.tweetCreatedAt || match.matchedAt).getTime();
  const ageH = Math.max(0.35, Number.isFinite(created) ? (now - created) / 3_600_000 : 12);
  return likes / ageH / Math.sqrt(followers);
}

function median(values: number[]): number {
  if (values.length === 0) return 1;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] || 1;
}

export function velocityLabel(abnormal: number): string {
  if (abnormal >= 2) return `${abnormal.toFixed(1)}× the tape`;
  if (abnormal >= 1.25) return "Faster than the tape";
  return "In line with the tape";
}

export function clusterMatches(matches: Match[]): Match[][] {
  const unique = uniqueByTweet(matches).filter((match) => match.userLabel !== "low");
  const buckets = new Map<string, Match[]>();
  const unkeyed: Match[] = [];
  for (const match of unique) {
    const key = primaryThemeKey(match.text, "");
    if (!key) {
      unkeyed.push(match);
      continue;
    }
    const list = buckets.get(key) ?? [];
    list.push(match);
    buckets.set(key, list);
  }

  const leftover: Match[] = [];
  for (const match of unkeyed) {
    const tokens = fingerprintTokens(match.text);
    let bestKey: string | null = null;
    let best = 0;
    for (const [key, members] of buckets) {
      const overlap = Math.max(
        ...members.slice(0, 8).map((item) => textOverlap(tokens, fingerprintTokens(item.text))),
        0,
      );
      if (overlap > best) {
        best = overlap;
        bestKey = key;
      }
    }
    if (bestKey && best >= MERGE_OVERLAP) {
      buckets.get(bestKey)!.push(match);
    } else {
      leftover.push(match);
    }
  }

  const groups = [...buckets.values()];
  const used = new Set<string>();
  for (const match of leftover) {
    if (used.has(match.tweetId)) continue;
    const tokens = fingerprintTokens(match.text);
    const cluster = [match];
    used.add(match.tweetId);
    for (const other of leftover) {
      if (used.has(other.tweetId)) continue;
      if (textOverlap(tokens, fingerprintTokens(other.text)) >= MERGE_OVERLAP) {
        cluster.push(other);
        used.add(other.tweetId);
      }
    }
    groups.push(cluster);
  }
  return groups;
}

function joinReasons(parts: string[]): string {
  if (parts.length === 0) return "On the desk in the last 24 hours.";
  if (parts.length === 1) {
    const one = parts[0]!;
    return one.charAt(0).toUpperCase() + one.slice(1) + (/[.!?]$/.test(one) ? "" : ".");
  }
  const [first, second] = parts;
  return `${first!.charAt(0).toUpperCase() + first!.slice(1)} — ${second}.`.replace("..", ".");
}

function uniqueTake(members: Match[]): boolean {
  if (members.length === 1) {
    return scoreDeskRelevance(members[0]?.text ?? "").reasons.includes("analysis");
  }
  const tokens = members.map((match) => fingerprintTokens(match.text));
  let nearest = 0;
  for (let i = 0; i < tokens.length; i++) {
    for (let j = i + 1; j < tokens.length; j++) {
      nearest = Math.max(nearest, textOverlap(tokens[i]!, tokens[j]!));
    }
  }
  return nearest < 0.45;
}

export function storyFromCluster(
  members: Match[],
  now = Date.now(),
  prefs: LaunchPrefs = {},
  medianVelocity = 1,
): LaunchStory {
  const ranked = [...members].sort((a, b) => worthScore(b, now) - worthScore(a, now));
  const lead = ranked[0]!;
  const themeId = primaryThemeKey(lead.text, `tweet:${lead.tweetId}`);
  const id = themeId.startsWith("tweet:") ? themeId : `theme:${themeId}`;
  const label = themeId.startsWith("tweet:") ? `@${lead.authorHandle}` : themeLabel(themeId);
  const headline = storyHeadline(lead.text);
  const velocities = members.map((match) => tweetVelocity(match, now));
  const peak = Math.max(...velocities, 0);
  const abnormal = peak / Math.max(medianVelocity, 1e-6);
  const tracked = (prefs.tracked ?? []).includes(id) || (prefs.tracked ?? []).includes(themeId);
  const muted = (prefs.muted ?? []).includes(id) || (prefs.muted ?? []).includes(themeId);
  const reasons: string[] = [];
  if (tracked) reasons.push("you're tracking this");
  if (members.length >= 3) reasons.push(`${members.length} sources clustering on ${label}`);
  else if (members.length === 2) reasons.push(`two independent sources on ${label}`);
  if (abnormal >= 2) reasons.push(`moving ${abnormal.toFixed(1)}× faster than the rest of the tape`);
  if (uniqueTake(members)) reasons.push("a distinct take, not a wire copy");
  if (ranked.some((match) => match.kol && scoreDeskRelevance(match.text ?? "").print)) {
    reasons.push("Key Account print");
  }
  if (ranked.some((match) => match.userLabel === "high")) reasons.push("you marked a source high-signal");
  if (reasons.length === 0) reasons.push("on the desk in the last 24 hours");

  return {
    id,
    themeId,
    themeLabel: label,
    headline,
    summary: storySummary(ranked, headline),
    reason: joinReasons(reasons.slice(0, 2)),
    velocity: abnormal,
    velocityLabel: velocityLabel(abnormal),
    sourceCount: members.length,
    sources: ranked.slice(0, 8).map(matchToLaunchTweet),
    tracked,
    muted,
  };
}

export function buildStories(matches: Match[], now = Date.now(), prefs: LaunchPrefs = {}): LaunchStory[] {
  const clusters = clusterMatches(matches);
  const velocities = clusters.flat().map((match) => tweetVelocity(match, now));
  const mid = median(velocities);
  return clusters
    .map((members) => storyFromCluster(members, now, prefs, mid))
    .filter((story) => !story.muted);
}

function storyWorth(story: LaunchStory, now: number): number {
  const lead = story.sources[0];
  if (!lead) return 0;
  const asMatch: Match = {
    id: lead.id,
    tweetId: lead.tweetId,
    ruleId: "",
    ruleName: lead.ruleName,
    authorHandle: lead.authorHandle,
    authorName: lead.authorName,
    text: lead.text,
    tweetCreatedAt: lead.tweetCreatedAt,
    permalink: lead.permalink,
    rawJson: "{}",
    read: false,
    matchedAt: lead.matchedAt,
    followersCount: lead.followersCount,
    likeCount: lead.likeCount,
    signalScore: lead.signalScore,
    userLabel: null,
    authorPrior: { high: 0, low: 0 },
    kol: lead.kol,
  };
  const base = worthScore(asMatch, now);
  const cluster = 1 + 0.22 * Math.log2(1 + story.sourceCount);
  const track = story.tracked ? 1.2 : 1;
  return base * cluster * track * (0.7 + 0.3 * Math.min(story.velocity, 4));
}

export function rankDevelopingStories(stories: LaunchStory[], limit = LAUNCH_THEME_N): LaunchStory[] {
  const clustered = stories.filter((story) => story.sourceCount >= 2);
  const pool = clustered.length > 0 ? clustered : stories;
  return [...pool]
    .sort((a, b) => b.sourceCount * 10 + b.velocity * 8 - (a.sourceCount * 10 + a.velocity * 8))
    .slice(0, limit);
}

export function rankWorthStories(stories: LaunchStory[], now = Date.now(), limit = LAUNCH_STORY_N): LaunchStory[] {
  return [...stories]
    .sort((a, b) => storyWorth(b, now) - storyWorth(a, now))
    .slice(0, Math.min(limit, LAUNCH_TOP_N));
}

export function rankHeatStories(stories: LaunchStory[], limit = LAUNCH_HEAT_N): LaunchStory[] {
  const sorted = [...stories].sort((a, b) => b.velocity - a.velocity || b.sourceCount - a.sourceCount);
  const picked: LaunchStory[] = [];
  const seen = new Set<string>();
  for (const story of sorted) {
    if (seen.has(story.themeId)) continue;
    picked.push(story);
    seen.add(story.themeId);
    if (picked.length >= limit) return picked;
  }
  return picked;
}

export function buildStoryBoard(matches: Match[], now = Date.now(), prefs: LaunchPrefs = {}) {
  const stories = buildStories(matches, now, prefs);
  return {
    developing: rankDevelopingStories(stories),
    top: rankWorthStories(stories, now),
    heat: rankHeatStories(stories),
  };
}

export function buildLaunchBoard(matches: Match[], now = Date.now(), prefs: LaunchPrefs = {}) {
  const recent = uniqueByTweet(matches).filter((match) =>
    inLaunchWindow(match.tweetCreatedAt || match.matchedAt, now),
  );
  const pool = recent.length >= 8 ? recent : uniqueByTweet(matches);
  return {
    windowHours: 24,
    usedFallbackWindow: recent.length < 8,
    ...buildStoryBoard(pool, now, prefs),
  };
}
