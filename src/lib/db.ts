import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { clampPollIntervalMs, databasePath, DEFAULT_POLL_INTERVAL_MS, isDemoMode, MAX_WATCHLIST_TICKERS } from "./config";
import { compileQuery, normalizeAccounts } from "./query";
import { likePattern, tokenizeSearch } from "./search";
import {
  isKolHandle,
  isSeedOrEnvHandle,
  kolMode,
  listKolHandles,
  parseHandleList,
  serializeHandleList,
  type KolSpec,
} from "./kol";
import {
  parseBoolMeta,
  parseDigestMinutes,
  parseMinLikes,
  parseSignalLevel,
  parseWhatsAppAlertMode,
  SIGNAL_LEVELS,
  effectiveMinLikes,
  type DeskFilterSettings,
  type WhatsAppCadenceSettings,
} from "./desk-settings";
import { passesSignalFilter, type AuthorPrior, type UserLabel } from "./signal-filter";
import { chunkTickersForQuery, compileCashtagQuery, normalizeTickers } from "./tickers";
import type { Match, NormalizedTweet, Rule, RuleInput, StatusSnapshot, WatchlistSnapshot } from "./types";

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
  kind: string | null;
  watchlist_chunk: number | null;
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
  user_label: string | null;
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
    kind: row.kind === "watchlist" ? "watchlist" : "custom",
    watchlistChunk: typeof row.watchlist_chunk === "number" ? row.watchlist_chunk : null,
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
    userLabel: parseUserLabel(row.user_label),
    authorPrior: { high: 0, low: 0 },
    kol: isKolHandle(row.author_handle, getKolSpec()),
  };
}

function parseUserLabel(value: string | null | undefined): UserLabel | null {
  return value === "high" || value === "low" ? value : null;
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
    CREATE TABLE IF NOT EXISTS tickers (
      symbol TEXT PRIMARY KEY,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      name TEXT,
      image TEXT,
      role TEXT NOT NULL DEFAULT 'operator',
      created_at TEXT NOT NULL,
      last_login_at TEXT
    );

    CREATE TABLE IF NOT EXISTS allowed_emails (
      email TEXT PRIMARY KEY,
      invited_at TEXT NOT NULL,
      invited_by TEXT
    );
  `);

  seedAllowedEmailsFromEnv(db);

  ensureColumn(db, "rules", "kind", "TEXT NOT NULL DEFAULT 'custom'");
  ensureColumn(db, "rules", "watchlist_chunk", "INTEGER");
  ensureColumn(db, "matches", "author_followers", "INTEGER");
  ensureColumn(db, "matches", "like_count", "INTEGER");
  ensureColumn(db, "matches", "signal_score", "REAL");
  ensureColumn(db, "matches", "signal_pass", "INTEGER");
  ensureColumn(db, "matches", "user_label", "TEXT");
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
  const priors = listAuthorPriors(db);
  const rows = db.prepare(
    "SELECT id, tweet_id, raw_json, tweet_created_at, author_handle, text, author_followers, like_count, signal_pass, user_label FROM matches",
  ).all() as Array<{
    id: string;
    tweet_id: string;
    raw_json: string;
    tweet_created_at: string;
    author_handle: string;
    text: string;
    author_followers: number | null;
    like_count: number | null;
    signal_pass: number | null;
    user_label: string | null;
  }>;
  const update = db.prepare(
    "UPDATE matches SET author_followers = ?, like_count = ?, signal_score = ?, signal_pass = ? WHERE id = ?",
  );
  for (const row of rows) {
    const metrics = metricsFromRaw(row.raw_json);
    const followers = row.author_followers ?? metrics.followersCount;
    const likes = row.like_count ?? metrics.likeCount;
    if (followers == null && likes == null) {
      const labeled = parseUserLabel(row.user_label);
      const pass = labeled === "high" ? 1 : labeled === "low" ? 0 : row.tweet_id.startsWith("demo-") ? 1 : 0;
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
      text: row.text,
      authorHandle: row.author_handle,
    };
    const filters = getDeskFilterSettings(db);
    const verdict = passesSignalFilter(quality, Date.now(), {
      userLabel: parseUserLabel(row.user_label),
      prior: priors.get(row.author_handle.toLowerCase()) ?? { high: 0, low: 0 },
      kol: isKolHandle(row.author_handle, getKolSpec(db)),
      ...filters,
    });
    const pass =
      followers == null && parseUserLabel(row.user_label) == null
        ? likes != null && likes >= effectiveMinLikes(filters)
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

export function listAuthorPriors(db = getDb()): Map<string, AuthorPrior> {
  const rows = db.prepare(`
    SELECT lower(author_handle) AS handle,
      COUNT(DISTINCT CASE WHEN user_label = 'high' THEN tweet_id END) AS high,
      COUNT(DISTINCT CASE WHEN user_label = 'low' THEN tweet_id END) AS low
    FROM matches
    WHERE user_label IN ('high', 'low')
    GROUP BY lower(author_handle)
  `).all() as Array<{ handle: string; high: number; low: number }>;
  const map = new Map<string, AuthorPrior>();
  for (const row of rows) {
    map.set(row.handle, { high: Number(row.high), low: Number(row.low) });
  }
  return map;
}

export function getAuthorPrior(handle: string, db = getDb()): AuthorPrior {
  const row = db.prepare(`
    SELECT
      COUNT(DISTINCT CASE WHEN user_label = 'high' THEN tweet_id END) AS high,
      COUNT(DISTINCT CASE WHEN user_label = 'low' THEN tweet_id END) AS low
    FROM matches
    WHERE lower(author_handle) = lower(?) AND user_label IN ('high', 'low')
  `).get(handle) as { high: number; low: number };
  return { high: Number(row.high), low: Number(row.low) };
}

export function getTweetLabel(tweetId: string, db = getDb()): UserLabel | null {
  const row = db.prepare(
    "SELECT user_label FROM matches WHERE tweet_id = ? AND user_label IN ('high', 'low') LIMIT 1",
  ).get(tweetId) as { user_label: string } | undefined;
  return parseUserLabel(row?.user_label);
}

export function getKolSpec(db = getDb()): KolSpec {
  return {
    KOL_HANDLES: process.env.KOL_HANDLES,
    KOL_HANDLES_MODE: process.env.KOL_HANDLES_MODE,
    added: parseHandleList(getMeta("kol_added", db)),
    removed: parseHandleList(getMeta("kol_removed", db)),
  };
}

export function listAuthorFollowerCounts(db = getDb()): Map<string, number> {
  const rows = db.prepare(`
    SELECT lower(author_handle) AS handle, MAX(author_followers) AS followers
    FROM matches
    WHERE author_followers IS NOT NULL
    GROUP BY lower(author_handle)
  `).all() as Array<{ handle: string; followers: number }>;
  const map = new Map<string, number>();
  for (const row of rows) {
    if (!row.handle) continue;
    map.set(row.handle, Number(row.followers));
  }
  return map;
}

export function getDeskFilterSettings(db = getDb()): DeskFilterSettings {
  return {
    kolOnly: parseBoolMeta(getMeta("desk_kol_only", db), false),
    signalLevel: parseSignalLevel(getMeta("desk_signal_level", db)),
    allowFresh: parseBoolMeta(getMeta("desk_allow_fresh", db), true),
    requireEngagement: parseBoolMeta(getMeta("desk_require_engagement", db), false),
    minLikes: parseMinLikes(getMeta("desk_min_likes", db)),
  };
}

export function getWhatsAppCadenceSettings(db = getDb()): WhatsAppCadenceSettings {
  return {
    alertMode: parseWhatsAppAlertMode(getMeta("whatsapp_alert_mode", db)),
    digestMinutes: parseDigestMinutes(getMeta("whatsapp_digest_minutes", db)),
  };
}

export function evaluateTweetSignal(tweet: NormalizedTweet, db = getDb()) {
  const filters = getDeskFilterSettings(db);
  return passesSignalFilter(tweet, Date.now(), {
    prior: getAuthorPrior(tweet.authorHandle, db),
    userLabel: getTweetLabel(tweet.id, db),
    kol: isKolHandle(tweet.authorHandle, getKolSpec(db)),
    ...filters,
  });
}

function attachPriors(matches: Match[], db: Database.Database): Match[] {
  const priors = listAuthorPriors(db);
  return matches.map((match) => ({
    ...match,
    authorPrior: priors.get(match.authorHandle.toLowerCase()) ?? { high: 0, low: 0 },
  }));
}

function getMatchById(id: string, db: Database.Database): Match | null {
  const row = db.prepare(`
    SELECT m.*, r.name AS rule_name
    FROM matches m
    JOIN rules r ON r.id = m.rule_id
    WHERE m.id = ?
  `).get(id) as MatchRow | undefined;
  if (!row) return null;
  return attachPriors([mapMatch(row)], db)[0] ?? null;
}

function recomputeAuthorQuality(handle: string, db: Database.Database) {
  const prior = getAuthorPrior(handle, db);
  const rows = db.prepare(
    `SELECT id, tweet_id, raw_json, tweet_created_at, author_handle, text, author_followers, like_count, user_label
     FROM matches WHERE lower(author_handle) = lower(?)`,
  ).all(handle) as Array<{
    id: string;
    tweet_id: string;
    raw_json: string;
    tweet_created_at: string;
    author_handle: string;
    text: string;
    author_followers: number | null;
    like_count: number | null;
    user_label: string | null;
  }>;
  const update = db.prepare("UPDATE matches SET signal_score = ?, signal_pass = ? WHERE id = ?");
  for (const row of rows) {
    const metrics = metricsFromRaw(row.raw_json);
    const followers = row.author_followers ?? metrics.followersCount ?? 0;
    const likes = row.like_count ?? metrics.likeCount ?? 0;
    const filters = getDeskFilterSettings(db);
    const spec = getKolSpec(db);
    const verdict = passesSignalFilter(
      {
        followersCount: followers,
        likeCount: likes,
        retweetCount: metrics.retweetCount,
        replyCount: metrics.replyCount,
        quoteCount: metrics.quoteCount,
        verified: metrics.verified,
        createdAt: row.tweet_created_at,
        text: row.text,
        authorHandle: row.author_handle,
      },
      Date.now(),
      {
        userLabel: parseUserLabel(row.user_label),
        prior,
        kol: isKolHandle(row.author_handle, spec),
        ...filters,
      },
    );
    update.run(verdict.score, verdict.pass ? 1 : 0, row.id);
  }
}

const SEED_RULES: RuleInput[] = [
  {
    name: "Fed Watch",
    enabled: true,
    queryInput: '(FOMC OR "interest rate" OR "fed funds" OR Powell) lang:en -is:retweet',
    accounts: [],
    pollIntervalMs: DEFAULT_POLL_INTERVAL_MS,
    slackWebhookUrl: null,
    genericWebhookUrl: null,
  },
  {
    name: "Mag 7 tape",
    enabled: true,
    queryInput: "(earnings OR guidance OR GPU OR AI) lang:en -is:retweet",
    accounts: ["nvidia", "apple", "meta", "microsoft"],
    pollIntervalMs: DEFAULT_POLL_INTERVAL_MS,
    slackWebhookUrl: null,
    genericWebhookUrl: null,
  },
  {
    name: "Crude & OPEC",
    enabled: true,
    queryInput: '(OPEC OR "crude oil" OR WTI OR Brent) lang:en -is:retweet',
    accounts: [],
    pollIntervalMs: DEFAULT_POLL_INTERVAL_MS,
    slackWebhookUrl: null,
    genericWebhookUrl: null,
  },
];

function seedAllowedEmailsFromEnv(db: Database.Database) {
  const insert = db.prepare(
    "INSERT OR IGNORE INTO allowed_emails (email, invited_at, invited_by) VALUES (?, ?, 'env')",
  );
  const ts = nowIso();
  for (const part of (process.env.AUTH_ALLOWED_EMAILS ?? "").split(/[,;\s]+/)) {
    const email = part.trim().toLowerCase();
    if (!email || !email.includes("@") || !email.includes(".")) continue;
    insert.run(email, ts);
  }
}

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
  if (existing.kind === "watchlist") {
    throw new Error("Watchlist cashtag rules are edited on the Watchlist page.");
  }
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
  const existing = getRule(id, db);
  if (!existing) return false;
  if (existing.kind === "watchlist") {
    throw new Error("Watchlist cashtag rules are edited on the Watchlist page.");
  }
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
  const verdict = evaluateTweetSignal(tweet, db);
  try {
    db.prepare(`
      INSERT INTO matches (
        id, tweet_id, rule_id, author_handle, author_name, text,
        tweet_created_at, permalink, raw_json, read, matched_at,
        author_followers, like_count, signal_score, signal_pass, user_label
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?)
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
      verdict.userLabel,
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
  opts: { ruleId?: string; unread?: boolean; limit?: number; quality?: boolean; q?: string } = {},
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
    clauses.push("(m.signal_pass IS NULL OR m.signal_pass = 1 OR m.user_label IN ('high', 'low'))");
    if (!isDemoMode()) {
      clauses.push("m.tweet_id NOT LIKE 'demo-%'");
    }
  }
  for (const token of tokenizeSearch(opts.q ?? "")) {
    clauses.push(
      `(lower(m.text) LIKE ? ESCAPE char(92) OR lower(m.author_handle) LIKE ? ESCAPE char(92) OR lower(m.author_name) LIKE ? ESCAPE char(92) OR lower(r.name) LIKE ? ESCAPE char(92) OR lower(m.tweet_id) LIKE ? ESCAPE char(92))`,
    );
    const pattern = likePattern(token);
    params.push(pattern, pattern, pattern, pattern, pattern);
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
  return attachPriors(rows.map(mapMatch), db);
}

export function listMatchesSince(iso: string, limit = 400, db = getDb()): Match[] {
  const rows = db.prepare(`
    SELECT m.*, r.name AS rule_name
    FROM matches m
    JOIN rules r ON r.id = m.rule_id
    WHERE m.matched_at > ?
      AND (m.signal_pass IS NULL OR m.signal_pass = 1)
    ORDER BY m.matched_at ASC
    LIMIT ?
  `).all(iso, Math.min(Math.max(limit, 1), 400)) as MatchRow[];
  return attachPriors(rows.map(mapMatch), db);
}

export function setMatchRead(id: string, read: boolean, db = getDb()): Match | null {
  db.prepare("UPDATE matches SET read = ? WHERE id = ?").run(read ? 1 : 0, id);
  return getMatchById(id, db);
}

export function setMatchLabel(id: string, label: UserLabel | null, db = getDb()): Match | null {
  const existing = db.prepare("SELECT id, tweet_id, author_handle FROM matches WHERE id = ?").get(id) as
    | { id: string; tweet_id: string; author_handle: string }
    | undefined;
  if (!existing) return null;
  db.prepare("UPDATE matches SET user_label = ? WHERE tweet_id = ?").run(label, existing.tweet_id);
  recomputeAuthorQuality(existing.author_handle, db);
  return getMatchById(id, db);
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

export function requestManualPoll(db = getDb()): { requestedAt: string } {
  const requestedAt = nowIso();
  setMeta("poller_force_now", requestedAt, db);
  setMeta("poller_manual_requested_at", requestedAt, db);
  return { requestedAt };
}

export function takeManualPollRequest(db = getDb()): boolean {
  const raw = getMeta("poller_force_now", db);
  if (!raw) return false;
  setMeta("poller_force_now", "", db);
  setMeta("poller_manual_ack_at", nowIso(), db);
  return true;
}

export function takeMetaValue(key: string, db = getDb()): string | null {
  const raw = getMeta(key, db);
  if (!raw) return null;
  setMeta(key, "", db);
  return raw;
}

export function getWhatsAppTo(db = getDb()): string | null {
  const stored = getMeta("whatsapp_to", db)?.trim();
  if (stored) return stored;
  const fromEnv = process.env.WHATSAPP_TO?.trim();
  return fromEnv || null;
}

export function isWhatsAppEnabled(db = getDb()): boolean {
  const raw = getMeta("whatsapp_enabled", db);
  return raw !== "0" && raw !== "false";
}

export function setDeskFilterSettings(input: Partial<DeskFilterSettings>, db = getDb()): DeskFilterSettings {
  if (typeof input.kolOnly === "boolean") setMeta("desk_kol_only", input.kolOnly ? "1" : "0", db);
  if (input.signalLevel) setMeta("desk_signal_level", parseSignalLevel(input.signalLevel), db);
  if (typeof input.allowFresh === "boolean") setMeta("desk_allow_fresh", input.allowFresh ? "1" : "0", db);
  if (typeof input.requireEngagement === "boolean") {
    setMeta("desk_require_engagement", input.requireEngagement ? "1" : "0", db);
  }
  if ("minLikes" in input) {
    const parsed = parseMinLikes(input.minLikes);
    setMeta("desk_min_likes", parsed == null ? "" : String(parsed), db);
  }
  return getDeskFilterSettings(db);
}

export function addKolHandle(handle: string, db = getDb()): string[] {
  const normalized = handle.replace(/^@/, "").trim();
  if (!/^[A-Za-z0-9_]{1,15}$/.test(normalized)) {
    throw new Error("Handle must be 1–15 letters, numbers, or underscores");
  }
  const spec = getKolSpec(db);
  const key = normalized.toLowerCase();
  const added = isSeedOrEnvHandle(key, spec)
    ? (spec.added ?? []).filter((h) => h !== key)
    : [...new Set([...(spec.added ?? []), key])];
  const removed = (spec.removed ?? []).filter((h) => h !== key);
  setMeta("kol_added", serializeHandleList(added), db);
  setMeta("kol_removed", serializeHandleList(removed), db);
  return listKolHandles(getKolSpec(db));
}

export function removeKolHandle(handle: string, db = getDb()): string[] {
  const normalized = handle.replace(/^@/, "").trim().toLowerCase();
  const spec = getKolSpec(db);
  const added = (spec.added ?? []).filter((h) => h !== normalized);
  const removed = [...new Set([...(spec.removed ?? []), normalized])];
  setMeta("kol_added", serializeHandleList(added), db);
  setMeta("kol_removed", serializeHandleList(removed), db);
  return listKolHandles(getKolSpec(db));
}

export function resetKolHandles(db = getDb()): string[] {
  setMeta("kol_added", "", db);
  setMeta("kol_removed", "", db);
  return listKolHandles(getKolSpec(db));
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
      (SELECT COUNT(*) FROM matches WHERE (signal_pass IS NULL OR signal_pass = 1) ${opts.demoMode ? "" : "AND tweet_id NOT LIKE 'demo-%'"}) AS matches,
      (SELECT COUNT(*) FROM matches WHERE read = 0 AND (signal_pass IS NULL OR signal_pass = 1) ${opts.demoMode ? "" : "AND tweet_id NOT LIKE 'demo-%'"}) AS unread,
      (SELECT COUNT(*) FROM tickers) AS tickers
  `).get() as { rules: number; enabled_rules: number; matches: number; unread: number; tickers: number };

  const training = db.prepare(`
    SELECT
      COUNT(DISTINCT CASE WHEN user_label = 'high' THEN tweet_id END) AS high,
      COUNT(DISTINCT CASE WHEN user_label = 'low' THEN tweet_id END) AS low
    FROM matches
  `).get() as { high: number; low: number };

  const searchRequests = Number(getMeta("x_search_requests", db) ?? "0") || 0;
  const lastPackedQueries = Number(getMeta("x_last_packed_queries", db) ?? "0") || 0;
  const remainingRaw = getMeta("x_rate_limit_remaining", db);
  const limitRaw = getMeta("x_rate_limit_limit", db);
  const resetRaw = getMeta("x_rate_limit_reset_at", db);
  const idleBackoffMs = Number(getMeta("poller_idle_backoff_ms", db) ?? "0") || 0;
  const forceNow = getMeta("poller_force_now", db);
  const lastManualPollAt = getMeta("poller_manual_ack_at", db);
  const spec = getKolSpec(db);
  const kolHandles = listKolHandles(spec);
  const filters = getDeskFilterSettings(db);
  const floors = SIGNAL_LEVELS[filters.signalLevel];

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
      searchRequests,
      lastPackedQueries,
      rateLimitRemaining: remainingRaw != null && remainingRaw !== "" ? Number(remainingRaw) : null,
      rateLimitLimit: limitRaw != null && limitRaw !== "" ? Number(limitRaw) : null,
      rateLimitResetAt: resetRaw,
      idleBackoffMs,
      manualPollPending: Boolean(forceNow),
      lastManualPollAt,
    },
    qualityFilter: {
      minFollowers: floors.minFollowers,
      minLikes: effectiveMinLikes(filters),
      minScore: floors.minScore,
      minDeskScore: floors.minDesk,
    },
    deskFilters: filters,
    kol: {
      count: kolHandles.length,
      mode: kolMode(),
      added: spec.added ?? [],
      removed: spec.removed ?? [],
    },
    training: {
      high: Number(training.high),
      low: Number(training.low),
    },
    counts: {
      rules: counts.rules,
      enabledRules: counts.enabled_rules,
      matches: counts.matches,
      unread: counts.unread,
      tickers: counts.tickers,
    },
  };
}

export function listTickers(db = getDb()): string[] {
  const rows = db.prepare("SELECT symbol FROM tickers ORDER BY symbol ASC").all() as Array<{ symbol: string }>;
  return rows.map((row) => row.symbol);
}

function listWatchlistRules(db: Database.Database): Rule[] {
  const rows = db.prepare(
    "SELECT * FROM rules WHERE kind = 'watchlist' ORDER BY COALESCE(watchlist_chunk, 0) ASC, created_at ASC",
  ).all() as RuleRow[];
  return rows.map(mapRule);
}

function watchlistEnabled(db: Database.Database): boolean {
  return (getMeta("watchlist_enabled", db) ?? "1") !== "0";
}

function watchlistPollIntervalMs(db: Database.Database): number {
  return clampPollIntervalMs(Number(getMeta("watchlist_poll_interval_ms", db) ?? DEFAULT_POLL_INTERVAL_MS));
}

export function getWatchlist(db = getDb()): WatchlistSnapshot {
  const tickers = listTickers(db);
  const rules = listWatchlistRules(db);
  return {
    tickers,
    enabled: watchlistEnabled(db),
    pollIntervalMs: watchlistPollIntervalMs(db),
    compiledQueries: chunkTickersForQuery(tickers).map((chunk) => compileCashtagQuery(chunk)),
    rules: rules.map((rule) => ({
      id: rule.id,
      name: rule.name,
      enabled: rule.enabled,
      query: rule.query,
      lastPolledAt: rule.lastPolledAt,
      lastError: rule.lastError,
    })),
  };
}

export function syncWatchlistRules(db = getDb()) {
  const tickers = listTickers(db);
  const enabled = watchlistEnabled(db) && tickers.length > 0;
  const interval = watchlistPollIntervalMs(db);
  const chunks = chunkTickersForQuery(tickers);
  const existing = listWatchlistRules(db);
  const ts = nowIso();

  const apply = db.transaction(() => {
    if (chunks.length === 0) {
      for (const rule of existing) {
        db.prepare("DELETE FROM rules WHERE id = ?").run(rule.id);
      }
      return;
    }
    for (let i = 0; i < chunks.length; i += 1) {
      const query = compileCashtagQuery(chunks[i]);
      const name = chunks.length === 1 ? "Watchlist" : `Watchlist ${i + 1}`;
      const current = existing[i];
      if (current) {
        db.prepare(`
          UPDATE rules SET
            name = ?, enabled = ?, query = ?, query_input = ?,
            poll_interval_ms = ?, watchlist_chunk = ?, kind = 'watchlist', updated_at = ?
          WHERE id = ?
        `).run(name, enabled ? 1 : 0, query, query, interval, i, ts, current.id);
      } else {
        db.prepare(`
          INSERT INTO rules (
            id, name, enabled, query, query_input, accounts_json, poll_interval_ms,
            slack_webhook_url, generic_webhook_url, created_at, updated_at, kind, watchlist_chunk
          ) VALUES (?, ?, ?, ?, ?, '[]', ?, NULL, NULL, ?, ?, 'watchlist', ?)
        `).run(crypto.randomUUID(), name, enabled ? 1 : 0, query, query, interval, ts, ts, i);
      }
    }
    for (const extra of existing.slice(chunks.length)) {
      db.prepare("DELETE FROM rules WHERE id = ?").run(extra.id);
    }
  });
  apply();
}

export function replaceTickers(input: string[] | string, db = getDb()): WatchlistSnapshot {
  const symbols = normalizeTickers(input);
  if (symbols.length > MAX_WATCHLIST_TICKERS) {
    throw new Error(`Watchlist is capped at ${MAX_WATCHLIST_TICKERS} tickers.`);
  }
  const write = db.transaction(() => {
    db.prepare("DELETE FROM tickers").run();
    const insert = db.prepare("INSERT INTO tickers (symbol, created_at) VALUES (?, ?)");
    const ts = nowIso();
    for (const symbol of symbols) insert.run(symbol, ts);
    syncWatchlistRules(db);
  });
  write();
  return getWatchlist(db);
}

export function addTickers(input: string[] | string, db = getDb()): WatchlistSnapshot {
  return replaceTickers([...listTickers(db), ...normalizeTickers(input)], db);
}

export function removeTickers(input: string[] | string, db = getDb()): WatchlistSnapshot {
  const drop = new Set(normalizeTickers(input));
  return replaceTickers(
    listTickers(db).filter((symbol) => !drop.has(symbol)),
    db,
  );
}

export function setWatchlistSettings(
  input: { enabled?: boolean; pollIntervalMs?: number },
  db = getDb(),
): WatchlistSnapshot {
  if (input.enabled !== undefined) {
    setMeta("watchlist_enabled", input.enabled ? "1" : "0", db);
  }
  if (input.pollIntervalMs !== undefined) {
    setMeta("watchlist_poll_interval_ms", String(clampPollIntervalMs(input.pollIntervalMs)), db);
  }
  syncWatchlistRules(db);
  return getWatchlist(db);
}
