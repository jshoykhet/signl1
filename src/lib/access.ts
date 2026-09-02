import type Database from "better-sqlite3";
import { ensureUserDesk, getDb } from "./db";

export type DeskRole = "admin" | "operator";

export type DeskUser = {
  id: string;
  email: string;
  name: string | null;
  image: string | null;
  role: DeskRole;
  disabled: boolean;
  createdAt: string;
  lastLoginAt: string | null;
};

export type AllowedEmail = {
  email: string;
  invitedAt: string;
  invitedBy: string | null;
};

export type TeamSnapshot = {
  users: DeskUser[];
  allowedEmails: AllowedEmail[];
  pendingInvites: AllowedEmail[];
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type UserRow = {
  id: string;
  email: string;
  name: string | null;
  image: string | null;
  role: string;
  disabled: number | null;
  created_at: string;
  last_login_at: string | null;
};

function use(db?: Database.Database): Database.Database {
  return db ?? getDb();
}

function nowIso(): string {
  return new Date().toISOString();
}

export function normalizeEmail(value: string | null | undefined): string | null {
  const email = value?.trim().toLowerCase() ?? "";
  if (!EMAIL_RE.test(email)) return null;
  return email;
}

export function parseAllowedEmailsEnv(raw = process.env.AUTH_ALLOWED_EMAILS): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of (raw ?? "").split(/[,;\s]+/)) {
    const email = normalizeEmail(part);
    if (!email || seen.has(email)) continue;
    seen.add(email);
    out.push(email);
  }
  return out;
}

export function isGoogleAuthConfigured(): boolean {
  return Boolean(process.env.GOOGLE_CLIENT_ID?.trim() && process.env.GOOGLE_CLIENT_SECRET?.trim());
}

export function isDevLoginEnabled(): boolean {
  return process.env.AUTH_DEV_LOGIN === "1";
}

/** Anyone with Google (or local desk email) can create a private desk. */
export function isPublicSignup(): boolean {
  return process.env.AUTH_PUBLIC_SIGNUP === "1";
}

function mapUser(row: UserRow): DeskUser {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    image: row.image,
    role: row.role === "admin" ? "admin" : "operator",
    disabled: Boolean(row.disabled),
    createdAt: row.created_at,
    lastLoginAt: row.last_login_at,
  };
}

export function countUsers(db?: Database.Database): number {
  const row = use(db).prepare("SELECT COUNT(*) AS n FROM users").get() as { n: number };
  return Number(row.n);
}

export function countAllowedEmails(db?: Database.Database): number {
  const row = use(db).prepare("SELECT COUNT(*) AS n FROM allowed_emails").get() as { n: number };
  return Number(row.n);
}

export function getUserByEmail(email: string, db?: Database.Database): DeskUser | null {
  const normalized = normalizeEmail(email);
  if (!normalized) return null;
  const row = use(db).prepare("SELECT * FROM users WHERE email = ?").get(normalized) as UserRow | undefined;
  return row ? mapUser(row) : null;
}

export function listUsers(db?: Database.Database): DeskUser[] {
  const rows = use(db)
    .prepare("SELECT * FROM users ORDER BY role ASC, created_at ASC")
    .all() as UserRow[];
  return rows.map(mapUser);
}

export function listAllowedEmails(db?: Database.Database): AllowedEmail[] {
  const rows = use(db)
    .prepare("SELECT email, invited_at, invited_by FROM allowed_emails ORDER BY invited_at ASC")
    .all() as Array<{ email: string; invited_at: string; invited_by: string | null }>;
  return rows.map((row) => ({
    email: row.email,
    invitedAt: row.invited_at,
    invitedBy: row.invited_by,
  }));
}

export function isEmailAllowed(email: string, db?: Database.Database): boolean {
  const normalized = normalizeEmail(email);
  if (!normalized) return false;
  const row = use(db).prepare("SELECT 1 AS ok FROM allowed_emails WHERE email = ?").get(normalized) as
    | { ok: number }
    | undefined;
  return Boolean(row);
}

export function addAllowedEmail(email: string, invitedBy: string, db?: Database.Database): AllowedEmail {
  const normalized = normalizeEmail(email);
  if (!normalized) throw new Error("Enter a valid email address.");
  const ts = nowIso();
  use(db)
    .prepare(
      `INSERT INTO allowed_emails (email, invited_at, invited_by) VALUES (?, ?, ?)
       ON CONFLICT(email) DO UPDATE SET invited_by = excluded.invited_by`,
    )
    .run(normalized, ts, invitedBy);
  const row = use(db)
    .prepare("SELECT email, invited_at, invited_by FROM allowed_emails WHERE email = ?")
    .get(normalized) as { email: string; invited_at: string; invited_by: string | null };
  return { email: row.email, invitedAt: row.invited_at, invitedBy: row.invited_by };
}

export function removeAllowedEmail(email: string, db?: Database.Database): void {
  const normalized = normalizeEmail(email);
  if (!normalized) throw new Error("Enter a valid email address.");
  const target = getUserByEmail(normalized, db);
  if (target?.role === "admin") {
    const activeAdmins = listUsers(db).filter(
      (user) => user.role === "admin" && !user.disabled && isEmailAllowed(user.email, db),
    );
    if (activeAdmins.length <= 1) {
      throw new Error("Cannot revoke the last admin. Invite another admin first.");
    }
  }
  use(db).prepare("DELETE FROM allowed_emails WHERE email = ?").run(normalized);
}

export function setUserDisabled(email: string, disabled: boolean, db?: Database.Database): DeskUser {
  const target = getUserByEmail(email, db);
  if (!target) throw new Error("No account with that email.");
  if (disabled && target.role === "admin") {
    const activeAdmins = listUsers(db).filter((user) => user.role === "admin" && !user.disabled);
    if (activeAdmins.length <= 1) {
      throw new Error("Cannot disable the last admin.");
    }
  }
  use(db).prepare("UPDATE users SET disabled = ? WHERE email = ?").run(disabled ? 1 : 0, target.email);
  const updated = getUserByEmail(email, db);
  if (!updated) throw new Error("No account with that email.");
  return updated;
}

export function getTeamSnapshot(db?: Database.Database): TeamSnapshot {
  const users = listUsers(db);
  const allowedEmails = listAllowedEmails(db);
  const userEmails = new Set(users.map((user) => user.email));
  return {
    users,
    allowedEmails,
    pendingInvites: allowedEmails.filter((row) => !userEmails.has(row.email)),
  };
}

function touchLogin(
  id: string,
  input: { name?: string | null; image?: string | null },
  db: Database.Database,
) {
  db.prepare(
    `UPDATE users SET
      last_login_at = ?,
      name = COALESCE(?, name),
      image = COALESCE(?, image)
     WHERE id = ?`,
  ).run(nowIso(), input.name?.trim() || null, input.image?.trim() || null, id);
}

/**
 * Gate for Google / local desk login.
 *
 * AUTH_PUBLIC_SIGNUP=1: any valid Google (or local desk) email gets a private desk.
 * Otherwise access is invite-only. First user becomes instance admin. If the
 * allowlist already has rows (including AUTH_ALLOWED_EMAILS), that first user
 * must still be on the list.
 */
export function admitUser(
  input: { email: string; name?: string | null; image?: string | null },
  db?: Database.Database,
): DeskUser | null {
  const conn = use(db);
  const email = normalizeEmail(input.email);
  if (!email) return null;

  const existing = getUserByEmail(email, conn);
  const allowed = isEmailAllowed(email, conn);
  const userCount = countUsers(conn);
  const allowCount = countAllowedEmails(conn);
  const publicSignup = isPublicSignup();

  if (existing) {
    if (existing.disabled) return null;
    if (!publicSignup && allowCount > 0 && !allowed) return null;
    touchLogin(existing.id, input, conn);
    ensureUserDesk(existing.id, conn);
    return getUserByEmail(email, conn);
  }

  if (!publicSignup) {
    const bootstrap = userCount === 0 && allowCount === 0;
    if (!bootstrap && !allowed) return null;
  }

  const ts = nowIso();
  const id = crypto.randomUUID();
  const role: DeskRole = userCount === 0 ? "admin" : "operator";
  conn
    .prepare(
      `INSERT INTO users (id, email, name, image, role, created_at, last_login_at, disabled)
       VALUES (?, ?, ?, ?, ?, ?, ?, 0)`,
    )
    .run(id, email, input.name?.trim() || null, input.image?.trim() || null, role, ts, ts);

  if (!publicSignup && userCount === 0 && allowCount === 0) {
    addAllowedEmail(email, "bootstrap", conn);
  }

  ensureUserDesk(id, conn);
  return getUserByEmail(email, conn);
}
