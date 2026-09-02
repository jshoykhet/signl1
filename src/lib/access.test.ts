import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  addAllowedEmail,
  admitUser,
  countAllowedEmails,
  getUserByEmail,
  isEmailAllowed,
  listUsers,
  removeAllowedEmail,
  setUserDisabled,
} from "./access";
import { openDatabase } from "./db";

const tmpDirs: string[] = [];
const originalAllowed = process.env.AUTH_ALLOWED_EMAILS;
const originalPublic = process.env.AUTH_PUBLIC_SIGNUP;

afterEach(() => {
  process.env.AUTH_ALLOWED_EMAILS = originalAllowed;
  process.env.AUTH_PUBLIC_SIGNUP = originalPublic;
  for (const dir of tmpDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

function tempDb() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "signal-access-"));
  tmpDirs.push(dir);
  return openDatabase(path.join(dir, "test.db"));
}

describe("admitUser and allowlist", () => {
  beforeEach(() => {
    delete process.env.AUTH_PUBLIC_SIGNUP;
  });

  it("makes the first user admin when the allowlist is empty and records their email", () => {
    delete process.env.AUTH_ALLOWED_EMAILS;
    const db = tempDb();
    const user = admitUser({ email: " Desk.Lead@Example.com ", name: "Lead" }, db);
    expect(user).toMatchObject({
      email: "desk.lead@example.com",
      name: "Lead",
      role: "admin",
      disabled: false,
    });
    expect(isEmailAllowed("desk.lead@example.com", db)).toBe(true);
    expect(countAllowedEmails(db)).toBe(1);
  });

  it("rejects a second user who has not been invited", () => {
    delete process.env.AUTH_ALLOWED_EMAILS;
    const db = tempDb();
    admitUser({ email: "lead@desk.com" }, db);
    expect(admitUser({ email: "intern@desk.com" }, db)).toBeNull();
    expect(listUsers(db)).toHaveLength(1);
  });

  it("admits an invited email as operator", () => {
    delete process.env.AUTH_ALLOWED_EMAILS;
    const db = tempDb();
    admitUser({ email: "lead@desk.com" }, db);
    addAllowedEmail("intern@desk.com", "lead@desk.com", db);
    const intern = admitUser({ email: "intern@desk.com", name: "Intern" }, db);
    expect(intern).toMatchObject({ email: "intern@desk.com", role: "operator", name: "Intern" });
  });

  it("requires the first Google user to be on AUTH_ALLOWED_EMAILS when that list is set", () => {
    process.env.AUTH_ALLOWED_EMAILS = "ops@desk.com, research@desk.com";
    const db = tempDb();
    expect(admitUser({ email: "stranger@gmail.com" }, db)).toBeNull();
    const ops = admitUser({ email: "ops@desk.com" }, db);
    expect(ops?.role).toBe("admin");
    const research = admitUser({ email: "research@desk.com" }, db);
    expect(research?.role).toBe("operator");
  });

  it("refuses to revoke the last admin and blocks a revoked email from signing in", () => {
    delete process.env.AUTH_ALLOWED_EMAILS;
    const db = tempDb();
    admitUser({ email: "lead@desk.com" }, db);
    addAllowedEmail("second@desk.com", "lead@desk.com", db);
    admitUser({ email: "second@desk.com" }, db);
    expect(() => removeAllowedEmail("lead@desk.com", db)).toThrow(/last admin/i);

    removeAllowedEmail("second@desk.com", db);
    expect(admitUser({ email: "second@desk.com" }, db)).toBeNull();
    expect(getUserByEmail("second@desk.com", db)?.role).toBe("operator");
  });

  it("updates last login for a returning allowed user", () => {
    delete process.env.AUTH_ALLOWED_EMAILS;
    const db = tempDb();
    const first = admitUser({ email: "lead@desk.com", name: "A" }, db)!;
    const again = admitUser({ email: "lead@desk.com", name: "Lead" }, db)!;
    expect(again.id).toBe(first.id);
    expect(again.name).toBe("Lead");
    expect(again.lastLoginAt).toBeTruthy();
  });

  it("lets any Google account create a private desk when AUTH_PUBLIC_SIGNUP=1", () => {
    process.env.AUTH_PUBLIC_SIGNUP = "1";
    delete process.env.AUTH_ALLOWED_EMAILS;
    const db = tempDb();
    const lead = admitUser({ email: "lead@desk.com" }, db);
    const stranger = admitUser({ email: "stranger@gmail.com" }, db);
    expect(lead?.role).toBe("admin");
    expect(stranger?.role).toBe("operator");
    expect(stranger?.disabled).toBe(false);
    expect(listUsers(db)).toHaveLength(2);
  });

  it("refuses a disabled account even with public signup", () => {
    process.env.AUTH_PUBLIC_SIGNUP = "1";
    delete process.env.AUTH_ALLOWED_EMAILS;
    const db = tempDb();
    admitUser({ email: "lead@desk.com" }, db);
    admitUser({ email: "intern@desk.com" }, db);
    setUserDisabled("intern@desk.com", true, db);
    expect(admitUser({ email: "intern@desk.com" }, db)).toBeNull();
  });
});
