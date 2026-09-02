import { DEFAULT_POLL_INTERVAL_MS } from "./config";
import type { DeskMode } from "./desk-mode";
import type { RuleInput } from "./types";

const interval = DEFAULT_POLL_INTERVAL_MS;

export const MARKETS_SEED_RULES: RuleInput[] = [
  {
    name: "Fed Watch",
    enabled: true,
    queryInput: '(FOMC OR "interest rate" OR "fed funds" OR Powell) lang:en -is:retweet',
    accounts: [],
    pollIntervalMs: interval,
    slackWebhookUrl: null,
    genericWebhookUrl: null,
  },
  {
    name: "Mag 7 tape",
    enabled: true,
    queryInput: "(earnings OR guidance OR GPU OR AI) lang:en -is:retweet",
    accounts: ["nvidia", "apple", "meta", "microsoft"],
    pollIntervalMs: interval,
    slackWebhookUrl: null,
    genericWebhookUrl: null,
  },
  {
    name: "Crude & OPEC",
    enabled: true,
    queryInput: '(OPEC OR "crude oil" OR WTI OR Brent) lang:en -is:retweet',
    accounts: [],
    pollIntervalMs: interval,
    slackWebhookUrl: null,
    genericWebhookUrl: null,
  },
];

export const VENTURE_SEED_RULES: RuleInput[] = [
  {
    name: "Funding rounds",
    enabled: true,
    queryInput:
      '(raised OR raising OR "series a" OR "series b" OR "series c" OR "seed round" OR "pre-seed" OR "led the round" OR "term sheet" OR valuation) lang:en -is:retweet',
    accounts: [],
    pollIntervalMs: interval,
    slackWebhookUrl: null,
    genericWebhookUrl: null,
  },
  {
    name: "Launches & product",
    enabled: true,
    queryInput:
      '("comes out of stealth" OR "product launch" OR launches OR "open sourced" OR "general availability" OR "demo day") lang:en -is:retweet',
    accounts: [],
    pollIntervalMs: interval,
    slackWebhookUrl: null,
    genericWebhookUrl: null,
  },
  {
    name: "VC desks",
    enabled: true,
    queryInput: "lang:en -is:retweet",
    accounts: [
      "TechCrunch",
      "Techmeme",
      "theinformation",
      "PitchBook",
      "crunchbasenews",
      "axios",
      "ycombinator",
      "a16z",
      "sequoia",
      "ProductHunt",
      "StrictlyVC",
      "EricNewcomer",
    ],
    pollIntervalMs: interval,
    slackWebhookUrl: null,
    genericWebhookUrl: null,
  },
];

export function seedRulesForMode(mode: DeskMode): RuleInput[] {
  return mode === "venture" ? VENTURE_SEED_RULES : MARKETS_SEED_RULES;
}

export function seedRuleNames(mode: DeskMode): Set<string> {
  return new Set(seedRulesForMode(mode).map((rule) => rule.name));
}

export function otherSeedRuleNames(mode: DeskMode): Set<string> {
  return seedRuleNames(mode === "venture" ? "markets" : "venture");
}
