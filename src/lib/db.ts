import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { clampPollIntervalMs, databasePath, DEFAULT_POLL_INTERVAL_MS, isDemoMode, MAX_LIVE_CUSTOM_RULES, MAX_WATCHLIST_TICKERS, WATCHLIST_QUERY_BUDGET } from "./config";
import { queryHash } from "./query-hash";
import { chunkHandlesForFromQuery, compileKeyLeadersQuery, compileQuery, isWatchedAuthor, normalizeAccounts } from "./query";
import { ruleFitsFocus, sqlFocusMode } from "./feed-scope";
import { likePattern, tokenizeSearch } from "./search";
import {
  isSeedOrEnvHandle,
  kolMode,
  listKolHandles,
  loadKolHandleSet,
  normalizeHandle,
  parseHandleList,
  packsForDeskMode,
  serializeHandleList,
  unionHandleSets,
  type KolPackId,
  type KolSpec,
} from "./kol";
import {
  isBlockedHandle,
  isEnvBlockedHandle,
  listBlockedHandles,
  type BlockedSpec,
} from "./blocked";
import {
  parseBoolMeta,
  parseDeskMode,
  parseDigestMinutes,
  parseMinLikes,
  parseSignalLevel,
  SIGNAL_LEVELS,
  effectiveMinLikes,
  resolvedMinLikes,
  type DeskFilterPatch,
  type DeskFilterSettings,
  type WhatsAppCadenceSettings,
} from "./desk-settings";
import {
  MARKETS_DEFAULT_NAMES,
  VC_DEFAULT_NAMES,
  monitorModeFromDeskMode,
  parseMonitorMode,
  type MonitorMode,
} from "./monitor-mode";
import {
  DEFAULT_MONITORS,
  MONITOR_RENAMES,
  RETIRED_DEFAULT_MONITOR_NAMES,
  UNEDITED_SEED_QUERY_UPGRADES,
} from "./seed-rules";
import { passesSignalFilter, type AuthorPrior, type UserLabel } from "./signal-filter";
import { chunkTickersForQuery, compileCashtagQuery, normalizeTickers } from "./tickers";
import { estimateReadUsd } from "./x-cost";
import type { Match, NormalizedTweet, Rule, RuleInput, StatusSnapshot, WatchlistSnapshot } from "./types";

type RuleRow = {
  id: string;
  user_id: string | null;
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
  mode: string | null;
};

type MatchRow = {
  id: string;
  user_id: string | null;
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
    userId: row.user_id || "",
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
    kind:
      row.kind === "watchlist"
        ? "watchlist"
        : row.kind === "key_leaders"
          ? "key_leaders"
          : "custom",
    watchlistChunk: typeof row.watchlist_chunk === "number" ? row.watchlist_chunk : null,
    mode: parseMonitorMode(row.mode),
  };
}

function mapMatch(row: MatchRow, db: Database.Database): Match {
  const userId = row.user_id || "";
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
    kol: getEffectiveKolHandleSet(userId, db).has(normalizeHandle(row.author_handle)),
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
      disabled INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      last_login_at TEXT
    );

    CREATE TABLE IF NOT EXISTS allowed_emails (
      email TEXT PRIMARY KEY,
      invited_at TEXT NOT NULL,
      invited_by TEXT
    );

    CREATE TABLE IF NOT EXISTS user_meta (
      user_id TEXT NOT NULL,
      key TEXT NOT NULL,
      value TEXT NOT NULL,
      PRIMARY KEY (user_id, key)
    );

    CREATE TABLE IF NOT EXISTS login_events (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      logged_in_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS login_events_user_id_idx ON login_events(user_id);
    CREATE INDEX IF NOT EXISTS login_events_logged_in_at_idx ON login_events(logged_in_at DESC);
  `);

  seedAllowedEmailsFromEnv(db);

  ensureColumn(db, "rules", "kind", "TEXT NOT NULL DEFAULT 'custom'");
  ensureColumn(db, "rules", "watchlist_chunk", "INTEGER");
  ensureColumn(db, "rules", "user_id", "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, "rules", "mode", "TEXT NOT NULL DEFAULT 'markets'");
  ensureColumn(db, "matches", "author_followers", "INTEGER");
  ensureColumn(db, "matches", "like_count", "INTEGER");
  ensureColumn(db, "matches", "signal_score", "REAL");
  ensureColumn(db, "matches", "signal_pass", "INTEGER");
  ensureColumn(db, "matches", "user_label", "TEXT");
  ensureColumn(db, "matches", "user_id", "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, "users", "disabled", "INTEGER NOT NULL DEFAULT 0");
  db.exec(`
    CREATE INDEX IF NOT EXISTS rules_user_id_idx ON rules(user_id);
    CREATE INDEX IF NOT EXISTS matches_user_id_idx ON matches(user_id);
  `);
  migrateTickersToDesk(db);
  backfillMatchUserIds(db);
  migrateSharedTape(db);
  backfillMatchQuality(db);
  backfillLoginEvents(db);
}

function stampRuleQueryHashes(db: Database.Database) {
  const rows = db.prepare("SELECT id, query FROM rules").all() as Array<{ id: string; query: string }>;
  const update = db.prepare("UPDATE rules SET query_hash = ? WHERE id = ?");
  for (const row of rows) {
    update.run(queryHash(row.query ?? ""), row.id);
  }
}

function migrateSharedTape(db: Database.Database) {
  ensureColumn(db, "rules", "query_hash", "TEXT");
  db.exec(`
    CREATE TABLE IF NOT EXISTS posts (
      tweet_id TEXT PRIMARY KEY,
      author_handle TEXT NOT NULL,
      author_name TEXT NOT NULL,
      text TEXT NOT NULL,
      tweet_created_at TEXT NOT NULL,
      permalink TEXT NOT NULL,
      raw_json TEXT NOT NULL,
      author_followers INTEGER,
      like_count INTEGER,
      first_seen_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS post_hits (
      tweet_id TEXT NOT NULL,
      query_hash TEXT NOT NULL,
      rule_name TEXT NOT NULL,
      rule_kind TEXT,
      rule_mode TEXT,
      matched_at TEXT NOT NULL,
      PRIMARY KEY (tweet_id, query_hash)
    );
    CREATE TABLE IF NOT EXISTS user_post_state (
      user_id TEXT NOT NULL,
      tweet_id TEXT NOT NULL,
      read INTEGER NOT NULL DEFAULT 0,
      user_label TEXT,
      PRIMARY KEY (user_id, tweet_id)
    );
    CREATE INDEX IF NOT EXISTS post_hits_hash_idx ON post_hits(query_hash, matched_at DESC);
    CREATE INDEX IF NOT EXISTS rules_query_hash_idx ON rules(user_id, query_hash);
    CREATE INDEX IF NOT EXISTS user_post_state_user_idx ON user_post_state(user_id, read);
  `);
  stampRuleQueryHashes(db);
  db.exec(`
    INSERT OR IGNORE INTO posts (
      tweet_id, author_handle, author_name, text, tweet_created_at, permalink, raw_json,
      author_followers, like_count, first_seen_at
    )
    SELECT tweet_id, author_handle, author_name, text, tweet_created_at, permalink, raw_json,
      MAX(author_followers), MAX(like_count), MIN(matched_at)
    FROM matches
    GROUP BY tweet_id;

    INSERT OR IGNORE INTO post_hits (tweet_id, query_hash, rule_name, rule_kind, rule_mode, matched_at)
    SELECT m.tweet_id, r.query_hash, MIN(r.name), MIN(r.kind), MIN(r.mode), MIN(m.matched_at)
    FROM matches m
    JOIN rules r ON r.id = m.rule_id
    WHERE r.query_hash IS NOT NULL AND r.query_hash != ''
    GROUP BY m.tweet_id, r.query_hash;

    INSERT OR IGNORE INTO user_post_state (user_id, tweet_id, read, user_label)
    SELECT user_id, tweet_id, MAX(read),
      MAX(CASE WHEN user_label IN ('high', 'low') THEN user_label END)
    FROM matches
    WHERE user_id IS NOT NULL AND user_id != ''
    GROUP BY user_id, tweet_id;
  `);
}

function backfillLoginEvents(db: Database.Database) {
  db.prepare(
    `INSERT INTO login_events (id, user_id, logged_in_at)
     SELECT lower(hex(randomblob(16))), id, COALESCE(last_login_at, created_at)
     FROM users
     WHERE COALESCE(last_login_at, created_at) IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM login_events WHERE user_id = users.id)`,
  ).run();
}

function ensureColumn(db: Database.Database, table: string, column: string, spec: string) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  if (cols.some((col) => col.name === column)) return;
  db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${spec}`);
}

const DESK_META_KEYS = [
  "desk_mode",
  "desk_kol_only",
  "desk_signal_level",
  "desk_allow_fresh",
  "desk_require_engagement",
  "desk_min_likes",
  "desk_hide_crypto",
  "desk_hide_messaging",
  "kol_added",
  "kol_removed",
  "kol_markets_added",
  "kol_markets_removed",
  "kol_venture_added",
  "kol_venture_removed",
  "blocked_added",
  "blocked_removed",
  "whatsapp_to",
  "whatsapp_enabled",
  "whatsapp_alert_mode",
  "whatsapp_digest_minutes",
  "whatsapp_digest_last_at",
  "whatsapp_agent_enabled",
  "whatsapp_agent_last_at",
  "whatsapp_agent_last_query",
  "inbox_last_polled_at",
  "watchlist_enabled",
  "watchlist_poll_interval_ms",
  "key_leaders_enabled",
  "monitor_mode",
  "launch_tracked",
  "launch_muted",
] as const;

function migrateTickersToDesk(db: Database.Database) {
  const cols = db.prepare("PRAGMA table_info(tickers)").all() as Array<{ name: string }>;
  if (cols.length === 0) {
    db.exec(`
      CREATE TABLE tickers (
        user_id TEXT NOT NULL,
        symbol TEXT NOT NULL,
        created_at TEXT NOT NULL,
        PRIMARY KEY (user_id, symbol)
      );
    `);
    return;
  }
  if (cols.some((col) => col.name === "user_id")) return;
  db.exec(`
    CREATE TABLE tickers_desk (
      user_id TEXT NOT NULL,
      symbol TEXT NOT NULL,
      created_at TEXT NOT NULL,
      PRIMARY KEY (user_id, symbol)
    );
    INSERT INTO tickers_desk (user_id, symbol, created_at)
      SELECT '', symbol, created_at FROM tickers;
    DROP TABLE tickers;
    ALTER TABLE tickers_desk RENAME TO tickers;
  `);
}

function backfillMatchUserIds(db: Database.Database) {
  db.exec(`
    UPDATE matches
    SET user_id = COALESCE((SELECT user_id FROM rules WHERE rules.id = matches.rule_id), user_id)
    WHERE user_id = '' OR user_id IS NULL
  `);
}

function metricsFromRaw(rawJson: string): {
  followersCount: number | null;
  likeCount: number | null;
  retweetCount: number;
  replyCount: number;
  quoteCount: number;
  impressionCount: number;
  verified: boolean;
  isReply: boolean;
} {
  try {
    const raw = JSON.parse(rawJson) as {
      text?: string;
      in_reply_to_user_id?: string | null;
      public_metrics?: {
        like_count?: number;
        retweet_count?: number;
        reply_count?: number;
        quote_count?: number;
        impression_count?: number;
      };
      tweet?: {
        text?: string;
        in_reply_to_user_id?: string | null;
        public_metrics?: {
          like_count?: number;
          retweet_count?: number;
          reply_count?: number;
          quote_count?: number;
          impression_count?: number;
        };
      };
      author?: { verified?: boolean; public_metrics?: { followers_count?: number } };
    };
    const tweet = raw.tweet ?? raw;
    const tweetMetrics = tweet.public_metrics ?? raw.public_metrics;
    const text = String(tweet.text ?? raw.text ?? "");
    const followers = raw.author?.public_metrics?.followers_count;
    return {
      followersCount: typeof followers === "number" ? followers : null,
      likeCount: typeof tweetMetrics?.like_count === "number" ? tweetMetrics.like_count : null,
      retweetCount: tweetMetrics?.retweet_count ?? 0,
      replyCount: tweetMetrics?.reply_count ?? 0,
      quoteCount: tweetMetrics?.quote_count ?? 0,
      impressionCount: tweetMetrics?.impression_count ?? 0,
      verified: Boolean(raw.author?.verified),
      isReply: Boolean(tweet.in_reply_to_user_id) || /^@\w/.test(text.trim()),
    };
  } catch {
    return {
      followersCount: null,
      likeCount: null,
      retweetCount: 0,
      replyCount: 0,
      quoteCount: 0,
      impressionCount: 0,
      verified: false,
      isReply: false,
    };
  }
}

function backfillMatchQuality(db: Database.Database, userId?: string) {
  const priorCache = new Map<string, Map<string, AuthorPrior>>();
  const priorsFor = (uid: string) => {
    const cached = priorCache.get(uid);
    if (cached) return cached;
    const next = listAuthorPriors(uid, db);
    priorCache.set(uid, next);
    return next;
  };
  const sql =
    "SELECT m.id, m.user_id, m.tweet_id, m.raw_json, m.tweet_created_at, m.author_handle, m.text, m.author_followers, m.like_count, m.signal_pass, m.user_label, r.accounts_json FROM matches m LEFT JOIN rules r ON r.id = m.rule_id" +
    (userId ? " WHERE m.user_id = ?" : "");
  const rows = (userId ? db.prepare(sql).all(userId) : db.prepare(sql).all()) as Array<{
    id: string;
    user_id: string | null;
    tweet_id: string;
    raw_json: string;
    tweet_created_at: string;
    author_handle: string;
    text: string;
    author_followers: number | null;
    like_count: number | null;
    signal_pass: number | null;
    user_label: string | null;
    accounts_json: string | null;
  }>;
  const update = db.prepare(
    "UPDATE matches SET author_followers = ?, like_count = ?, signal_score = ?, signal_pass = ? WHERE id = ?",
  );
  for (const row of rows) {
    const uid = row.user_id || userId || "";
    const metrics = metricsFromRaw(row.raw_json);
    const followers = row.author_followers ?? metrics.followersCount;
    const likes = row.like_count ?? metrics.likeCount;
    const filters = getDeskFilterSettings(uid, db);
    if (followers == null && likes == null) {
      const labeled = parseUserLabel(row.user_label);
      const blocked = isBlockedHandle(row.author_handle, getBlockedSpec(uid, db));
      const pass = blocked
        ? 0
        : labeled === "high"
          ? 1
          : labeled === "low"
            ? 0
            : row.tweet_id.startsWith("demo-")
              ? 1
              : 0;
      update.run(null, null, null, pass, row.id);
      continue;
    }
    const quality = {
      followersCount: followers ?? 0,
      likeCount: likes ?? 0,
      retweetCount: metrics.retweetCount,
      replyCount: metrics.replyCount,
      quoteCount: metrics.quoteCount,
      impressionCount: metrics.impressionCount,
      verified: metrics.verified,
      createdAt: row.tweet_created_at,
      text: row.text,
      authorHandle: row.author_handle,
      isReply: metrics.isReply || /^@\w/.test((row.text ?? "").trim()),
    };
    const flags = authorSignalFlags(row.author_handle, uid, db);
    const verdict = passesSignalFilter(quality, Date.now(), {
      userLabel: parseUserLabel(row.user_label),
      prior: priorsFor(uid).get(row.author_handle.toLowerCase()) ?? { high: 0, low: 0 },
      ...flags,
      ...filters,
      watchedAuthor: isWatchedAuthor(parseAccounts(row.accounts_json ?? "[]"), row.author_handle),
    });
    update.run(followers, likes, verdict.score, verdict.pass ? 1 : 0, row.id);
  }
}

export function listAuthorPriors(userId: string, db = getDb()): Map<string, AuthorPrior> {
  const rows = db.prepare(`
    SELECT lower(p.author_handle) AS handle,
      COUNT(DISTINCT CASE WHEN s.user_label = 'high' THEN s.tweet_id END) AS high,
      COUNT(DISTINCT CASE WHEN s.user_label = 'low' THEN s.tweet_id END) AS low
    FROM user_post_state s
    JOIN posts p ON p.tweet_id = s.tweet_id
    WHERE s.user_id = ? AND s.user_label IN ('high', 'low')
    GROUP BY lower(p.author_handle)
  `).all(userId) as Array<{ handle: string; high: number; low: number }>;
  const map = new Map<string, AuthorPrior>();
  for (const row of rows) {
    map.set(row.handle, { high: Number(row.high), low: Number(row.low) });
  }
  return map;
}

export function getAuthorPrior(handle: string, userId: string, db = getDb()): AuthorPrior {
  const row = db.prepare(`
    SELECT
      COUNT(DISTINCT CASE WHEN s.user_label = 'high' THEN s.tweet_id END) AS high,
      COUNT(DISTINCT CASE WHEN s.user_label = 'low' THEN s.tweet_id END) AS low
    FROM user_post_state s
    JOIN posts p ON p.tweet_id = s.tweet_id
    WHERE s.user_id = ? AND lower(p.author_handle) = lower(?) AND s.user_label IN ('high', 'low')
  `).get(userId, handle) as { high: number; low: number };
  return { high: Number(row.high), low: Number(row.low) };
}

export function getTweetLabel(tweetId: string, userId: string, db = getDb()): UserLabel | null {
  const row = db.prepare(
    "SELECT user_label FROM user_post_state WHERE tweet_id = ? AND user_id = ? AND user_label IN ('high', 'low') LIMIT 1",
  ).get(tweetId, userId) as { user_label: string } | undefined;
  return parseUserLabel(row?.user_label);
}

const KOL_PACK_META: Record<KolPackId, { added: string; removed: string }> = {
  markets: { added: "kol_markets_added", removed: "kol_markets_removed" },
  venture: { added: "kol_venture_added", removed: "kol_venture_removed" },
};

const KOL_PACKS_MIGRATED_META = "kol_packs_v1";

export function migrateKolPacks(userId: string, db = getDb()) {
  if (!userId) return;
  if (getUserMeta(userId, KOL_PACKS_MIGRATED_META, db)) return;
  const added = getUserMeta(userId, "kol_added", db) ?? "";
  const removed = getUserMeta(userId, "kol_removed", db) ?? "";
  for (const pack of ["markets", "venture"] as const) {
    const keys = KOL_PACK_META[pack];
    if (!getUserMeta(userId, keys.added, db) && added) setUserMeta(userId, keys.added, added, db);
    if (!getUserMeta(userId, keys.removed, db) && removed) setUserMeta(userId, keys.removed, removed, db);
  }
  setUserMeta(userId, KOL_PACKS_MIGRATED_META, nowIso(), db);
}

export function getKolPackSpec(userId: string, pack: KolPackId, db = getDb()): KolSpec {
  migrateKolPacks(userId, db);
  const keys = KOL_PACK_META[pack];
  return {
    KOL_HANDLES: process.env.KOL_HANDLES,
    KOL_HANDLES_MODE: process.env.KOL_HANDLES_MODE,
    deskMode: pack,
    added: parseHandleList(getUserMeta(userId, keys.added, db)),
    removed: parseHandleList(getUserMeta(userId, keys.removed, db)),
  };
}

export function getKolSpec(userId: string, db = getDb()): KolSpec {
  migrateKolPacks(userId, db);
  const deskMode = parseDeskMode(getUserMeta(userId, "desk_mode", db));
  if (deskMode !== "both") {
    return getKolPackSpec(userId, deskMode === "venture" ? "venture" : "markets", db);
  }
  const markets = getKolPackSpec(userId, "markets", db);
  const venture = getKolPackSpec(userId, "venture", db);
  return {
    KOL_HANDLES: process.env.KOL_HANDLES,
    KOL_HANDLES_MODE: process.env.KOL_HANDLES_MODE,
    deskMode: "both",
    added: [...new Set([...(markets.added ?? []), ...(venture.added ?? [])])],
    removed: [...new Set([...(markets.removed ?? []), ...(venture.removed ?? [])])],
  };
}

export function getEffectiveKolHandleSet(userId: string, db = getDb()): Set<string> {
  const deskMode = parseDeskMode(getUserMeta(userId, "desk_mode", db));
  return unionHandleSets(
    packsForDeskMode(deskMode).map((pack) => loadKolHandleSet(getKolPackSpec(userId, pack, db))),
  );
}

export function getBlockedSpec(userId: string, db = getDb()): BlockedSpec {
  return {
    BLOCKED_HANDLES: process.env.BLOCKED_HANDLES,
    added: parseHandleList(getUserMeta(userId, "blocked_added", db)),
    removed: parseHandleList(getUserMeta(userId, "blocked_removed", db)),
  };
}

function authorSignalFlags(handle: string, userId: string, db: Database.Database) {
  return {
    kol: getEffectiveKolHandleSet(userId, db).has(normalizeHandle(handle)),
    blocked: isBlockedHandle(handle, getBlockedSpec(userId, db)),
  };
}

export type HandleSuggestion = {
  handle: string;
  source: "key" | "feed";
  followers: number | null;
};

export function listHandleSuggestions(userId: string, db = getDb()): HandleSuggestion[] {
  const kol = getEffectiveKolHandleSet(userId, db);
  const followers = listAuthorFollowerCounts(userId, db);
  const feed = db
    .prepare(
      `
    SELECT lower(p.author_handle) AS handle, MAX(p.author_followers) AS followers
    FROM posts p
    JOIN post_hits h ON h.tweet_id = p.tweet_id
    JOIN rules r ON r.user_id = ? AND r.query_hash = h.query_hash
    GROUP BY lower(p.author_handle)
    ORDER BY MAX(h.matched_at) DESC
    LIMIT 120
  `,
    )
    .all(userId) as Array<{ handle: string; followers: number | null }>;
  const seen = new Set<string>();
  const out: HandleSuggestion[] = [];
  const push = (handle: string, source: "key" | "feed", fol: number | null) => {
    const key = handle.replace(/^@/, "").trim().toLowerCase();
    if (!key || seen.has(key)) return;
    seen.add(key);
    out.push({
      handle: key,
      source,
      followers: fol != null && Number.isFinite(fol) && fol > 0 ? Number(fol) : null,
    });
  };
  for (const handle of kol) push(handle, "key", followers.get(handle) ?? null);
  for (const row of feed) push(row.handle, "feed", row.followers);
  return out;
}

export function listAuthorFollowerCounts(userId: string, db = getDb()): Map<string, number> {
  const rows = db.prepare(`
    SELECT lower(p.author_handle) AS handle, MAX(p.author_followers) AS followers
    FROM posts p
    JOIN post_hits h ON h.tweet_id = p.tweet_id
    JOIN rules r ON r.user_id = ? AND r.query_hash = h.query_hash
    WHERE p.author_followers IS NOT NULL
    GROUP BY lower(p.author_handle)
  `).all(userId) as Array<{ handle: string; followers: number }>;
  const map = new Map<string, number>();
  for (const row of rows) {
    if (!row.handle) continue;
    map.set(row.handle, Number(row.followers));
  }
  return map;
}

export function getDeskFilterSettings(userId: string, db = getDb()): DeskFilterSettings {
  return {
    deskMode: parseDeskMode(getUserMeta(userId, "desk_mode", db)),
    kolOnly: parseBoolMeta(getUserMeta(userId, "desk_kol_only", db), false),
    signalLevel: parseSignalLevel(getUserMeta(userId, "desk_signal_level", db)),
    allowFresh: parseBoolMeta(getUserMeta(userId, "desk_allow_fresh", db), true),
    requireEngagement: parseBoolMeta(getUserMeta(userId, "desk_require_engagement", db), false),
    minLikes: resolvedMinLikes(getUserMeta(userId, "desk_min_likes", db)),
    hideCrypto: parseBoolMeta(getUserMeta(userId, "desk_hide_crypto", db), true),
    hideMessagingApps: parseBoolMeta(getUserMeta(userId, "desk_hide_messaging", db), true),
  };
}

export function getWhatsAppCadenceSettings(userId: string, db = getDb()): WhatsAppCadenceSettings {
  return {
    alertMode: "digest",
    digestMinutes: parseDigestMinutes(getUserMeta(userId, "whatsapp_digest_minutes", db)),
  };
}

export function getDeskCadenceMinutes(userId: string, db = getDb()): number {
  return getWhatsAppCadenceSettings(userId, db).digestMinutes;
}

export function setDeskCadenceMinutes(userId: string, minutes: number, db = getDb()): number {
  const next = parseDigestMinutes(minutes);
  setUserMeta(userId, "whatsapp_digest_minutes", String(next), db);
  setUserMeta(userId, "whatsapp_alert_mode", "digest", db);
  return next;
}

export function evaluateTweetSignal(
  tweet: NormalizedTweet,
  userId: string,
  db = getDb(),
  opts?: { watchedAuthor?: boolean },
) {
  const filters = getDeskFilterSettings(userId, db);
  return passesSignalFilter(tweet, Date.now(), {
    prior: getAuthorPrior(tweet.authorHandle, userId, db),
    userLabel: getTweetLabel(tweet.id, userId, db),
    ...authorSignalFlags(tweet.authorHandle, userId, db),
    ...filters,
    watchedAuthor: opts?.watchedAuthor === true,
  });
}

function attachPriors(matches: Match[], userId: string, db: Database.Database): Match[] {
  const priors = listAuthorPriors(userId, db);
  return matches.map((match) => ({
    ...match,
    authorPrior: priors.get(match.authorHandle.toLowerCase()) ?? { high: 0, low: 0 },
  }));
}

function resolveTweetId(id: string, userId: string, db: Database.Database): string | null {
  const post = db.prepare("SELECT tweet_id FROM posts WHERE tweet_id = ?").get(id) as { tweet_id: string } | undefined;
  if (post) return post.tweet_id;
  const legacy = db
    .prepare("SELECT tweet_id FROM matches WHERE id = ? AND user_id = ?")
    .get(id, userId) as { tweet_id: string } | undefined;
  return legacy?.tweet_id ?? null;
}

function getMatchById(id: string, userId: string, db: Database.Database): Match | null {
  const tweetId = resolveTweetId(id, userId, db);
  if (!tweetId) return null;
  const page = listMatchesPage(userId, { q: tweetId, quality: false, limit: 20 }, db);
  return page.matches.find((match) => match.tweetId === tweetId) ?? null;
}

function recomputeAuthorQuality(handle: string, userId: string, db: Database.Database) {
  const prior = getAuthorPrior(handle, userId, db);
  const rows = db.prepare(
    `SELECT m.id, m.tweet_id, m.raw_json, m.tweet_created_at, m.author_handle, m.text, m.author_followers, m.like_count, m.user_label, r.accounts_json
     FROM matches m
     LEFT JOIN rules r ON r.id = m.rule_id
     WHERE m.user_id = ? AND lower(m.author_handle) = lower(?)`,
  ).all(userId, handle) as Array<{
    id: string;
    tweet_id: string;
    raw_json: string;
    tweet_created_at: string;
    author_handle: string;
    text: string;
    author_followers: number | null;
    like_count: number | null;
    user_label: string | null;
    accounts_json: string | null;
  }>;
  const update = db.prepare("UPDATE matches SET signal_score = ?, signal_pass = ? WHERE id = ?");
  for (const row of rows) {
    const metrics = metricsFromRaw(row.raw_json);
    const followers = row.author_followers ?? metrics.followersCount ?? 0;
    const likes = row.like_count ?? metrics.likeCount ?? 0;
    const filters = getDeskFilterSettings(userId, db);
    const verdict = passesSignalFilter(
      {
        followersCount: followers,
        likeCount: likes,
        retweetCount: metrics.retweetCount,
        replyCount: metrics.replyCount,
        quoteCount: metrics.quoteCount,
        impressionCount: metrics.impressionCount,
        verified: metrics.verified,
        createdAt: row.tweet_created_at,
        text: row.text,
        authorHandle: row.author_handle,
        isReply: metrics.isReply || /^@\w/.test((row.text ?? "").trim()),
      },
      Date.now(),
      {
        userLabel: parseUserLabel(row.user_label),
        prior,
        ...authorSignalFlags(row.author_handle, userId, db),
        ...filters,
        watchedAuthor: isWatchedAuthor(parseAccounts(row.accounts_json ?? "[]"), row.author_handle),
      },
    );
    update.run(verdict.score, verdict.pass ? 1 : 0, row.id);
  }
}

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
  db.prepare("INSERT OR IGNORE INTO meta (key, value) VALUES ('instance_initialized', ?)").run(nowIso());
}

function insertSeedRules(userId: string, db: Database.Database) {
  const insert = db.prepare(`
    INSERT INTO rules (
      id, user_id, name, enabled, query, query_input, accounts_json, poll_interval_ms,
      slack_webhook_url, generic_webhook_url, created_at, updated_at, mode
    ) VALUES (
      @id, @user_id, @name, @enabled, @query, @query_input, @accounts_json, @poll_interval_ms,
      @slack_webhook_url, @generic_webhook_url, @created_at, @updated_at, @mode
    )
  `);
  const ts = nowIso();
  for (const rule of DEFAULT_MONITORS) {
    const accounts = normalizeAccounts(rule.accounts);
    insert.run({
      id: crypto.randomUUID(),
      user_id: userId,
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
      mode: rule.mode,
    });
  }
}

function monitorRank(rule: Rule): number {
  if (rule.kind === "key_leaders") return -20 + (rule.watchlistChunk ?? 0);
  if (rule.kind === "watchlist") return rule.watchlistChunk ?? 0;
  const names: readonly string[] = rule.mode === "vc" ? VC_DEFAULT_NAMES : MARKETS_DEFAULT_NAMES;
  const idx = names.indexOf(rule.name);
  if (idx >= 0) return 100 + idx;
  return 1000;
}

function sortMonitors(rules: Rule[]): Rule[] {
  return [...rules].sort((a, b) => {
    if (a.mode !== b.mode) return a.mode === "markets" ? -1 : 1;
    const rank = monitorRank(a) - monitorRank(b);
    if (rank !== 0) return rank;
    const created = a.createdAt.localeCompare(b.createdAt);
    if (created !== 0) return created;
    return a.name.localeCompare(b.name);
  });
}

function overlayWatchlistEnabled(userId: string, rules: Rule[], db: Database.Database): Rule[] {
  const watchlistOn = watchlistEnabled(userId, db);
  const leadersOn = keyLeadersEnabled(userId, db);
  const cadence = getDeskCadenceMinutes(userId, db) * 60_000;
  return rules.map((rule) => ({
    ...rule,
    enabled:
      rule.kind === "watchlist" ? watchlistOn : rule.kind === "key_leaders" ? leadersOn : rule.enabled,
    pollIntervalMs: cadence,
  }));
}

function applyMonitorRenames(userId: string, db: Database.Database) {
  const existing = new Set(
    (db.prepare("SELECT name FROM rules WHERE user_id = ?").all(userId) as Array<{ name: string }>).map(
      (row) => row.name,
    ),
  );
  const ts = nowIso();
  for (const [from, to] of Object.entries(MONITOR_RENAMES)) {
    if (!existing.has(from) || existing.has(to)) continue;
    db.prepare("UPDATE rules SET name = ?, updated_at = ? WHERE user_id = ? AND name = ? AND kind NOT IN ('watchlist', 'key_leaders')").run(
      to,
      ts,
      userId,
      from,
    );
    existing.delete(from);
    existing.add(to);
  }
}

function stampKnownMonitorModes(userId: string, db: Database.Database) {
  const ts = nowIso();
  for (const seed of DEFAULT_MONITORS) {
    db.prepare("UPDATE rules SET mode = ?, updated_at = ? WHERE user_id = ? AND name = ? AND kind NOT IN ('watchlist', 'key_leaders')").run(
      seed.mode,
      ts,
      userId,
      seed.name,
    );
  }
  db.prepare("UPDATE rules SET mode = 'markets', updated_at = ? WHERE user_id = ? AND kind = 'watchlist'").run(ts, userId);
  db.prepare("UPDATE rules SET mode = 'markets', updated_at = ? WHERE user_id = ? AND kind = 'key_leaders'").run(ts, userId);
}

function insertMissingDefaultMonitors(userId: string, db: Database.Database) {
  const existing = new Set(
    (db.prepare("SELECT name FROM rules WHERE user_id = ?").all(userId) as Array<{ name: string }>).map(
      (row) => row.name,
    ),
  );
  const insert = db.prepare(`
    INSERT INTO rules (
      id, user_id, name, enabled, query, query_input, accounts_json, poll_interval_ms,
      slack_webhook_url, generic_webhook_url, created_at, updated_at, mode
    ) VALUES (?, ?, ?, 1, ?, ?, ?, ?, NULL, NULL, ?, ?, ?)
  `);
  const ts = nowIso();
  for (const rule of DEFAULT_MONITORS) {
    if (existing.has(rule.name)) continue;
    const accounts = normalizeAccounts(rule.accounts);
    insert.run(
      crypto.randomUUID(),
      userId,
      rule.name,
      compileQuery({ query: rule.queryInput, accounts }),
      rule.queryInput,
      JSON.stringify(accounts),
      clampPollIntervalMs(rule.pollIntervalMs),
      ts,
      ts,
      rule.mode,
    );
  }
}

function reenablePackDisabledByDeskSwitch(userId: string, db: Database.Database) {
  const deskMode = parseDeskMode(getUserMeta(userId, "desk_mode", db));
  const names =
    deskMode === "both"
      ? [...MARKETS_DEFAULT_NAMES, ...VC_DEFAULT_NAMES]
      : deskMode === "venture"
        ? MARKETS_DEFAULT_NAMES
        : VC_DEFAULT_NAMES;
  const ts = nowIso();
  for (const name of names) {
    if (name === "Watchlist") continue;
    db.prepare(
      "UPDATE rules SET enabled = 1, updated_at = ? WHERE user_id = ? AND name = ? AND kind NOT IN ('watchlist', 'key_leaders')",
    ).run(ts, userId, name);
  }
}

function deleteRetiredDefaultMonitors(userId: string, db: Database.Database) {
  const placeholders = RETIRED_DEFAULT_MONITOR_NAMES.map(() => "?").join(", ");
  db.prepare(
    `DELETE FROM rules WHERE user_id = ? AND kind NOT IN ('watchlist', 'key_leaders') AND name IN (${placeholders})`,
  ).run(userId, ...RETIRED_DEFAULT_MONITOR_NAMES);
}

function ensureWatchlistPlaceholder(userId: string, db: Database.Database) {
  const existing = listWatchlistRules(userId, db);
  if (existing.length > 0) {
    stampKnownMonitorModes(userId, db);
    return;
  }
  const ts = nowIso();
  db.prepare(`
    INSERT INTO rules (
      id, user_id, name, enabled, query, query_input, accounts_json, poll_interval_ms,
      slack_webhook_url, generic_webhook_url, created_at, updated_at, kind, watchlist_chunk, mode
    ) VALUES (?, ?, 'Watchlist', 0, '', '', '[]', ?, NULL, NULL, ?, ?, 'watchlist', 0, 'markets')
  `).run(crypto.randomUUID(), userId, watchlistPollIntervalMs(userId, db), ts, ts);
}

function upgradeUneditedSeedQueries(userId: string, db: Database.Database) {
  for (const [name, upgrade] of Object.entries(UNEDITED_SEED_QUERY_UPGRADES)) {
    const row = db.prepare("SELECT id, query_input FROM rules WHERE user_id = ? AND name = ? AND kind NOT IN ('watchlist', 'key_leaders')").get(
      userId,
      name,
    ) as { id: string; query_input: string } | undefined;
    if (!row || row.query_input.trim() !== upgrade.from) continue;
    updateRule(row.id, { queryInput: upgrade.to }, userId, db);
  }
}

export function ensureMonitorPack(userId: string, db = getDb()) {
  if (!userId) return;
  const migrated = Boolean(getUserMeta(userId, "monitor_pack_v2", db));
  if (!migrated) {
    applyMonitorRenames(userId, db);
    stampKnownMonitorModes(userId, db);
    deleteRetiredDefaultMonitors(userId, db);
    insertMissingDefaultMonitors(userId, db);
    reenablePackDisabledByDeskSwitch(userId, db);
    setUserMeta(userId, "monitor_pack_v2", nowIso(), db);
  }
  upgradeUneditedSeedQueries(userId, db);
  ensureWatchlistPlaceholder(userId, db);
  syncKeyLeaderRules(userId, db);
}

export function getMonitorMode(userId: string, db = getDb()): MonitorMode {
  const stored = getUserMeta(userId, "monitor_mode", db);
  if (stored) return parseMonitorMode(stored);
  return monitorModeFromDeskMode(getUserMeta(userId, "desk_mode", db));
}

export function setMonitorMode(userId: string, mode: MonitorMode, db = getDb()): MonitorMode {
  const next = parseMonitorMode(mode);
  setUserMeta(userId, "monitor_mode", next, db);
  return next;
}

export function adoptOrphanDesk(userId: string, db = getDb()) {
  if (!userId) return;
  db.prepare("UPDATE rules SET user_id = ? WHERE user_id = ''").run(userId);
  db.prepare("UPDATE matches SET user_id = ? WHERE user_id = ''").run(userId);
  db.prepare("UPDATE tickers SET user_id = ? WHERE user_id = ''").run(userId);
  const insert = db.prepare(
    "INSERT OR IGNORE INTO user_meta (user_id, key, value) VALUES (?, ?, ?)",
  );
  for (const key of DESK_META_KEYS) {
    const value = getMeta(key, db);
    if (value != null && value !== "") insert.run(userId, key, value);
  }
  const envTo = process.env.WHATSAPP_TO?.trim();
  if (envTo) insert.run(userId, "whatsapp_to", envTo);
}

export function ensureUserDesk(userId: string, db = getDb()) {
  if (!userId) return;
  const first = db.prepare("SELECT id FROM users ORDER BY created_at ASC LIMIT 1").get() as
    | { id: string }
    | undefined;
  if (first?.id === userId) {
    adoptOrphanDesk(userId, db);
  }
  if (getUserMeta(userId, "desk_seeded", db)) {
    ensureMonitorPack(userId, db);
    migrateKolPacks(userId, db);
    stampRuleQueryHashes(db);
    return;
  }
  const count = db.prepare("SELECT COUNT(*) AS n FROM rules WHERE user_id = ?").get(userId) as { n: number };
  if (Number(count.n) === 0) {
    insertSeedRules(userId, db);
  }
  setUserMeta(userId, "desk_seeded", nowIso(), db);
  ensureMonitorPack(userId, db);
  stampRuleQueryHashes(db);
}

export function listDeskUserIds(db = getDb()): string[] {
  const rows = db.prepare("SELECT id FROM users WHERE COALESCE(disabled, 0) = 0").all() as Array<{ id: string }>;
  return rows.map((row) => row.id);
}

export function openDatabase(dbPath = databasePath()): Database.Database {
  const resolved = path.resolve(dbPath);
  fs.mkdirSync(path.dirname(resolved), { recursive: true });
  const db = new Database(resolved);
  migrate(db);
  seedIfNeeded(db);
  return db;
}

function hasTapeTables(db: Database.Database): boolean {
  const row = db
    .prepare("SELECT 1 AS ok FROM sqlite_master WHERE type = 'table' AND name = 'posts'")
    .get() as { ok: number } | undefined;
  return Boolean(row);
}

function hasLoginEventsTable(db: Database.Database): boolean {
  const row = db
    .prepare("SELECT 1 AS ok FROM sqlite_master WHERE type = 'table' AND name = 'login_events'")
    .get() as { ok: number } | undefined;
  return Boolean(row);
}

export function getDb(): Database.Database {
  if (!globalForDb.signalDb) {
    globalForDb.signalDb = openDatabase();
  } else if (!hasTapeTables(globalForDb.signalDb) || !hasLoginEventsTable(globalForDb.signalDb)) {
    migrate(globalForDb.signalDb);
  }
  return globalForDb.signalDb;
}

export function listRules(userId: string, db = getDb()): Rule[] {
  ensureMonitorPack(userId, db);
  const rows = db.prepare("SELECT * FROM rules WHERE user_id = ?").all(userId) as RuleRow[];
  return sortMonitors(overlayWatchlistEnabled(userId, rows.map(mapRule), db));
}

export function listRulesForMode(userId: string, mode: MonitorMode, db = getDb()): Rule[] {
  const wanted = parseMonitorMode(mode);
  return listRules(userId, db).filter((rule) => rule.mode === wanted);
}

/** Enabled rules that the live Focus will actually search. */
export function listEnabledRules(db = getDb()): Rule[] {
  for (const userId of listDeskUserIds(db)) {
    ensureMonitorPack(userId, db);
  }
  const rows = db.prepare(`
    SELECT r.* FROM rules r
    WHERE r.enabled = 1
      AND TRIM(r.query) != ''
      AND (r.user_id = '' OR r.user_id NOT IN (SELECT id FROM users WHERE COALESCE(disabled, 0) = 1))
    ORDER BY r.created_at ASC
  `).all() as RuleRow[];
  return rows.map(mapRule).filter((rule) => {
    const focus = parseDeskMode(getUserMeta(rule.userId, "desk_mode", db));
    return ruleFitsFocus(rule, focus);
  });
}

export function listEnabledRulesForUser(userId: string, db = getDb()): Rule[] {
  if (!userId) return [];
  const focus = parseDeskMode(getUserMeta(userId, "desk_mode", db));
  return listRules(userId, db).filter((rule) => ruleFitsFocus(rule, focus));
}

export function getRule(id: string, userId?: string, db = getDb()): Rule | null {
  const row = (
    userId
      ? db.prepare("SELECT * FROM rules WHERE id = ? AND user_id = ?").get(id, userId)
      : db.prepare("SELECT * FROM rules WHERE id = ?").get(id)
  ) as RuleRow | undefined;
  return row ? mapRule(row) : null;
}

function countLiveCustomRules(userId: string, db: Database.Database, exceptId?: string): number {
  const row = db
    .prepare(
      `
    SELECT COUNT(*) AS n FROM rules
    WHERE user_id = ? AND enabled = 1 AND TRIM(query) != ''
      AND COALESCE(kind, 'custom') = 'custom'
      AND (? IS NULL OR id != ?)
  `,
    )
    .get(userId, exceptId ?? null, exceptId ?? null) as { n: number };
  return Number(row.n);
}

function assertLiveCustomRuleCap(userId: string, enabling: boolean, db: Database.Database, exceptId?: string) {
  if (!enabling) return;
  if (countLiveCustomRules(userId, db, exceptId) < MAX_LIVE_CUSTOM_RULES) return;
  throw new Error(
    `Each SignlHQ can run ${MAX_LIVE_CUSTOM_RULES} custom live monitors. Pause one, or use the shared Markets/Venture tape.`,
  );
}

export function createRule(userId: string, input: RuleInput, db = getDb()): Rule {
  const accounts = normalizeAccounts(input.accounts);
  const query = compileQuery({ query: input.queryInput, accounts });
  if (!query) {
    throw new Error("Rule needs a search query or at least one account.");
  }
  assertLiveCustomRuleCap(userId, input.enabled, db);
  const ts = nowIso();
  const id = crypto.randomUUID();
  const mode = parseMonitorMode(input.mode ?? getMonitorMode(userId, db));
  db.prepare(`
    INSERT INTO rules (
      id, user_id, name, enabled, query, query_input, accounts_json, poll_interval_ms,
      slack_webhook_url, generic_webhook_url, created_at, updated_at, mode, query_hash
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    userId,
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
    mode,
    queryHash(query),
  );
  return getRule(id, userId, db)!;
}

export function updateRule(id: string, input: Partial<RuleInput>, userId: string, db = getDb()): Rule {
  const existing = getRule(id, userId, db);
  if (!existing) throw new Error("Rule not found");
  if (existing.kind === "watchlist") {
    throw new Error("Watchlist cashtag rules are edited on the Watchlist page.");
  }
  if (existing.kind === "key_leaders") {
    const keys = Object.keys(input).filter((key) => input[key as keyof RuleInput] !== undefined);
    if (keys.length === 1 && keys[0] === "enabled" && typeof input.enabled === "boolean") {
      setUserMeta(userId, "key_leaders_enabled", input.enabled ? "1" : "0", db);
      syncKeyLeaderRules(userId, db);
      return getRule(id, userId, db)!;
    }
    throw new Error("Key Leaders monitors are edited on Accounts.");
  }
  const merged: RuleInput = {
    name: input.name ?? existing.name,
    enabled: input.enabled ?? existing.enabled,
    queryInput: input.queryInput ?? existing.queryInput,
    accounts: input.accounts ?? existing.accounts,
    pollIntervalMs: input.pollIntervalMs ?? existing.pollIntervalMs,
    slackWebhookUrl: input.slackWebhookUrl === undefined ? existing.slackWebhookUrl : input.slackWebhookUrl,
    genericWebhookUrl: input.genericWebhookUrl === undefined ? existing.genericWebhookUrl : input.genericWebhookUrl,
    mode: input.mode ?? existing.mode,
  };
  const accounts = normalizeAccounts(merged.accounts);
  const query = compileQuery({ query: merged.queryInput, accounts });
  if (!query) throw new Error("Rule needs a search query or at least one account.");
  if (existing.kind === "custom" || !existing.kind) {
    assertLiveCustomRuleCap(userId, merged.enabled, db, id);
  }
  const ts = nowIso();
  db.prepare(`
    UPDATE rules SET
      name = ?, enabled = ?, query = ?, query_input = ?, accounts_json = ?,
      poll_interval_ms = ?, slack_webhook_url = ?, generic_webhook_url = ?, mode = ?,
      query_hash = ?, updated_at = ?
    WHERE id = ? AND user_id = ?
  `).run(
    merged.name.trim(),
    merged.enabled ? 1 : 0,
    query,
    merged.queryInput.trim(),
    JSON.stringify(accounts),
    clampPollIntervalMs(merged.pollIntervalMs),
    merged.slackWebhookUrl,
    merged.genericWebhookUrl,
    parseMonitorMode(merged.mode),
    queryHash(query),
    ts,
    id,
    userId,
  );
  return getRule(id, userId, db)!;
}

export function deleteRule(id: string, userId: string, db = getDb()): boolean {
  const existing = getRule(id, userId, db);
  if (!existing) return false;
  if (existing.kind === "watchlist") {
    throw new Error("Watchlist cashtag rules are edited on the Watchlist page.");
  }
  if (existing.kind === "key_leaders") {
    throw new Error("Key Leaders monitors are removed from Accounts.");
  }
  const result = db.prepare("DELETE FROM rules WHERE id = ? AND user_id = ?").run(id, userId);
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
  rule: Pick<Rule, "id" | "name" | "userId" | "kind" | "mode" | "query"> & { accounts?: string[] },
  tweet: NormalizedTweet,
  db = getDb(),
): { inserted: boolean; matchId: string | null } {
  const hash = queryHash(rule.query ?? "");
  if (rule.id && hash) {
    db.prepare("UPDATE rules SET query_hash = COALESCE(NULLIF(query_hash, ''), ?) WHERE id = ?").run(hash, rule.id);
  }
  const seen = nowIso();
  db.prepare(`
    INSERT INTO posts (
      tweet_id, author_handle, author_name, text, tweet_created_at, permalink, raw_json,
      author_followers, like_count, first_seen_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(tweet_id) DO UPDATE SET
      author_handle = excluded.author_handle,
      author_name = excluded.author_name,
      text = excluded.text,
      permalink = excluded.permalink,
      raw_json = excluded.raw_json,
      author_followers = excluded.author_followers,
      like_count = excluded.like_count
  `).run(
    tweet.id,
    tweet.authorHandle,
    tweet.authorName,
    tweet.text,
    tweet.createdAt,
    tweet.permalink,
    JSON.stringify(tweet.raw ?? tweet),
    tweet.followersCount ?? null,
    tweet.likeCount ?? null,
    seen,
  );
  const hit = db.prepare(`
    INSERT OR IGNORE INTO post_hits (tweet_id, query_hash, rule_name, rule_kind, rule_mode, matched_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(tweet.id, hash, rule.name, rule.kind ?? "custom", rule.mode ?? "markets", seen);
  return { inserted: hit.changes > 0, matchId: hit.changes > 0 ? tweet.id : tweet.id };
}

export type MatchListOpts = {
  ruleId?: string;
  unread?: boolean;
  limit?: number;
  quality?: boolean;
  q?: string;
  cursor?: string | null;
};

export type MatchPage = {
  matches: Match[];
  nextCursor: string | null;
  hasMore: boolean;
};

type MatchCursor = {
  matchedAt: string;
  tweetCreatedAt: string;
  id: string;
};

export function encodeMatchCursor(cursor: MatchCursor): string {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

export function decodeMatchCursor(raw: string): MatchCursor | null {
  try {
    const parsed = JSON.parse(Buffer.from(raw, "base64url").toString("utf8")) as Partial<MatchCursor>;
    if (
      typeof parsed.matchedAt === "string" &&
      typeof parsed.tweetCreatedAt === "string" &&
      typeof parsed.id === "string" &&
      parsed.matchedAt &&
      parsed.tweetCreatedAt &&
      parsed.id
    ) {
      return { matchedAt: parsed.matchedAt, tweetCreatedAt: parsed.tweetCreatedAt, id: parsed.id };
    }
  } catch {
    /* invalid */
  }
  return null;
}

type TapeRow = {
  tweet_id: string;
  author_handle: string;
  author_name: string;
  text: string;
  tweet_created_at: string;
  permalink: string;
  raw_json: string;
  author_followers: number | null;
  like_count: number | null;
  matched_at: string;
  rule_id: string;
  rule_name: string;
  read: number;
  user_label: string | null;
};

function tapeListWhere(
  userId: string,
  opts: MatchListOpts,
  db: Database.Database,
): { where: string; params: unknown[] } {
  const clauses: string[] = ["r.user_id = ?", "r.enabled = 1", "TRIM(r.query) != ''"];
  const params: unknown[] = [userId];
  if (opts.ruleId) {
    clauses.push("r.id = ?");
    params.push(opts.ruleId);
  }
  if (opts.unread) {
    clauses.push("COALESCE(s.read, 0) = 0");
  }
  if (opts.quality !== false && !isDemoMode()) {
    clauses.push("p.tweet_id NOT LIKE 'demo-%'");
  }
  const blocked = listBlockedHandles(getBlockedSpec(userId, db));
  if (blocked.length > 0) {
    clauses.push(`lower(p.author_handle) NOT IN (${blocked.map(() => "?").join(", ")})`);
    params.push(...blocked);
  }
  for (const token of tokenizeSearch(opts.q ?? "")) {
    clauses.push(
      `(lower(p.text) LIKE ? ESCAPE char(92) OR lower(p.author_handle) LIKE ? ESCAPE char(92) OR lower(p.author_name) LIKE ? ESCAPE char(92) OR lower(r.name) LIKE ? ESCAPE char(92) OR lower(p.tweet_id) LIKE ? ESCAPE char(92))`,
    );
    const pattern = likePattern(token);
    params.push(pattern, pattern, pattern, pattern, pattern);
  }
  const extra = sqlFocusMode(parseDeskMode(getUserMeta(userId, "desk_mode", db)));
  return { where: `WHERE ${clauses.join(" AND ")}${extra.sql}`, params: [...params, ...extra.params] };
}

function mapTapeMatch(row: TapeRow, userId: string, db: Database.Database): Match {
  return {
    id: row.tweet_id,
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
    signalScore: null,
    userLabel: parseUserLabel(row.user_label),
    authorPrior: { high: 0, low: 0 },
    kol: getEffectiveKolHandleSet(userId, db).has(normalizeHandle(row.author_handle)),
  };
}

function tapeRowPassesQuality(row: TapeRow, userId: string, db: Database.Database): boolean {
  const metrics = metricsFromRaw(row.raw_json);
  const tweet: NormalizedTweet = {
    id: row.tweet_id,
    authorHandle: row.author_handle,
    authorName: row.author_name,
    text: row.text,
    createdAt: row.tweet_created_at,
    lang: "en",
    isRetweet: false,
    isReply: metrics.isReply,
    permalink: row.permalink,
    raw: (() => {
      try {
        return JSON.parse(row.raw_json);
      } catch {
        return row.raw_json;
      }
    })(),
    followersCount: row.author_followers ?? metrics.followersCount ?? 0,
    likeCount: row.like_count ?? metrics.likeCount ?? 0,
    retweetCount: metrics.retweetCount,
    replyCount: metrics.replyCount,
    quoteCount: metrics.quoteCount,
    impressionCount: metrics.impressionCount,
    verified: metrics.verified,
  };
  const rule = getRule(row.rule_id, userId, db);
  return evaluateTweetSignal(tweet, userId, db, {
    watchedAuthor: isWatchedAuthor(rule?.accounts, tweet.authorHandle),
  }).pass;
}

export function listMatchesPage(
  userId: string,
  opts: MatchListOpts = {},
  db = getDb(),
): MatchPage {
  const limit = Math.min(Math.max(opts.limit ?? 40, 1), 500);
  const { where, params } = tapeListWhere(userId, opts, db);
  const collected: TapeRow[] = [];
  let cursor = opts.cursor ? decodeMatchCursor(opts.cursor) : null;
  let exhausted = false;
  const batch = Math.max(limit * 4, 80);
  while (collected.length < limit + 1 && !exhausted) {
    const cursorSql = cursor
      ? " AND (MAX(h.matched_at), p.tweet_created_at, p.tweet_id) < (?, ?, ?)"
      : "";
    const cursorParams = cursor ? [cursor.matchedAt, cursor.tweetCreatedAt, cursor.id] : [];
    const rows = db
      .prepare(
        `
      SELECT p.tweet_id, p.author_handle, p.author_name, p.text, p.tweet_created_at, p.permalink,
        p.raw_json, p.author_followers, p.like_count, MAX(h.matched_at) AS matched_at,
        MIN(r.id) AS rule_id, MIN(r.name) AS rule_name,
        COALESCE(MAX(s.read), 0) AS read, MAX(s.user_label) AS user_label
      FROM posts p
      JOIN post_hits h ON h.tweet_id = p.tweet_id
      JOIN rules r ON r.query_hash = h.query_hash
      LEFT JOIN user_post_state s ON s.user_id = r.user_id AND s.tweet_id = p.tweet_id
      ${where}
      GROUP BY p.tweet_id
      HAVING 1 = 1${cursorSql}
      ORDER BY matched_at DESC, p.tweet_created_at DESC, p.tweet_id DESC
      LIMIT ?
    `,
      )
      .all(...params, ...cursorParams, batch) as TapeRow[];
    if (rows.length < batch) exhausted = true;
    for (const row of rows) {
      if (opts.quality !== false && !tapeRowPassesQuality(row, userId, db) && !parseUserLabel(row.user_label)) {
        continue;
      }
      collected.push(row);
      if (collected.length >= limit + 1) break;
    }
    const last = rows[rows.length - 1];
    if (!last) break;
    cursor = { matchedAt: last.matched_at, tweetCreatedAt: last.tweet_created_at, id: last.tweet_id };
  }
  const hasMore = collected.length > limit;
  const page = hasMore ? collected.slice(0, limit) : collected;
  const matches = attachPriors(
    page.map((row) => mapTapeMatch(row, userId, db)),
    userId,
    db,
  );
  const last = page[page.length - 1];
  const nextCursor =
    hasMore && last
      ? encodeMatchCursor({
          matchedAt: last.matched_at,
          tweetCreatedAt: last.tweet_created_at,
          id: last.tweet_id,
        })
      : null;
  return { matches, nextCursor, hasMore };
}

export function listMatches(
  userId: string,
  opts: MatchListOpts = {},
  db = getDb(),
): Match[] {
  return listMatchesPage(userId, { ...opts, limit: opts.limit ?? 200 }, db).matches;
}

export function listMatchesSince(userId: string, iso: string, limit = 400, db = getDb()): Match[] {
  const blocked = listBlockedHandles(getBlockedSpec(userId, db));
  const blockedSql =
    blocked.length > 0 ? `AND lower(p.author_handle) NOT IN (${blocked.map(() => "?").join(", ")})` : "";
  const extra = sqlFocusMode(parseDeskMode(getUserMeta(userId, "desk_mode", db)));
  const fetched = db.prepare(`
    SELECT p.tweet_id, p.author_handle, p.author_name, p.text, p.tweet_created_at, p.permalink,
      p.raw_json, p.author_followers, p.like_count, MAX(h.matched_at) AS matched_at,
      MIN(r.id) AS rule_id, MIN(r.name) AS rule_name,
      COALESCE(MAX(s.read), 0) AS read, MAX(s.user_label) AS user_label
    FROM posts p
    JOIN post_hits h ON h.tweet_id = p.tweet_id
    JOIN rules r ON r.user_id = ? AND r.query_hash = h.query_hash AND r.enabled = 1
    LEFT JOIN user_post_state s ON s.user_id = r.user_id AND s.tweet_id = p.tweet_id
    WHERE h.matched_at > ?
      ${blockedSql}${extra.sql}
    GROUP BY p.tweet_id
    ORDER BY matched_at ASC
    LIMIT ?
  `).all(
    userId,
    iso,
    ...blocked,
    ...extra.params,
    Math.min(Math.max(limit, 1), 400),
  ) as TapeRow[];
  const matches = fetched.filter((row) => tapeRowPassesQuality(row, userId, db) || parseUserLabel(row.user_label));
  return attachPriors(
    matches.map((row) => mapTapeMatch(row, userId, db)),
    userId,
    db,
  );
}

export function setMatchRead(id: string, read: boolean, userId: string, db = getDb()): Match | null {
  const tweetId = resolveTweetId(id, userId, db);
  if (!tweetId) return null;
  db.prepare(`
    INSERT INTO user_post_state (user_id, tweet_id, read, user_label)
    VALUES (?, ?, ?, (SELECT user_label FROM user_post_state WHERE user_id = ? AND tweet_id = ?))
    ON CONFLICT(user_id, tweet_id) DO UPDATE SET read = excluded.read
  `).run(userId, tweetId, read ? 1 : 0, userId, tweetId);
  return getMatchById(tweetId, userId, db);
}

export function setMatchLabel(id: string, label: UserLabel | null, userId: string, db = getDb()): Match | null {
  const tweetId = resolveTweetId(id, userId, db);
  if (!tweetId) return null;
  const post = db.prepare("SELECT author_handle FROM posts WHERE tweet_id = ?").get(tweetId) as
    | { author_handle: string }
    | undefined;
  if (!post) return null;
  db.prepare(`
    INSERT INTO user_post_state (user_id, tweet_id, read, user_label)
    VALUES (?, ?, COALESCE((SELECT read FROM user_post_state WHERE user_id = ? AND tweet_id = ?), 0), ?)
    ON CONFLICT(user_id, tweet_id) DO UPDATE SET user_label = excluded.user_label
  `).run(userId, tweetId, userId, tweetId, label);
  return getMatchById(tweetId, userId, db);
}

export function markAllMatchesRead(userId: string, ruleId?: string, db = getDb()): number {
  const ruleClause = ruleId ? "AND r.id = ?" : "";
  const params = ruleId ? [userId, userId, ruleId] : [userId, userId];
  const result = db.prepare(`
    INSERT INTO user_post_state (user_id, tweet_id, read, user_label)
    SELECT ?, p.tweet_id, 1, s.user_label
    FROM posts p
    JOIN post_hits h ON h.tweet_id = p.tweet_id
    JOIN rules r ON r.user_id = ? AND r.query_hash = h.query_hash AND r.enabled = 1
    LEFT JOIN user_post_state s ON s.user_id = r.user_id AND s.tweet_id = p.tweet_id
    WHERE COALESCE(s.read, 0) = 0 ${ruleClause}
    GROUP BY p.tweet_id
    ON CONFLICT(user_id, tweet_id) DO UPDATE SET read = 1
  `).run(...params);
  return result.changes;
}

export const ACCOUNT_WATCH_LOOKBACK_META = "account_watch_lookback_v3";

/** Clear since_id on account-watch rules once so the next poll uses the 6–12h lookback.
 *  Callers must reload rules after this — in-memory lastSinceId is otherwise stale. */
export function resetAccountWatchCursors(db = getDb()): number {
  if (getMeta(ACCOUNT_WATCH_LOOKBACK_META, db)) return 0;
  const result = db
    .prepare(
      `
      UPDATE rules
      SET last_since_id = NULL, updated_at = ?
      WHERE json_array_length(COALESCE(accounts_json, '[]')) > 0
        AND last_since_id IS NOT NULL
    `,
    )
    .run(nowIso());
  setMeta(ACCOUNT_WATCH_LOOKBACK_META, nowIso(), db);
  return result.changes;
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

export function setUserMeta(userId: string, key: string, value: string, db = getDb()) {
  db.prepare(
    `INSERT INTO user_meta (user_id, key, value) VALUES (?, ?, ?)
     ON CONFLICT(user_id, key) DO UPDATE SET value = excluded.value`,
  ).run(userId, key, value);
}

export function getUserMeta(userId: string, key: string, db = getDb()): string | null {
  if (!userId) {
    return getMeta(key, db);
  }
  const row = db.prepare("SELECT value FROM user_meta WHERE user_id = ? AND key = ?").get(userId, key) as
    | { value: string }
    | undefined;
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

export function getWhatsAppTo(userId: string, db = getDb()): string | null {
  const stored = getUserMeta(userId, "whatsapp_to", db)?.trim();
  if (stored) return stored;
  if (!userId) {
    const fromEnv = process.env.WHATSAPP_TO?.trim();
    return fromEnv || null;
  }
  return null;
}

export function isWhatsAppEnabled(userId: string, db = getDb()): boolean {
  const raw = getUserMeta(userId, "whatsapp_enabled", db);
  return raw !== "0" && raw !== "false";
}

export function isWhatsAppAgentEnabled(userId: string, db = getDb()): boolean {
  const raw = getUserMeta(userId, "whatsapp_agent_enabled", db);
  return raw !== "0" && raw !== "false";
}

export function setDeskFilterSettings(userId: string, input: DeskFilterPatch, db = getDb()): DeskFilterSettings {
  if (input.deskMode) {
    const next = parseDeskMode(input.deskMode);
    const prev = parseDeskMode(getUserMeta(userId, "desk_mode", db));
    setUserMeta(userId, "desk_mode", next, db);
    if (next !== prev) {
      requestManualPoll(db);
    }
  }
  if (typeof input.kolOnly === "boolean") setUserMeta(userId, "desk_kol_only", input.kolOnly ? "1" : "0", db);
  if (input.signalLevel) setUserMeta(userId, "desk_signal_level", parseSignalLevel(input.signalLevel), db);
  if (typeof input.allowFresh === "boolean") setUserMeta(userId, "desk_allow_fresh", input.allowFresh ? "1" : "0", db);
  if (typeof input.requireEngagement === "boolean") {
    setUserMeta(userId, "desk_require_engagement", input.requireEngagement ? "1" : "0", db);
  }
  if ("minLikes" in input) {
    const parsed = parseMinLikes(input.minLikes);
    setUserMeta(userId, "desk_min_likes", parsed == null ? "" : String(parsed), db);
  }
  if (typeof input.hideCrypto === "boolean") setUserMeta(userId, "desk_hide_crypto", input.hideCrypto ? "1" : "0", db);
  if (typeof input.hideMessagingApps === "boolean") {
    setUserMeta(userId, "desk_hide_messaging", input.hideMessagingApps ? "1" : "0", db);
  }
  backfillMatchQuality(db, userId);
  return getDeskFilterSettings(userId, db);
}

export function addKolHandle(userId: string, handle: string, db = getDb(), pack?: KolPackId): string[] {
  const normalized = handle.replace(/^@/, "").trim();
  if (!/^[A-Za-z0-9_]{1,15}$/.test(normalized)) {
    throw new Error("Handle must be 1–15 letters, numbers, or underscores");
  }
  migrateKolPacks(userId, db);
  const deskMode = parseDeskMode(getUserMeta(userId, "desk_mode", db));
  const packs = pack ? [pack] : packsForDeskMode(deskMode);
  const key = normalized.toLowerCase();
  for (const nextPack of packs) {
    const spec = getKolPackSpec(userId, nextPack, db);
    const added = isSeedOrEnvHandle(key, spec)
      ? (spec.added ?? []).filter((h) => h !== key)
      : [...new Set([...(spec.added ?? []), key])];
    const removed = (spec.removed ?? []).filter((h) => h !== key);
    const keys = KOL_PACK_META[nextPack];
    setUserMeta(userId, keys.added, serializeHandleList(added), db);
    setUserMeta(userId, keys.removed, serializeHandleList(removed), db);
  }
  syncKeyLeaderRules(userId, db);
  return listKolHandles(pack ? getKolPackSpec(userId, pack, db) : getKolSpec(userId, db));
}

export function addKolHandles(
  userId: string,
  input: string,
  pack: KolPackId,
  db = getDb(),
): { handles: string[]; skipped: string[] } {
  const tokens = input.split(/[\s,;]+/).map((item) => item.trim()).filter(Boolean);
  const skipped: string[] = [];
  for (const token of tokens) {
    try {
      addKolHandle(userId, token, db, pack);
    } catch {
      skipped.push(token.replace(/^@/, ""));
    }
  }
  return { handles: listKolHandles(getKolPackSpec(userId, pack, db)), skipped };
}

export function removeKolHandle(userId: string, handle: string, db = getDb(), pack?: KolPackId): string[] {
  const normalized = handle.replace(/^@/, "").trim().toLowerCase();
  migrateKolPacks(userId, db);
  const deskMode = parseDeskMode(getUserMeta(userId, "desk_mode", db));
  const packs = pack ? [pack] : packsForDeskMode(deskMode);
  for (const nextPack of packs) {
    const spec = getKolPackSpec(userId, nextPack, db);
    const added = (spec.added ?? []).filter((h) => h !== normalized);
    const removed = [...new Set([...(spec.removed ?? []), normalized])];
    const keys = KOL_PACK_META[nextPack];
    setUserMeta(userId, keys.added, serializeHandleList(added), db);
    setUserMeta(userId, keys.removed, serializeHandleList(removed), db);
  }
  syncKeyLeaderRules(userId, db);
  return listKolHandles(pack ? getKolPackSpec(userId, pack, db) : getKolSpec(userId, db));
}

export function resetKolHandles(userId: string, db = getDb(), pack?: KolPackId): string[] {
  migrateKolPacks(userId, db);
  const deskMode = parseDeskMode(getUserMeta(userId, "desk_mode", db));
  const packs = pack ? [pack] : packsForDeskMode(deskMode);
  for (const nextPack of packs) {
    const keys = KOL_PACK_META[nextPack];
    setUserMeta(userId, keys.added, "", db);
    setUserMeta(userId, keys.removed, "", db);
  }
  if (!pack) {
    setUserMeta(userId, "kol_added", "", db);
    setUserMeta(userId, "kol_removed", "", db);
  }
  syncKeyLeaderRules(userId, db);
  return listKolHandles(pack ? getKolPackSpec(userId, pack, db) : getKolSpec(userId, db));
}

export function addBlockedHandle(userId: string, handle: string, db = getDb()): string[] {
  const normalized = handle.replace(/^@/, "").trim();
  if (!/^[A-Za-z0-9_]{1,15}$/.test(normalized)) {
    throw new Error("Handle must be 1–15 letters, numbers, or underscores");
  }
  const spec = getBlockedSpec(userId, db);
  const key = normalized.toLowerCase();
  const added = isEnvBlockedHandle(key, spec)
    ? (spec.added ?? []).filter((h) => h !== key)
    : [...new Set([...(spec.added ?? []), key])];
  const removed = (spec.removed ?? []).filter((h) => h !== key);
  setUserMeta(userId, "blocked_added", serializeHandleList(added), db);
  setUserMeta(userId, "blocked_removed", serializeHandleList(removed), db);
  recomputeAuthorQuality(key, userId, db);
  return listBlockedHandles(getBlockedSpec(userId, db));
}

export function removeBlockedHandle(userId: string, handle: string, db = getDb()): string[] {
  const normalized = handle.replace(/^@/, "").trim().toLowerCase();
  const spec = getBlockedSpec(userId, db);
  const added = (spec.added ?? []).filter((h) => h !== normalized);
  const removed = [...new Set([...(spec.removed ?? []), normalized])];
  setUserMeta(userId, "blocked_added", serializeHandleList(added), db);
  setUserMeta(userId, "blocked_removed", serializeHandleList(removed), db);
  recomputeAuthorQuality(normalized, userId, db);
  return listBlockedHandles(getBlockedSpec(userId, db));
}

export function resetBlockedHandles(userId: string, db = getDb()): string[] {
  const before = listBlockedHandles(getBlockedSpec(userId, db));
  setUserMeta(userId, "blocked_added", "", db);
  setUserMeta(userId, "blocked_removed", "", db);
  const after = listBlockedHandles(getBlockedSpec(userId, db));
  for (const handle of new Set([...before, ...after])) {
    recomputeAuthorQuality(handle, userId, db);
  }
  return after;
}

export function getStatus(
  userId: string,
  opts: { demoMode: boolean; bearerPresent: boolean; grokPresent?: boolean },
  db = getDb(),
): StatusSnapshot {
  const lastHeartbeatAt = getMeta("poller_heartbeat_at", db);
  const startedAt = getMeta("poller_started_at", db);
  const lastPollAt = getMeta("poller_last_poll_at", db);
  const lastError = getMeta("poller_last_error", db);
  const lastErrorAt = getMeta("poller_last_error_at", db);
  const mode = (getMeta("poller_mode", db) as "demo" | "live" | null) ?? "unknown";
  const healthy = lastHeartbeatAt
    ? Date.now() - new Date(lastHeartbeatAt).getTime() < 30_000
    : false;
  const extra = sqlFocusMode(parseDeskMode(getUserMeta(userId, "desk_mode", db)));
  const liveClause = opts.demoMode ? "" : "AND p.tweet_id NOT LIKE 'demo-%'";
  const counts = db.prepare(`
    SELECT
      (SELECT COUNT(*) FROM rules WHERE user_id = ?) AS rules,
      (SELECT COUNT(*) FROM rules r WHERE r.user_id = ? AND r.enabled = 1 AND TRIM(r.query) != ''${extra.sql}) AS enabled_rules,
      (SELECT COUNT(DISTINCT p.tweet_id) FROM posts p
        JOIN post_hits h ON h.tweet_id = p.tweet_id
        JOIN rules r ON r.user_id = ? AND r.query_hash = h.query_hash AND r.enabled = 1
        WHERE 1=1 ${liveClause}${extra.sql}) AS matches,
      (SELECT COUNT(DISTINCT p.tweet_id) FROM posts p
        JOIN post_hits h ON h.tweet_id = p.tweet_id
        JOIN rules r ON r.user_id = ? AND r.query_hash = h.query_hash AND r.enabled = 1
        LEFT JOIN user_post_state s ON s.user_id = r.user_id AND s.tweet_id = p.tweet_id
        WHERE COALESCE(s.read, 0) = 0 ${liveClause}${extra.sql}) AS unread,
      (SELECT COUNT(*) FROM tickers WHERE user_id = ?) AS tickers
  `).get(userId, userId, ...extra.params, userId, ...extra.params, userId, ...extra.params, userId) as {
    rules: number;
    enabled_rules: number;
    matches: number;
    unread: number;
    tickers: number;
  };

  const training = db.prepare(`
    SELECT
      COUNT(DISTINCT CASE WHEN user_label = 'high' THEN tweet_id END) AS high,
      COUNT(DISTINCT CASE WHEN user_label = 'low' THEN tweet_id END) AS low
    FROM user_post_state
    WHERE user_id = ?
  `).get(userId) as { high: number; low: number };

  const searchRequests = Number(getMeta("x_search_requests", db) ?? "0") || 0;
  const lastPackedQueries = Number(getMeta("x_last_packed_queries", db) ?? "0") || 0;
  const remainingRaw = getMeta("x_rate_limit_remaining", db);
  const limitRaw = getMeta("x_rate_limit_limit", db);
  const resetRaw = getMeta("x_rate_limit_reset_at", db);
  const idleBackoffMs = Number(getMeta("poller_idle_backoff_ms", db) ?? "0") || 0;
  const forceNow = getMeta("poller_force_now", db);
  const lastManualPollAt = getMeta("poller_manual_ack_at", db);
  const postsRead = Number(getMeta("x_posts_read", db) ?? "0") || 0;
  const usersRead = Number(getMeta("x_users_read", db) ?? "0") || 0;
  const lastPollPosts = Number(getMeta("x_last_poll_posts", db) ?? "0") || 0;
  const lastPollUsers = Number(getMeta("x_last_poll_users", db) ?? "0") || 0;
  const spec = getKolSpec(userId, db);
  const kolHandles = [...getEffectiveKolHandleSet(userId, db)].sort((a, b) => a.localeCompare(b));
  const blockedSpec = getBlockedSpec(userId, db);
  const filters = getDeskFilterSettings(userId, db);
  const floors = SIGNAL_LEVELS[filters.signalLevel];

  return {
    demoMode: opts.demoMode,
    bearerToken: opts.bearerPresent ? "present" : "missing",
    grok: opts.grokPresent ? "present" : "missing",
    whatsappLinked: getMeta("whatsapp_status", db) === "connected",
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
      postsRead,
      usersRead,
      estimatedCostUsd: estimateReadUsd(postsRead, usersRead),
      lastPollPosts,
      lastPollUsers,
      lastPollCostUsd: estimateReadUsd(lastPollPosts, lastPollUsers),
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
    blocked: {
      count: listBlockedHandles(blockedSpec).length,
      added: blockedSpec.added ?? [],
      removed: blockedSpec.removed ?? [],
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
    cadenceMinutes: getDeskCadenceMinutes(userId, db),
  };
}

export function listTickers(userId: string, db = getDb()): string[] {
  const rows = db.prepare("SELECT symbol FROM tickers WHERE user_id = ? ORDER BY symbol ASC").all(userId) as Array<{
    symbol: string;
  }>;
  return rows.map((row) => row.symbol);
}

function listWatchlistRules(userId: string, db: Database.Database): Rule[] {
  const rows = db.prepare(
    "SELECT * FROM rules WHERE kind = 'watchlist' AND user_id = ? ORDER BY COALESCE(watchlist_chunk, 0) ASC, created_at ASC",
  ).all(userId) as RuleRow[];
  return rows.map(mapRule);
}

function listKeyLeaderRules(userId: string, db: Database.Database): Rule[] {
  const rows = db.prepare(
    "SELECT * FROM rules WHERE kind = 'key_leaders' AND user_id = ? ORDER BY COALESCE(watchlist_chunk, 0) ASC, created_at ASC",
  ).all(userId) as RuleRow[];
  return rows.map(mapRule);
}

function watchlistEnabled(userId: string, db: Database.Database): boolean {
  return (getUserMeta(userId, "watchlist_enabled", db) ?? "1") !== "0";
}

function keyLeadersEnabled(userId: string, db: Database.Database): boolean {
  return (getUserMeta(userId, "key_leaders_enabled", db) ?? "1") !== "0";
}

function watchlistPollIntervalMs(userId: string, db: Database.Database): number {
  return clampPollIntervalMs(Number(getUserMeta(userId, "watchlist_poll_interval_ms", db) ?? DEFAULT_POLL_INTERVAL_MS));
}

export function getWatchlist(userId: string, db = getDb()): WatchlistSnapshot {
  const tickers = listTickers(userId, db);
  const rules = listWatchlistRules(userId, db);
  return {
    tickers,
    enabled: watchlistEnabled(userId, db),
    pollIntervalMs: getDeskCadenceMinutes(userId, db) * 60_000,
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

export function syncWatchlistRules(userId: string, db = getDb()) {
  const tickers = listTickers(userId, db);
  const enabled = watchlistEnabled(userId, db) && tickers.length > 0;
  const interval = watchlistPollIntervalMs(userId, db);
  const chunks = chunkTickersForQuery(tickers);
  const existing = listWatchlistRules(userId, db);
  const ts = nowIso();

  const apply = db.transaction(() => {
    if (chunks.length === 0) {
      const keep = existing[0];
      if (keep) {
        db.prepare(`
          UPDATE rules SET
            name = 'Watchlist', enabled = 0, query = '', query_input = '',
            poll_interval_ms = ?, watchlist_chunk = 0, kind = 'watchlist', mode = 'markets', updated_at = ?
          WHERE id = ? AND user_id = ?
        `).run(interval, ts, keep.id, userId);
        for (const extra of existing.slice(1)) {
          db.prepare("DELETE FROM rules WHERE id = ? AND user_id = ?").run(extra.id, userId);
        }
      } else {
        db.prepare(`
          INSERT INTO rules (
            id, user_id, name, enabled, query, query_input, accounts_json, poll_interval_ms,
            slack_webhook_url, generic_webhook_url, created_at, updated_at, kind, watchlist_chunk, mode
          ) VALUES (?, ?, 'Watchlist', 0, '', '', '[]', ?, NULL, NULL, ?, ?, 'watchlist', 0, 'markets')
        `).run(crypto.randomUUID(), userId, interval, ts, ts);
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
            poll_interval_ms = ?, watchlist_chunk = ?, kind = 'watchlist', mode = 'markets', updated_at = ?
          WHERE id = ? AND user_id = ?
        `).run(name, enabled ? 1 : 0, query, query, interval, i, ts, current.id, userId);
      } else {
        db.prepare(`
          INSERT INTO rules (
            id, user_id, name, enabled, query, query_input, accounts_json, poll_interval_ms,
            slack_webhook_url, generic_webhook_url, created_at, updated_at, kind, watchlist_chunk, mode
          ) VALUES (?, ?, ?, ?, ?, ?, '[]', ?, NULL, NULL, ?, ?, 'watchlist', ?, 'markets')
        `).run(crypto.randomUUID(), userId, name, enabled ? 1 : 0, query, query, interval, ts, ts, i);
      }
    }
    for (const extra of existing.slice(chunks.length)) {
      db.prepare("DELETE FROM rules WHERE id = ? AND user_id = ?").run(extra.id, userId);
    }
  });
  apply();
}

export function replaceTickers(userId: string, input: string[] | string, db = getDb()): WatchlistSnapshot {
  const symbols = normalizeTickers(input);
  if (symbols.length > MAX_WATCHLIST_TICKERS) {
    throw new Error(`Watchlist is capped at ${MAX_WATCHLIST_TICKERS} tickers.`);
  }
  const write = db.transaction(() => {
    db.prepare("DELETE FROM tickers WHERE user_id = ?").run(userId);
    const insert = db.prepare("INSERT INTO tickers (user_id, symbol, created_at) VALUES (?, ?, ?)");
    const ts = nowIso();
    for (const symbol of symbols) insert.run(userId, symbol, ts);
    syncWatchlistRules(userId, db);
  });
  write();
  return getWatchlist(userId, db);
}

export function addTickers(userId: string, input: string[] | string, db = getDb()): WatchlistSnapshot {
  return replaceTickers(userId, [...listTickers(userId, db), ...normalizeTickers(input)], db);
}

export function removeTickers(userId: string, input: string[] | string, db = getDb()): WatchlistSnapshot {
  const drop = new Set(normalizeTickers(input));
  return replaceTickers(
    userId,
    listTickers(userId, db).filter((symbol) => !drop.has(symbol)),
    db,
  );
}

export function setWatchlistSettings(
  userId: string,
  input: { enabled?: boolean; pollIntervalMs?: number },
  db = getDb(),
): WatchlistSnapshot {
  if (input.enabled !== undefined) {
    setUserMeta(userId, "watchlist_enabled", input.enabled ? "1" : "0", db);
  }
  if (input.pollIntervalMs !== undefined) {
    setUserMeta(userId, "watchlist_poll_interval_ms", String(clampPollIntervalMs(input.pollIntervalMs)), db);
  }
  syncWatchlistRules(userId, db);
  return getWatchlist(userId, db);
}

export function syncKeyLeaderRules(userId: string, db = getDb()) {
  const handles = listKolHandles(getKolPackSpec(userId, "markets", db));
  const enabled = keyLeadersEnabled(userId, db) && handles.length > 0;
  const interval = watchlistPollIntervalMs(userId, db);
  const chunks = chunkHandlesForFromQuery(handles, WATCHLIST_QUERY_BUDGET);
  const existing = listKeyLeaderRules(userId, db);
  const ts = nowIso();

  const apply = db.transaction(() => {
    if (chunks.length === 0) {
      const keep = existing[0];
      if (keep) {
        db.prepare(`
          UPDATE rules SET
            name = 'Key Leaders', enabled = 0, query = '', query_input = '',
            accounts_json = '[]', poll_interval_ms = ?, watchlist_chunk = 0,
            kind = 'key_leaders', mode = 'markets', updated_at = ?
          WHERE id = ? AND user_id = ?
        `).run(interval, ts, keep.id, userId);
        for (const extra of existing.slice(1)) {
          db.prepare("DELETE FROM rules WHERE id = ? AND user_id = ?").run(extra.id, userId);
        }
      } else {
        db.prepare(`
          INSERT INTO rules (
            id, user_id, name, enabled, query, query_input, accounts_json, poll_interval_ms,
            slack_webhook_url, generic_webhook_url, created_at, updated_at, kind, watchlist_chunk, mode
          ) VALUES (?, ?, 'Key Leaders', 0, '', '', '[]', ?, NULL, NULL, ?, ?, 'key_leaders', 0, 'markets')
        `).run(crypto.randomUUID(), userId, interval, ts, ts);
      }
      return;
    }
    for (let i = 0; i < chunks.length; i += 1) {
      const query = compileKeyLeadersQuery(chunks[i]);
      const name = chunks.length === 1 ? "Key Leaders" : `Key Leaders ${i + 1}`;
      const current = existing[i];
      if (current) {
        db.prepare(`
          UPDATE rules SET
            name = ?, enabled = ?, query = ?, query_input = ?, accounts_json = ?,
            poll_interval_ms = ?, watchlist_chunk = ?, kind = 'key_leaders', mode = 'markets', updated_at = ?
          WHERE id = ? AND user_id = ?
        `).run(
          name,
          enabled ? 1 : 0,
          query,
          "lang:en -is:retweet",
          JSON.stringify(chunks[i]),
          interval,
          i,
          ts,
          current.id,
          userId,
        );
      } else {
        db.prepare(`
          INSERT INTO rules (
            id, user_id, name, enabled, query, query_input, accounts_json, poll_interval_ms,
            slack_webhook_url, generic_webhook_url, created_at, updated_at, kind, watchlist_chunk, mode
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?, 'key_leaders', ?, 'markets')
        `).run(
          crypto.randomUUID(),
          userId,
          name,
          enabled ? 1 : 0,
          query,
          "lang:en -is:retweet",
          JSON.stringify(chunks[i]),
          interval,
          ts,
          ts,
          i,
        );
      }
    }
    for (const extra of existing.slice(chunks.length)) {
      db.prepare("DELETE FROM rules WHERE id = ? AND user_id = ?").run(extra.id, userId);
    }
  });
  apply();
}

function parseIdList(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed)) {
      return [...new Set(parsed.map((item) => String(item).trim()).filter(Boolean))];
    }
  } catch {
    /* fall through */
  }
  return [...new Set(raw.split(/[\s,]+/).map((item) => item.trim()).filter(Boolean))];
}

export function listLaunchTracked(userId: string, db = getDb()): string[] {
  return parseIdList(getUserMeta(userId, "launch_tracked", db));
}

export function listLaunchMuted(userId: string, db = getDb()): string[] {
  return parseIdList(getUserMeta(userId, "launch_muted", db));
}

export type LaunchStoryAction = "track" | "untrack" | "mute" | "unmute";

export function applyLaunchStoryAction(
  userId: string,
  storyId: string,
  action: LaunchStoryAction,
  db = getDb(),
): { tracked: string[]; muted: string[]; watchlistSymbol: string | null } {
  const id = storyId.trim();
  if (!id) throw new Error("Story is required.");
  const tracked = new Set(listLaunchTracked(userId, db));
  const muted = new Set(listLaunchMuted(userId, db));
  let watchlistSymbol: string | null = null;
  const theme = id.startsWith("theme:") ? id.slice("theme:".length) : id;
  if (action === "track") {
    tracked.add(id);
    muted.delete(id);
    if (theme.startsWith("$") && theme.length <= 6) {
      addTickers(userId, [theme], db);
      watchlistSymbol = theme.slice(1).toUpperCase();
    }
  } else if (action === "untrack") {
    tracked.delete(id);
  } else if (action === "mute") {
    muted.add(id);
  } else if (action === "unmute") {
    muted.delete(id);
  } else {
    throw new Error("Unknown action.");
  }
  setUserMeta(userId, "launch_tracked", JSON.stringify([...tracked]), db);
  setUserMeta(userId, "launch_muted", JSON.stringify([...muted]), db);
  return { tracked: [...tracked], muted: [...muted], watchlistSymbol };
}

