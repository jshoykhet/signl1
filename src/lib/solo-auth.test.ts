import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { listUsers } from "./access";
import { openDatabase } from "./db";
import { admitFirebasePhone, getSoloAuth } from "./solo-auth";

const tmpDirs: string[] = [];

afterEach(() => {
  for (const dir of tmpDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

function tempDb() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "signal-otp-"));
  tmpDirs.push(dir);
  return openDatabase(path.join(dir, "test.db"));
}

describe("Firebase solo phone", () => {
  it("makes the first verified number the owner", () => {
    const db = tempDb();
    const user = admitFirebasePhone("+1 415 555 2671", db);
    expect(user?.role).toBe("admin");
    expect(user?.email).toBe("14155552671@phone.signl1");
    expect(getSoloAuth(db)).toMatchObject({ phone: "14155552671", confirmed: true });
    expect(listUsers(db)).toHaveLength(1);

    const again = admitFirebasePhone("14155552671", db);
    expect(again?.id).toBe(user?.id);
  });

  it("rejects a second number after the desk is claimed", () => {
    const db = tempDb();
    expect(admitFirebasePhone("14155552671", db)).toBeTruthy();
    expect(admitFirebasePhone("447700900123", db)).toBeNull();
    expect(listUsers(db)).toHaveLength(1);
  });

  it("rejects an invalid number", () => {
    const db = tempDb();
    expect(admitFirebasePhone("123", db)).toBeNull();
  });
});
