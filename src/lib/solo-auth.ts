import type Database from "better-sqlite3";
import { admitUser, type DeskUser } from "./access";
import { getDb, getMeta, setMeta } from "./db";
import { formatPhone, parseE164, phoneToEmail } from "./phone";

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

/** First verified Firebase phone owns the desk. A different number is refused. */
export function admitFirebasePhone(rawPhone: string, db?: Database.Database): DeskUser | null {
  const phone = parseE164(rawPhone);
  if (!phone) return null;

  const conn = use(db);
  const current = getSoloAuth(conn);
  if (current.confirmed && current.phone && current.phone !== phone) {
    return null;
  }

  const user = admitUser({ email: phoneToEmail(phone), name: formatPhone(phone) }, conn);
  if (!user) return null;

  setMeta(PHONE_KEY, phone, conn);
  setMeta(CONFIRMED_KEY, "1", conn);
  return user;
}
