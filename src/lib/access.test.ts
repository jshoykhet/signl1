import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { admitGoogleUser, admitUser, allowedGoogleEmail, isDevLoginEnabled, listUsers } from "./access";
import { openDatabase } from "./db";

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

describe("admitUser solo desk", () => {
  it("makes the first sign-in the owner", () => {
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

  it("rejects a second person", () => {
    const db = tempDb();
    admitUser({ email: "lead@desk.com" }, db);
    expect(admitUser({ email: "intern@desk.com" }, db)).toBeNull();
    expect(listUsers(db)).toHaveLength(1);
  });

  it("reads AUTH_DEV_LOGIN at runtime", () => {
    const prev = process.env.AUTH_DEV_LOGIN;
    process.env.AUTH_DEV_LOGIN = "1";
    expect(isDevLoginEnabled()).toBe(true);
    process.env.AUTH_DEV_LOGIN = "0";
    expect(isDevLoginEnabled()).toBe(false);
    if (prev === undefined) delete process.env.AUTH_DEV_LOGIN;
    else process.env.AUTH_DEV_LOGIN = prev;
  });

  it("updates last login for the returning owner", () => {
    const db = tempDb();
    const first = admitUser({ email: "lead@desk.com", name: "A" }, db)!;
    const again = admitUser({ email: "lead@desk.com", name: "Lead" }, db)!;
    expect(again.id).toBe(first.id);
    expect(again.name).toBe("Lead");
    expect(again.lastLoginAt).toBeTruthy();
  });

  it("honors AUTH_GOOGLE_EMAIL as a lock", () => {
    const prev = process.env.AUTH_GOOGLE_EMAIL;
    process.env.AUTH_GOOGLE_EMAIL = "owner@gmail.com";
    expect(allowedGoogleEmail()).toBe("owner@gmail.com");
    const db = tempDb();
    expect(admitGoogleUser({ email: "other@gmail.com" }, db)).toBeNull();
    expect(admitGoogleUser({ email: "owner@gmail.com" }, db)?.email).toBe("owner@gmail.com");
    if (prev === undefined) delete process.env.AUTH_GOOGLE_EMAIL;
    else process.env.AUTH_GOOGLE_EMAIL = prev;
  });

});
