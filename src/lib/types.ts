export type Rule = {
  id: string;
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
};

export type RuleInput = {
  name: string;
  enabled: boolean;
  queryInput: string;
  accounts: string[];
  pollIntervalMs: number;
  slackWebhookUrl: string | null;
  genericWebhookUrl: string | null;
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
  };
  counts: {
    rules: number;
    enabledRules: number;
    matches: number;
    unread: number;
  };
};
