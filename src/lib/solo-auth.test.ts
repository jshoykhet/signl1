import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { admitGoogleUser, listUsers } from "./access";
import { openDatabase } from "./db";
import { phoneToEmail } from "./phone";
import { clearSoloPhone, getSoloAuth, markSoloPhone } from "./solo-auth";

const tmpDirs: string[] = [];

afterEach(() => {
  for (const dir of tmpDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

function tempDb() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "signal-google-"));
  tmpDirs.push(dir);
  return openDatabase(path.join(dir, "test.db"));
}

describe("Google desks", () => {
  it("makes the first verified Gmail the admin", () => {
    const db = tempDb();
    const user = admitGoogleUser({ email: " Desk.Lead@Gmail.com ", name: "Lead" }, db);
    expect(user?.role).toBe("admin");
    expect(user?.email).toBe("desk.lead@gmail.com");
    expect(listUsers(db)).toHaveLength(1);

    const again = admitGoogleUser({ email: "desk.lead@gmail.com" }, db);
    expect(again?.id).toBe(user?.id);
  });

  it("lets a second Gmail start a separate desk", () => {
    const db = tempDb();
    const first = admitGoogleUser({ email: "lead@gmail.com" }, db);
    const second = admitGoogleUser({ email: "other@gmail.com" }, db);
    expect(first?.role).toBe("admin");
    expect(second?.role).toBe("operator");
    expect(second?.id).not.toBe(first?.id);
    expect(listUsers(db)).toHaveLength(2);
  });

  it("rebinds a leftover phone owner to the first Google email", () => {
    const db = tempDb();
    admitGoogleUser({ email: phoneToEmail("14155552671"), name: "+14155552671" }, db);
    markSoloPhone("14155552671", db);
    expect(getSoloAuth(db).confirmed).toBe(true);

    const google = admitGoogleUser({ email: "owner@gmail.com", name: "Owner" }, db);
    expect(google?.email).toBe("owner@gmail.com");
    expect(google?.name).toBe("Owner");
    expect(listUsers(db)).toHaveLength(1);
    expect(listUsers(db)[0]?.email).toBe("owner@gmail.com");
    expect(getSoloAuth(db).phone).toBeNull();
  });

  it("clears stored phone meta", () => {
    const db = tempDb();
    markSoloPhone("+1 415 555 2671", db);
    expect(getSoloAuth(db)).toMatchObject({ phone: "14155552671", confirmed: true });
    clearSoloPhone(db);
    expect(getSoloAuth(db).phone).toBeNull();
  });
});
