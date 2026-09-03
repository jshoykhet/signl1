import { DEFAULT_POLL_INTERVAL_MS } from "./config";
import type { DeskMode } from "./desk-mode";
import type { MonitorMode } from "./monitor-mode";
import { parseMonitorMode } from "./monitor-mode";
import type { RuleInput } from "./types";

const interval = DEFAULT_POLL_INTERVAL_MS;

export type SeedMonitor = RuleInput & { mode: MonitorMode };

/** People in technology, startups, AI, and venture — not publications or fund brand accounts. */
export const TECH_LEADERS_ACCOUNTS = [
  "pmarca",
  "bhorowitz",
  "cdixon",
  "paulg",
  "garrytan",
  "sama",
  "karpathy",
  "ylecun",
  "elonmusk",
  "satyanadella",
  "sundarpichai",
  "tim_cook",
  "patrickc",
  "naval",
  "rabois",
  "jason",
  "bgurley",
  "fredwilson",
  "vkhosla",
  "eladgil",
  "mwseibel",
  "saranormous",
  "andrewchen",
  "martin_casado",
  "natfriedman",
] as const;

/** Retained for tape/KOL internals — not a default VC monitor. */
export const VC_PUBLICATION_ACCOUNTS = [
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
] as const;

export const MONITOR_RENAMES: Record<string, string> = {
  "Fed Watch": "Fed",
  "Crude & OPEC": "Oil",
  "Funding rounds": "Funding Announcements",
  "Launches & product": "Product Launches",
};

export const RETIRED_DEFAULT_MONITOR_NAMES = ["Mag 7 tape", "VC desks"] as const;

export const DEFAULT_MONITORS: SeedMonitor[] = [
  {
    name: "Fed",
    mode: "markets",
    enabled: true,
    queryInput: '(FOMC OR "interest rate" OR "fed funds" OR Powell) lang:en -is:retweet',
    accounts: [],
    pollIntervalMs: interval,
    slackWebhookUrl: null,
    genericWebhookUrl: null,
  },
  {
    name: "Oil",
    mode: "markets",
    enabled: true,
    queryInput: '(OPEC OR "crude oil" OR WTI OR Brent) lang:en -is:retweet',
    accounts: [],
    pollIntervalMs: interval,
    slackWebhookUrl: null,
    genericWebhookUrl: null,
  },
  {
    name: "Macro",
    mode: "markets",
    enabled: true,
    queryInput:
      '(CPI OR PCE OR NFP OR payrolls OR unemployment OR inflation OR GDP OR "treasury yield" OR Treasuries OR DXY OR "dollar index" OR tariffs OR recession OR "economic data" OR ISM OR PMI OR "jobs report") lang:en -is:retweet',
    accounts: [],
    pollIntervalMs: interval,
    slackWebhookUrl: null,
    genericWebhookUrl: null,
  },
  {
    name: "Tech Leaders",
    mode: "vc",
    enabled: true,
    queryInput: "lang:en -is:retweet",
    accounts: [...TECH_LEADERS_ACCOUNTS],
    pollIntervalMs: interval,
    slackWebhookUrl: null,
    genericWebhookUrl: null,
  },
  {
    name: "Funding Announcements",
    mode: "vc",
    enabled: true,
    queryInput:
      '(raised OR raising OR "series a" OR "series b" OR "series c" OR "series d" OR "seed round" OR "pre-seed" OR "funding round" OR "term sheet" OR valuation OR "led the round") lang:en -is:retweet',
    accounts: [],
    pollIntervalMs: interval,
    slackWebhookUrl: null,
    genericWebhookUrl: null,
  },
  {
    name: "Product Launches",
    mode: "vc",
    enabled: true,
    queryInput:
      '("product launch" OR launches OR "comes out of stealth" OR "open sourced" OR "generally available" OR "general availability" OR "demo day" OR "new model" OR "new API" OR "new platform") lang:en -is:retweet',
    accounts: [],
    pollIntervalMs: interval,
    slackWebhookUrl: null,
    genericWebhookUrl: null,
  },
];

export const MARKETS_SEED_RULES: SeedMonitor[] = DEFAULT_MONITORS.filter((rule) => rule.mode === "markets");
export const VENTURE_SEED_RULES: SeedMonitor[] = DEFAULT_MONITORS.filter((rule) => rule.mode === "vc");

export function seedRulesForMode(mode: DeskMode | MonitorMode): SeedMonitor[] {
  const monitor = parseMonitorMode(mode);
  return DEFAULT_MONITORS.filter((rule) => rule.mode === monitor);
}

export function seedRuleNames(mode: DeskMode | MonitorMode): Set<string> {
  return new Set(seedRulesForMode(mode).map((rule) => rule.name));
}

export function otherSeedRuleNames(mode: DeskMode | MonitorMode): Set<string> {
  return seedRuleNames(parseMonitorMode(mode) === "vc" ? "markets" : "vc");
}
