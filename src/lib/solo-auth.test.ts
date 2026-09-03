import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { listUsers } from "./access";
import { openDatabase } from "./db";
import { totpFor } from "./otp";
import { startSoloOtp, verifySoloOtp } from "./solo-auth";

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

describe("solo OTP", () => {
  it("enrolls the first phone and signs in with a valid code", () => {
    const db = tempDb();
    const start = startSoloOtp("14155552671", db);
    expect(start.ok).toBe(true);
    if (!start.ok || start.mode !== "enroll") throw new Error("expected enroll");
    const code = totpFor(start.secret, "+14155552671").generate();
    const user = verifySoloOtp(start.phone, code, db);
    expect(user?.role).toBe("admin");
    expect(user?.email).toBe("14155552671@phone.signl1");
    expect(listUsers(db)).toHaveLength(1);

    const again = startSoloOtp("14155552671", db);
    expect(again.ok && again.mode === "challenge").toBe(true);
    const next = totpFor(start.secret, "+14155552671").generate();
    expect(verifySoloOtp("14155552671", next, db)?.id).toBe(user?.id);
  });

  it("rejects a second phone after enroll", () => {
    const db = tempDb();
    const start = startSoloOtp("+1 415 555 2671", db);
    if (!start.ok || start.mode !== "enroll") throw new Error("expected enroll");
    const code = totpFor(start.secret, "+14155552671").generate();
    expect(verifySoloOtp(start.phone, code, db)).toBeTruthy();
    const other = startSoloOtp("447700900123", db);
    expect(other.ok).toBe(false);
  });

  it("rejects a wrong code", () => {
    const db = tempDb();
    const start = startSoloOtp("14155552671", db);
    if (!start.ok || start.mode !== "enroll") throw new Error("expected enroll");
    expect(verifySoloOtp(start.phone, "000000", db)).toBeNull();
  });
});
