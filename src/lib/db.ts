import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { clampPollIntervalMs, databasePath, DEFAULT_POLL_INTERVAL_MS } from "./config";
import { compileQuery, normalizeAccounts } from "./query";
import { MIN_FOLLOWERS, MIN_LIKES, MIN_SIGNAL_SCORE, passesSignalFilter } from "./signal-filter";
import type { Match, NormalizedTweet, Rule, RuleInput, StatusSnapshot } from "./types";

type RuleRow = {
  id: string;
  name: string;
  enabled: number;
  query: string;
  query_input: string;
  accounts_json: string;
  poll_interval_ms: number;
  slack_webhook_url: string | null;
  generic_webhook_url: string | null;
  last_polled_at: string | null;
  last_since_id: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
};

type MatchRow = {
  id: string;
  tweet_id: string;
  rule_id: string;
  rule_name: string;
  author_handle: string;
  author_name: string;
  text: string;
  tweet_created_at: string;
  permalink: string;
  raw_json: string;
  read: number;
  matched_at: string;
  author_followers: number | null;
  like_count: number | null;
  signal_score: number | null;
  signal_pass: number | null;
};

const globalForDb = globalThis as unknown as { signalDb?: Database.Database };

function nowIso(): string {
  return new Date().toISOString();
}

function parseAccounts(json: string): string[] {
  try {
    const parsed = JSON.parse(json) as unknown;
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

function mapRule(row: RuleRow): Rule {
  return {
    id: row.id,
    name: row.name,
    enabled: Boolean(row.enabled),
    query: row.query,
    queryInput: row.query_input,
    accounts: parseAccounts(row.accounts_json),
    pollIntervalMs: row.poll_interval_ms,
    slackWebhookUrl: row.slack_webhook_url,
    genericWebhookUrl: row.generic_webhook_url,
    lastPolledAt: row.last_polled_at,
    lastSinceId: row.last_since_id,
    lastError: row.last_error,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapMatch(row: MatchRow): Match {
  return {
    id: row.id,
    tweetId: row.tweet_id,
    ruleId: row.rule_id,
    ruleName: row.rule_name,
    authorHandle: row.author_handle,
    authorName: row.author_name,
    text: row.text,
    tweetCreatedAt: row.tweet_created_at,
    permalink: row.permalink,
    rawJson: row.raw_json,
    read: Boolean(row.read),
    matchedAt: row.matched_at,
    followersCount: row.author_followers,
    likeCount: row.like_count,
    signalScore: row.signal_score,
  };
}

function migrate(db: Database.Database) {
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    PRAGMA busy_timeout = 5000;

    CREATE TABLE IF NOT EXISTS rules (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      query TEXT NOT NULL,
      query_input TEXT NOT NULL DEFAULT '',
      accounts_json TEXT NOT NULL DEFAULT '[]',
      poll_interval_ms INTEGER NOT NULL DEFAULT ${DEFAULT_POLL_INTERVAL_MS},
      slack_webhook_url TEXT,
      generic_webhook_url TEXT,
      last_polled_at TEXT,
      last_since_id TEXT,
      last_error TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS matches (
      id TEXT PRIMARY KEY,
      tweet_id TEXT NOT NULL,
      rule_id TEXT NOT NULL,
      author_handle TEXT NOT NULL,
      author_name TEXT NOT NULL,
      text TEXT NOT NULL,
      tweet_created_at TEXT NOT NULL,
      permalink TEXT NOT NULL,
      raw_json TEXT NOT NULL,
      read INTEGER NOT NULL DEFAULT 0,
      matched_at TEXT NOT NULL,
      UNIQUE (rule_id, tweet_id),
      FOREIGN KEY (rule_id) REFERENCES rules(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS matches_matched_at_idx ON matches(matched_at DESC);
    CREATE INDEX IF NOT EXISTS matches_rule_id_idx ON matches(rule_id);
    CREATE INDEX IF NOT EXISTS matches_read_idx ON matches(read);

    CREATE TABLE IF NOT EXISTS meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

  ensureColumn(db, "matches", "author_followers", "INTEGER");
  ensureColumn(db, "matches", "like_count", "INTEGER");
  ensureColumn(db, "matches", "signal_score", "REAL");
  ensureColumn(db, "matches", "signal_pass", "INTEGER");
  backfillMatchQuality(db);
}

function ensureColumn(db: Database.Database, table: string, column: string, spec: string) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  if (cols.some((col) => col.name === column)) return;
  db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${spec}`);
}

function metricsFromRaw(rawJson: string): {
  followersCount: number | null;
  likeCount: number | null;
  retweetCount: number;
  replyCount: number;
  quoteCount: number;
  verified: boolean;
} {
  try {
    const raw = JSON.parse(rawJson) as {
      public_metrics?: { like_count?: number; retweet_count?: number; reply_count?: number; quote_count?: number };
      tweet?: { public_metrics?: { like_count?: number; retweet_count?: number; reply_count?: number; quote_count?: number } };
      author?: { verified?: boolean; public_metrics?: { followers_count?: number } };
    };
    const tweetMetrics = raw.tweet?.public_metrics ?? raw.public_metrics;
    const followers = raw.author?.public_metrics?.followers_count;
    return {
      followersCount: typeof followers === "number" ? followers : null,
      likeCount: typeof tweetMetrics?.like_count === "number" ? tweetMetrics.like_count : null,
      retweetCount: tweetMetrics?.retweet_count ?? 0,
      replyCount: tweetMetrics?.reply_count ?? 0,
      quoteCount: tweetMetrics?.quote_count ?? 0,
      verified: Boolean(raw.author?.verified),
    };
  } catch {
    return { followersCount: null, likeCount: null, retweetCount: 0, replyCount: 0, quoteCount: 0, verified: false };
  }
}

function backfillMatchQuality(db: Database.Database) {
  const rows = db.prepare(
    "SELECT id, tweet_id, raw_json, tweet_created_at, author_followers, like_count, signal_pass FROM matches",
  ).all() as Array<{
    id: string;
    tweet_id: string;
    raw_json: string;
    tweet_created_at: string;
    author_followers: number | null;
    like_count: number | null;
    signal_pass: number | null;
  }>;
  const update = db.prepare(
    "UPDATE matches SET author_followers = ?, like_count = ?, signal_score = ?, signal_pass = ? WHERE id = ?",
  );
  for (const row of rows) {
    const metrics = metricsFromRaw(row.raw_json);
    const followers = row.author_followers ?? metrics.followersCount;
    const likes = row.like_count ?? metrics.likeCount;
    if (followers == null && likes == null) {
      const pass = row.tweet_id.startsWith("demo-") ? 1 : 0;
      update.run(null, null, null, pass, row.id);
      continue;
    }
    const quality = {
      followersCount: followers ?? 0,
      likeCount: likes ?? 0,
      retweetCount: metrics.retweetCount,
      replyCount: metrics.replyCount,
      quoteCount: metrics.quoteCount,
      verified: metrics.verified,
      createdAt: row.tweet_created_at,
    };
    const verdict = passesSignalFilter(quality);
    const pass =
      followers == null
        ? likes != null && likes >= MIN_LIKES
          ? 1
          : likes != null
            ? 0
            : null
        : verdict.pass
          ? 1
          : 0;
    update.run(followers, likes, verdict.score, pass, row.id);
  }
}

const SEED_RULES: RuleInput[] = [
  {
    name: "Fed Watch",
    enabled: true,
    queryInput: '(FOMC OR "interest rate" OR "fed funds" OR Powell) lang:en -is:retweet',
    accounts: [],
    pollIntervalMs: 15_000,
    slackWebhookUrl: null,
    genericWebhookUrl: null,
  },
  {
    name: "Mag 7 tape",
    enabled: true,
    queryInput: "(earnings OR guidance OR GPU OR AI) lang:en -is:retweet",
    accounts: ["nvidia", "apple", "meta", "microsoft"],
    pollIntervalMs: 15_000,
    slackWebhookUrl: null,
    genericWebhookUrl: null,
  },
  {
    name: "Crude & OPEC",
    enabled: true,
    queryInput: '(OPEC OR "crude oil" OR WTI OR Brent) lang:en -is:retweet',
    accounts: [],
    pollIntervalMs: 15_000,
    slackWebhookUrl: null,
    genericWebhookUrl: null,
  },
];

function seedIfNeeded(db: Database.Database) {
  const inserted = db.prepare("INSERT OR IGNORE INTO meta (key, value) VALUES ('seeded', ?)").run(nowIso());
  if (inserted.changes !== 1) return;
  const insert = db.prepare(`
    INSERT INTO rules (
      id, name, enabled, query, query_input, accounts_json, poll_interval_ms,
      slack_webhook_url, generic_webhook_url, created_at, updated_at
    ) VALUES (
      @id, @name, @enabled, @query, @query_input, @accounts_json, @poll_interval_ms,
      @slack_webhook_url, @generic_webhook_url, @created_at, @updated_at
    )
  `);
  const ts = nowIso();
  for (const rule of SEED_RULES) {
    const accounts = normalizeAccounts(rule.accounts);
    insert.run({
      id: crypto.randomUUID(),
      name: rule.name,
      enabled: 1,
      query: compileQuery({ query: rule.queryInput, accounts }),
      query_input: rule.queryInput,
      accounts_json: JSON.stringify(accounts),
      poll_interval_ms: clampPollIntervalMs(rule.pollIntervalMs),
      slack_webhook_url: null,
      generic_webhook_url: null,
      created_at: ts,
      updated_at: ts,
    });
  }
}

export function openDatabase(dbPath = databasePath()): Database.Database {
  const resolved = path.resolve(dbPath);
  fs.mkdirSync(path.dirname(resolved), { recursive: true });
  const db = new Database(resolved);
  migrate(db);
  seedIfNeeded(db);
  return db;
}

export function getDb(): Database.Database {
  if (!globalForDb.signalDb) {
    globalForDb.signalDb = openDatabase();
  }
  return globalForDb.signalDb;
}

export function listRules(db = getDb()): Rule[] {
  const rows = db.prepare("SELECT * FROM rules ORDER BY created_at ASC").all() as RuleRow[];
  return rows.map(mapRule);
}

export function listEnabledRules(db = getDb()): Rule[] {
  const rows = db.prepare("SELECT * FROM rules WHERE enabled = 1 ORDER BY created_at ASC").all() as RuleRow[];
  return rows.map(mapRule);
}

export function getRule(id: string, db = getDb()): Rule | null {
  const row = db.prepare("SELECT * FROM rules WHERE id = ?").get(id) as RuleRow | undefined;
  return row ? mapRule(row) : null;
}

export function createRule(input: RuleInput, db = getDb()): Rule {
  const accounts = normalizeAccounts(input.accounts);
  const query = compileQuery({ query: input.queryInput, accounts });
  if (!query) {
    throw new Error("Rule needs a search query or at least one account.");
  }
  const ts = nowIso();
  const id = crypto.randomUUID();
  db.prepare(`
    INSERT INTO rules (
      id, name, enabled, query, query_input, accounts_json, poll_interval_ms,
      slack_webhook_url, generic_webhook_url, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    input.name.trim(),
    input.enabled ? 1 : 0,
    query,
    input.queryInput.trim(),
    JSON.stringify(accounts),
    clampPollIntervalMs(input.pollIntervalMs),
    input.slackWebhookUrl,
    input.genericWebhookUrl,
    ts,
    ts,
  );
  return getRule(id, db)!;
}

export function updateRule(id: string, input: Partial<RuleInput>, db = getDb()): Rule {
  const existing = getRule(id, db);
  if (!existing) throw new Error("Rule not found");
  const merged: RuleInput = {
    name: input.name ?? existing.name,
    enabled: input.enabled ?? existing.enabled,
    queryInput: input.queryInput ?? existing.queryInput,
    accounts: input.accounts ?? existing.accounts,
    pollIntervalMs: input.pollIntervalMs ?? existing.pollIntervalMs,
    slackWebhookUrl: input.slackWebhookUrl === undefined ? existing.slackWebhookUrl : input.slackWebhookUrl,
    genericWebhookUrl: input.genericWebhookUrl === undefined ? existing.genericWebhookUrl : input.genericWebhookUrl,
  };
  const accounts = normalizeAccounts(merged.accounts);
  const query = compileQuery({ query: merged.queryInput, accounts });
  if (!query) throw new Error("Rule needs a search query or at least one account.");
  const ts = nowIso();
  db.prepare(`
    UPDATE rules SET
      name = ?, enabled = ?, query = ?, query_input = ?, accounts_json = ?,
      poll_interval_ms = ?, slack_webhook_url = ?, generic_webhook_url = ?, updated_at = ?
    WHERE id = ?
  `).run(
    merged.name.trim(),
    merged.enabled ? 1 : 0,
    query,
    merged.queryInput.trim(),
    JSON.stringify(accounts),
    clampPollIntervalMs(merged.pollIntervalMs),
    merged.slackWebhookUrl,
    merged.genericWebhookUrl,
    ts,
    id,
  );
  return getRule(id, db)!;
}

export function deleteRule(id: string, db = getDb()): boolean {
  const result = db.prepare("DELETE FROM rules WHERE id = ?").run(id);
  return result.changes > 0;
}

export function markRulePolled(
  id: string,
  fields: { lastPolledAt: string; lastSinceId?: string | null; lastError?: string | null },
  db = getDb(),
) {
  db.prepare(`
    UPDATE rules
    SET last_polled_at = ?, last_since_id = COALESCE(?, last_since_id), last_error = ?, updated_at = ?
    WHERE id = ?
  `).run(fields.lastPolledAt, fields.lastSinceId ?? null, fields.lastError ?? null, nowIso(), id);
}

export function tryInsertMatch(
  rule: Pick<Rule, "id" | "name">,
  tweet: NormalizedTweet,
  db = getDb(),
): { inserted: boolean; matchId: string | null } {
  const id = crypto.randomUUID();
  const verdict = passesSignalFilter(tweet);
  try {
    db.prepare(`
      INSERT INTO matches (
        id, tweet_id, rule_id, author_handle, author_name, text,
        tweet_created_at, permalink, raw_json, read, matched_at,
        author_followers, like_count, signal_score, signal_pass
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?)
    `).run(
      id,
      tweet.id,
      rule.id,
      tweet.authorHandle,
      tweet.authorName,
      tweet.text,
      tweet.createdAt,
      tweet.permalink,
      JSON.stringify(tweet.raw ?? tweet),
      nowIso(),
      tweet.followersCount,
      tweet.likeCount,
      verdict.score,
      verdict.pass ? 1 : 0,
    );
    return { inserted: true, matchId: id };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("UNIQUE") || message.includes("unique")) {
      return { inserted: false, matchId: null };
    }
    throw error;
  }
}

export function listMatches(
  opts: { ruleId?: string; unread?: boolean; limit?: number; quality?: boolean } = {},
  db = getDb(),
): Match[] {
  const limit = Math.min(Math.max(opts.limit ?? 200, 1), 500);
  const clauses: string[] = [];
  const params: unknown[] = [];
  if (opts.ruleId) {
    clauses.push("m.rule_id = ?");
    params.push(opts.ruleId);
  }
  if (opts.unread) {
    clauses.push("m.read = 0");
  }
  if (opts.quality !== false) {
    clauses.push("(m.signal_pass IS NULL OR m.signal_pass = 1)");
  }
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const rows = db.prepare(`
    SELECT m.*, r.name AS rule_name
    FROM matches m
    JOIN rules r ON r.id = m.rule_id
    ${where}
    ORDER BY m.matched_at DESC, m.tweet_created_at DESC
    LIMIT ?
  `).all(...params, limit) as MatchRow[];
  return rows.map(mapMatch);
}

export function setMatchRead(id: string, read: boolean, db = getDb()): Match | null {
  db.prepare("UPDATE matches SET read = ? WHERE id = ?").run(read ? 1 : 0, id);
  const row = db.prepare(`
    SELECT m.*, r.name AS rule_name
    FROM matches m
    JOIN rules r ON r.id = m.rule_id
    WHERE m.id = ?
  `).get(id) as MatchRow | undefined;
  return row ? mapMatch(row) : null;
}

export function markAllMatchesRead(ruleId?: string, db = getDb()): number {
  if (ruleId) {
    return db.prepare("UPDATE matches SET read = 1 WHERE read = 0 AND rule_id = ?").run(ruleId).changes;
  }
  return db.prepare("UPDATE matches SET read = 1 WHERE read = 0").run().changes;
}

export function setMeta(key: string, value: string, db = getDb()) {
  db.prepare("INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(
    key,
    value,
  );
}

export function getMeta(key: string, db = getDb()): string | null {
  const row = db.prepare("SELECT value FROM meta WHERE key = ?").get(key) as { value: string } | undefined;
  return row?.value ?? null;
}

export function getStatus(opts: { demoMode: boolean; bearerPresent: boolean }, db = getDb()): StatusSnapshot {
  const lastHeartbeatAt = getMeta("poller_heartbeat_at", db);
  const startedAt = getMeta("poller_started_at", db);
  const lastPollAt = getMeta("poller_last_poll_at", db);
  const lastError = getMeta("poller_last_error", db);
  const lastErrorAt = getMeta("poller_last_error_at", db);
  const mode = (getMeta("poller_mode", db) as "demo" | "live" | null) ?? "unknown";
  const healthy = lastHeartbeatAt
    ? Date.now() - new Date(lastHeartbeatAt).getTime() < 30_000
    : false;
  const counts = db.prepare(`
    SELECT
      (SELECT COUNT(*) FROM rules) AS rules,
      (SELECT COUNT(*) FROM rules WHERE enabled = 1) AS enabled_rules,
      (SELECT COUNT(*) FROM matches WHERE signal_pass IS NULL OR signal_pass = 1) AS matches,
      (SELECT COUNT(*) FROM matches WHERE read = 0 AND (signal_pass IS NULL OR signal_pass = 1)) AS unread
  `).get() as { rules: number; enabled_rules: number; matches: number; unread: number };

  return {
    demoMode: opts.demoMode,
    bearerToken: opts.bearerPresent ? "present" : "missing",
    poller: {
      healthy,
      startedAt,
      lastHeartbeatAt,
      lastPollAt,
      lastError,
      lastErrorAt,
      mode,
    },
    qualityFilter: {
      minFollowers: MIN_FOLLOWERS,
      minLikes: MIN_LIKES,
      minScore: MIN_SIGNAL_SCORE,
    },
    counts: {
      rules: counts.rules,
      enabledRules: counts.enabled_rules,
      matches: counts.matches,
      unread: counts.unread,
    },
  };
}
