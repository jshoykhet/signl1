import type Database from "better-sqlite3";
import { getDb, getMeta, setMeta } from "./db";
import { parseE164 } from "./phone";

const PHONE_KEY = "solo_phone";
const CONFIRMED_KEY = "solo_phone_confirmed";

export type SoloAuthState = {
  phone: string | null;
  confirmed: boolean;
  enrolled: boolean;
};

function use(db?: Database.Database): Database.Database {
  return db ?? getDb();
}

export function getSoloAuth(db?: Database.Database): SoloAuthState {
  const conn = use(db);
  const phone = parseE164(getMeta(PHONE_KEY, conn));
  const confirmed = getMeta(CONFIRMED_KEY, conn) === "1";
  return {
    phone,
    confirmed: Boolean(phone && confirmed),
    enrolled: Boolean(phone),
  };
}

/** Drop leftover Firebase phone claim after a Google email takes over. */
export function clearSoloPhone(db?: Database.Database): void {
  const conn = use(db);
  conn.prepare("DELETE FROM meta WHERE key IN (?, ?)").run(PHONE_KEY, CONFIRMED_KEY);
}

/** Kept so older tests / backups can still record a phone claim. */
export function markSoloPhone(rawPhone: string, db?: Database.Database): void {
  const phone = parseE164(rawPhone);
  if (!phone) return;
  setMeta(PHONE_KEY, phone, db);
  setMeta(CONFIRMED_KEY, "1", db);
}
