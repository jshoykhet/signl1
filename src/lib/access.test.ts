import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  admitGoogleUser,
  admitUser,
  allowedGoogleEmail,
  isDevLoginEnabled,
  listUsers,
} from "./access";
import { listRules, openDatabase } from "./db";
import { getUsageSnapshot } from "./usage";

const tmpDirs: string[] = [];

afterEach(() => {
  for (const dir of tmpDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

function tempDb() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "signal-access-"));
  tmpDirs.push(dir);
  return openDatabase(path.join(dir, "test.db"));
}

function restoreEnv(key: string, prev: string | undefined) {
  if (prev === undefined) delete process.env[key];
  else process.env[key] = prev;
}

describe("admitUser personal desks", () => {
  it("makes the first sign-in the admin", () => {
    const db = tempDb();
    const user = admitUser({ email: " Desk.Lead@Example.com ", name: "Lead" }, db);
    expect(user).toMatchObject({
      email: "desk.lead@example.com",
      name: "Lead",
      role: "admin",
      disabled: false,
    });
    expect(listUsers(db)).toHaveLength(1);
  });

  it("gives a second person their own operator desk", () => {
    const db = tempDb();
    const lead = admitUser({ email: "lead@desk.com" }, db)!;
    const intern = admitUser({ email: "intern@desk.com", name: "Intern" }, db)!;
    expect(intern.role).toBe("operator");
    expect(intern.id).not.toBe(lead.id);
    expect(listUsers(db)).toHaveLength(2);
    expect(listRules(lead.id, db).length).toBeGreaterThan(0);
    expect(listRules(intern.id, db).length).toBeGreaterThan(0);
    expect(listRules(lead.id, db)[0]?.id).not.toBe(listRules(intern.id, db)[0]?.id);
  });

  it("reads AUTH_DEV_LOGIN at runtime", () => {
    const prev = process.env.AUTH_DEV_LOGIN;
    process.env.AUTH_DEV_LOGIN = "1";
    expect(isDevLoginEnabled()).toBe(true);
    process.env.AUTH_DEV_LOGIN = "0";
    expect(isDevLoginEnabled()).toBe(false);
    restoreEnv("AUTH_DEV_LOGIN", prev);
  });

  it("updates last login for the returning owner", () => {
    const db = tempDb();
    const first = admitUser({ email: "lead@desk.com", name: "A" }, db)!;
    const again = admitUser({ email: "lead@desk.com", name: "Lead" }, db)!;
    expect(again.id).toBe(first.id);
    expect(again.name).toBe("Lead");
    expect(again.lastLoginAt).toBeTruthy();
    expect(getUsageSnapshot(Date.now(), db).people[0]?.loginCount).toBe(1);
  });

  it("honors AUTH_GOOGLE_EMAIL as an allowlist", () => {
    const prev = process.env.AUTH_GOOGLE_EMAIL;
    process.env.AUTH_GOOGLE_EMAIL = "owner@gmail.com";
    expect(allowedGoogleEmail()).toBe("owner@gmail.com");
    const db = tempDb();
    expect(admitGoogleUser({ email: "other@gmail.com" }, db)).toBeNull();
    expect(admitGoogleUser({ email: "owner@gmail.com" }, db)?.email).toBe("owner@gmail.com");
    expect(admitGoogleUser({ email: "other@gmail.com" }, db)).toBeNull();
    restoreEnv("AUTH_GOOGLE_EMAIL", prev);
  });

  it("lets AUTH_ALLOWED_EMAILS admit more than one desk", () => {
    const prevGoogle = process.env.AUTH_GOOGLE_EMAIL;
    const prevAllowed = process.env.AUTH_ALLOWED_EMAILS;
    delete process.env.AUTH_GOOGLE_EMAIL;
    process.env.AUTH_ALLOWED_EMAILS = "lead@desk.com, intern@desk.com";
    const db = tempDb();
    expect(admitUser({ email: "lead@desk.com" }, db)?.role).toBe("admin");
    expect(admitUser({ email: "intern@desk.com" }, db)?.role).toBe("operator");
    expect(admitUser({ email: "stranger@desk.com" }, db)).toBeNull();
    restoreEnv("AUTH_GOOGLE_EMAIL", prevGoogle);
    restoreEnv("AUTH_ALLOWED_EMAILS", prevAllowed);
  });
});
