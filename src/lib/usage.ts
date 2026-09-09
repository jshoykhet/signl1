import type Database from "better-sqlite3";
import { getDb } from "./db";

/** Google authorize + the signIn callback both call admitUser on one login. */
export const LOGIN_DEDUPE_MS = 2 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const SERIES_DAYS = 14;

export type UsagePerson = {
  id: string;
  email: string;
  name: string | null;
  role: "admin" | "operator";
  disabled: boolean;
  createdAt: string;
  lastLoginAt: string | null;
  loginCount: number;
  loginsLast7d: number;
  loginsLast30d: number;
};

export type UsageDay = {
  date: string;
  logins: number;
  uniqueUsers: number;
};

export type UsageSnapshot = {
  generatedAt: string;
  peopleCount: number;
  disabledCount: number;
  signedInLast7d: number;
  signedInLast30d: number;
  loginsLast7d: number;
  loginsLast30d: number;
  loginsTotal: number;
  newUsersLast7d: number;
  newUsersLast30d: number;
  days: UsageDay[];
  people: UsagePerson[];
};

function use(db?: Database.Database): Database.Database {
  return db ?? getDb();
}

function utcDay(iso: string): string {
  return iso.slice(0, 10);
}

function addUtcDays(day: string, delta: number): string {
  const date = new Date(`${day}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + delta);
  return date.toISOString().slice(0, 10);
}

export function recordLoginEvent(userId: string, at = new Date().toISOString(), db?: Database.Database): boolean {
  const conn = use(db);
  const last = conn
    .prepare(`SELECT logged_in_at FROM login_events WHERE user_id = ? ORDER BY logged_in_at DESC LIMIT 1`)
    .get(userId) as { logged_in_at: string } | undefined;
  if (last) {
    const prev = new Date(last.logged_in_at).getTime();
    const next = new Date(at).getTime();
    if (Number.isFinite(prev) && Number.isFinite(next) && Math.abs(next - prev) < LOGIN_DEDUPE_MS) {
      return false;
    }
  }
  conn.prepare(`INSERT INTO login_events (id, user_id, logged_in_at) VALUES (?, ?, ?)`).run(crypto.randomUUID(), userId, at);
  return true;
}

export function getUsageSnapshot(now = Date.now(), db?: Database.Database): UsageSnapshot {
  const conn = use(db);
  const generatedAt = new Date(now).toISOString();
  const cutoff7 = new Date(now - 7 * DAY_MS).toISOString();
  const cutoff30 = new Date(now - 30 * DAY_MS).toISOString();
  const seriesStart = utcDay(new Date(now - (SERIES_DAYS - 1) * DAY_MS).toISOString());
  const today = utcDay(generatedAt);

  const users = conn
    .prepare(
      `SELECT id, email, name, role, disabled, created_at, last_login_at FROM users ORDER BY last_login_at DESC, email ASC`,
    )
    .all() as Array<{
    id: string;
    email: string;
    name: string | null;
    role: string;
    disabled: number | null;
    created_at: string;
    last_login_at: string | null;
  }>;

  const counts = conn
    .prepare(
      `SELECT
        user_id,
        COUNT(*) AS total,
        SUM(CASE WHEN logged_in_at >= ? THEN 1 ELSE 0 END) AS last7,
        SUM(CASE WHEN logged_in_at >= ? THEN 1 ELSE 0 END) AS last30
       FROM login_events
       GROUP BY user_id`,
    )
    .all(cutoff7, cutoff30) as Array<{ user_id: string; total: number; last7: number; last30: number }>;
  const countByUser = new Map(counts.map((row) => [row.user_id, row]));

  const people: UsagePerson[] = users.map((user) => {
    const row = countByUser.get(user.id);
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role === "admin" ? "admin" : "operator",
      disabled: Boolean(user.disabled),
      createdAt: user.created_at,
      lastLoginAt: user.last_login_at,
      loginCount: Number(row?.total ?? 0),
      loginsLast7d: Number(row?.last7 ?? 0),
      loginsLast30d: Number(row?.last30 ?? 0),
    };
  });

  const active = people.filter((person) => !person.disabled);
  const dayRows = conn
    .prepare(
      `SELECT substr(logged_in_at, 1, 10) AS day, COUNT(*) AS logins, COUNT(DISTINCT user_id) AS unique_users
       FROM login_events
       WHERE logged_in_at >= ?
       GROUP BY day`,
    )
    .all(`${seriesStart}T00:00:00.000Z`) as Array<{ day: string; logins: number; unique_users: number }>;
  const byDay = new Map(dayRows.map((row) => [row.day, row]));
  const days: UsageDay[] = [];
  for (let cursor = seriesStart; cursor <= today; cursor = addUtcDays(cursor, 1)) {
    const row = byDay.get(cursor);
    days.push({
      date: cursor,
      logins: Number(row?.logins ?? 0),
      uniqueUsers: Number(row?.unique_users ?? 0),
    });
  }

  const distinct = (since: string) => {
    const row = conn
      .prepare(`SELECT COUNT(DISTINCT user_id) AS n FROM login_events WHERE logged_in_at >= ?`)
      .get(since) as { n: number };
    return Number(row.n);
  };
  const loginCount = (since?: string) => {
    const row = since
      ? (conn.prepare(`SELECT COUNT(*) AS n FROM login_events WHERE logged_in_at >= ?`).get(since) as { n: number })
      : (conn.prepare(`SELECT COUNT(*) AS n FROM login_events`).get() as { n: number });
    return Number(row.n);
  };

  return {
    generatedAt,
    peopleCount: active.length,
    disabledCount: people.length - active.length,
    signedInLast7d: distinct(cutoff7),
    signedInLast30d: distinct(cutoff30),
    loginsLast7d: loginCount(cutoff7),
    loginsLast30d: loginCount(cutoff30),
    loginsTotal: loginCount(),
    newUsersLast7d: active.filter((person) => person.createdAt >= cutoff7).length,
    newUsersLast30d: active.filter((person) => person.createdAt >= cutoff30).length,
    days,
    people,
  };
}
