import type { DeskFilterSettings } from "./desk-settings";
import type { MonitorMode } from "./monitor-mode";
import type { AuthorPrior, UserLabel } from "./signal-filter";

export type { AuthorPrior, UserLabel, MonitorMode };

export type RuleKind = "custom" | "watchlist" | "key_leaders";

export type Rule = {
  id: string;
  userId: string;
  name: string;
  enabled: boolean;
  query: string;
  queryInput: string;
  accounts: string[];
  pollIntervalMs: number;
  slackWebhookUrl: string | null;
  genericWebhookUrl: string | null;
  lastPolledAt: string | null;
  lastSinceId: string | null;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
  kind: RuleKind;
  watchlistChunk: number | null;
  mode: MonitorMode;
};

export type Match = {
  id: string;
  tweetId: string;
  ruleId: string;
  ruleName: string;
  authorHandle: string;
  authorName: string;
  text: string;
  tweetCreatedAt: string;
  permalink: string;
  rawJson: string;
  read: boolean;
  matchedAt: string;
  followersCount: number | null;
  likeCount: number | null;
  signalScore: number | null;
  userLabel: UserLabel | null;
  authorPrior: AuthorPrior;
  kol: boolean;
};

export type NormalizedTweet = {
  id: string;
  authorHandle: string;
  authorName: string;
  text: string;
  createdAt: string;
  lang: string;
  isRetweet: boolean;
  isReply: boolean;
  permalink: string;
  raw: unknown;
  followersCount: number;
  likeCount: number;
  retweetCount: number;
  replyCount: number;
  quoteCount: number;
  impressionCount?: number;
  verified: boolean;
};

export type RuleInput = {
  name: string;
  enabled: boolean;
  queryInput: string;
  accounts: string[];
  pollIntervalMs: number;
  slackWebhookUrl: string | null;
  genericWebhookUrl: string | null;
  mode?: MonitorMode;
};

export type StatusSnapshot = {
  demoMode: boolean;
  bearerToken: "present" | "missing";
  poller: {
    healthy: boolean;
    startedAt: string | null;
    lastHeartbeatAt: string | null;
    lastPollAt: string | null;
    lastError: string | null;
    lastErrorAt: string | null;
    mode: "demo" | "live" | "unknown";
    searchRequests: number;
    lastPackedQueries: number;
    rateLimitRemaining: number | null;
    rateLimitLimit: number | null;
    rateLimitResetAt: string | null;
    idleBackoffMs: number;
    manualPollPending: boolean;
    lastManualPollAt: string | null;
    postsRead: number;
    usersRead: number;
    estimatedCostUsd: number;
    lastPollPosts: number;
    lastPollUsers: number;
    lastPollCostUsd: number;
  };
  qualityFilter: {
    minFollowers: number;
    minLikes: number;
    minScore: number;
    minDeskScore: number;
  };
  deskFilters: DeskFilterSettings;
  kol: {
    count: number;
    mode: "append" | "replace";
    added: string[];
    removed: string[];
  };
  blocked: {
    count: number;
    added: string[];
    removed: string[];
  };
  training: {
    high: number;
    low: number;
  };
  counts: {
    rules: number;
    enabledRules: number;
    matches: number;
    unread: number;
    tickers: number;
  };
  cadenceMinutes: number;
};

export type WatchlistSnapshot = {
  tickers: string[];
  enabled: boolean;
  pollIntervalMs: number;
  compiledQueries: string[];
  rules: Array<{
    id: string;
    name: string;
    enabled: boolean;
    query: string;
    lastPolledAt: string | null;
    lastError: string | null;
  }>;
};
