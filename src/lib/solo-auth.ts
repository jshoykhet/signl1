import type Database from "better-sqlite3";
import { admitUser, getUserByEmail, listUsers, type DeskUser } from "./access";
import { getDb, getMeta, setMeta } from "./db";
import { generateTotpSecret, totpAuthUrl, verifyTotp } from "./otp";
import { formatPhone, parseE164, phoneToEmail } from "./phone";

const PHONE_KEY = "solo_phone";
const SECRET_KEY = "solo_totp_secret";
const CONFIRMED_KEY = "solo_totp_confirmed";

export type SoloAuthState = {
  phone: string | null;
  confirmed: boolean;
  enrolled: boolean;
};

export type OtpStartResult =
  | { ok: true; mode: "enroll"; phone: string; otpauthUrl: string; secret: string }
  | { ok: true; mode: "challenge"; phone: string }
  | { ok: false; error: string };

function use(db?: Database.Database): Database.Database {
  return db ?? getDb();
}

export function getSoloAuth(db?: Database.Database): SoloAuthState {
  const conn = use(db);
  const phone = parseE164(getMeta(PHONE_KEY, conn));
  const secret = getMeta(SECRET_KEY, conn);
  const confirmed = getMeta(CONFIRMED_KEY, conn) === "1";
  return {
    phone,
    confirmed: Boolean(phone && secret && confirmed),
    enrolled: Boolean(phone && secret),
  };
}

export function startSoloOtp(rawPhone: string, db?: Database.Database): OtpStartResult {
  const phone = parseE164(rawPhone);
  if (!phone) return { ok: false, error: "Enter a valid phone number with country code." };

  const conn = use(db);
  const current = getSoloAuth(conn);
  if (current.confirmed && current.phone && current.phone !== phone) {
    return { ok: false, error: "This desk is already linked to another number." };
  }

  if (current.confirmed && current.phone === phone) {
    return { ok: true, mode: "challenge", phone };
  }

  const existingSecret = current.phone === phone ? getMeta(SECRET_KEY, conn) : null;
  const secret = existingSecret || generateTotpSecret();
  setMeta(PHONE_KEY, phone, conn);
  setMeta(SECRET_KEY, secret, conn);
  setMeta(CONFIRMED_KEY, "0", conn);
  const label = formatPhone(phone);
  return {
    ok: true,
    mode: "enroll",
    phone,
    secret,
    otpauthUrl: totpAuthUrl(secret, label),
  };
}

export function verifySoloOtp(rawPhone: string, code: string, db?: Database.Database): DeskUser | null {
  const phone = parseE164(rawPhone);
  if (!phone) return null;
  const conn = use(db);
  const storedPhone = parseE164(getMeta(PHONE_KEY, conn));
  const secret = getMeta(SECRET_KEY, conn);
  if (!storedPhone || storedPhone !== phone || !secret) return null;
  if (!verifyTotp(secret, code, formatPhone(phone))) return null;

  const confirmed = getMeta(CONFIRMED_KEY, conn) === "1";
  if (!confirmed) setMeta(CONFIRMED_KEY, "1", conn);

  const email = phoneToEmail(phone);
  const existing = getUserByEmail(email, conn);
  if (existing) {
    return admitUser({ email, name: formatPhone(phone) }, conn);
  }

  const users = listUsers(conn);
  if (users.length === 0) {
    return admitUser({ email, name: formatPhone(phone) }, conn);
  }

  // Bind TOTP to the existing solo desk (e.g. a leftover Google/dev account).
  const owner = users.find((user) => !user.disabled) ?? users[0]!;
  return admitUser({ email: owner.email, name: formatPhone(phone) }, conn);
}
