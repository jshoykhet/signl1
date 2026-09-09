import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { admitUser } from "./access";
import { openDatabase } from "./db";
import { getUsageSnapshot, recordLoginEvent } from "./usage";

const tmpDirs: string[] = [];

afterEach(() => {
  for (const dir of tmpDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

function tempDb(fileName = "test.db") {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "signal-usage-"));
  tmpDirs.push(dir);
  const file = path.join(dir, fileName);
  return { file, db: openDatabase(file) };
}

describe("usage analytics", () => {
  it("counts a first sign-in as one person and one login", () => {
    const { db } = tempDb();
    admitUser({ email: "lead@desk.com", name: "Lead" }, db);
    const snap = getUsageSnapshot(Date.now(), db);
    expect(snap.peopleCount).toBe(1);
    expect(snap.loginsTotal).toBe(1);
    expect(snap.signedInLast7d).toBe(1);
    expect(snap.newUsersLast7d).toBe(1);
    expect(snap.people[0]).toMatchObject({
      email: "lead@desk.com",
      name: "Lead",
      role: "admin",
      loginCount: 1,
      loginsLast7d: 1,
    });
  });

  it("does not double-count the authorize plus signIn admit", () => {
    const { db } = tempDb();
    admitUser({ email: "lead@desk.com" }, db);
    admitUser({ email: "lead@desk.com" }, db);
    const snap = getUsageSnapshot(Date.now(), db);
    expect(snap.loginsTotal).toBe(1);
    expect(snap.people[0]?.loginCount).toBe(1);
  });

  it("counts a later return visit", () => {
    const { db } = tempDb();
    const user = admitUser({ email: "lead@desk.com" }, db)!;
    const later = new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString();
    expect(recordLoginEvent(user.id, later, db)).toBe(true);
    const snap = getUsageSnapshot(Date.now() + 3 * 60 * 60 * 1000, db);
    expect(snap.loginsTotal).toBe(2);
    expect(snap.people[0]?.loginCount).toBe(2);
  });

  it("separates two SignlHQs and windowed activity", () => {
    const { db } = tempDb();
    const now = Date.parse("2026-09-09T12:00:00.000Z");
    const lead = admitUser({ email: "lead@desk.com" }, db)!;
    const intern = admitUser({ email: "intern@desk.com", name: "Intern" }, db)!;
    db.prepare("DELETE FROM login_events").run();
    db.prepare("UPDATE users SET created_at = ?, last_login_at = ? WHERE id = ?").run(
      "2026-09-08T10:00:00.000Z",
      "2026-09-08T12:00:00.000Z",
      lead.id,
    );
    db.prepare("UPDATE users SET created_at = ?, last_login_at = ? WHERE id = ?").run(
      "2026-07-01T12:00:00.000Z",
      "2026-07-02T12:00:00.000Z",
      intern.id,
    );
    expect(recordLoginEvent(lead.id, "2026-09-08T12:00:00.000Z", db)).toBe(true);
    expect(recordLoginEvent(intern.id, "2026-07-02T12:00:00.000Z", db)).toBe(true);

    const snap = getUsageSnapshot(now, db);
    expect(snap.peopleCount).toBe(2);
    expect(snap.signedInLast7d).toBe(1);
    expect(snap.signedInLast30d).toBe(1);
    expect(snap.newUsersLast7d).toBe(1);
    expect(snap.people.find((row) => row.email === "intern@desk.com")?.loginsLast7d).toBe(0);
    expect(snap.days).toHaveLength(14);
    expect(snap.days.at(-1)?.date).toBe("2026-09-09");
    expect(snap.days.find((day) => day.date === "2026-09-08")?.uniqueUsers).toBe(1);
  });

  it("backfills one login from last_login_at on an existing database", () => {
    const { file, db } = tempDb();
    const user = admitUser({ email: "lead@desk.com" }, db)!;
    db.prepare("DELETE FROM login_events").run();
    db.prepare("UPDATE users SET last_login_at = ? WHERE id = ?").run("2026-09-01T08:00:00.000Z", user.id);
    db.close();
    const again = openDatabase(file);
    const snap = getUsageSnapshot(Date.parse("2026-09-09T12:00:00.000Z"), again);
    expect(snap.loginsTotal).toBe(1);
    expect(snap.people[0]?.loginCount).toBe(1);
    expect(snap.people[0]?.lastLoginAt).toBe("2026-09-01T08:00:00.000Z");
  });
});
