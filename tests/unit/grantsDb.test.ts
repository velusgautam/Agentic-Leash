import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { collapseGrantDupes, listGrants, openGrantsDb, upsertGrant } from "../../src/shared/db";

const row = (path: string, expiresAt: number | null, createdAt = 1) => ({
  agent: "cursor",
  path,
  access: "write" as const,
  source: "leash" as const,
  createdAt,
  expiresAt,
});

describe("upsertGrant", () => {
  it("refreshes the same agent, path, and access instead of inserting another row", () => {
    const db = openGrantsDb(join(mkdtempSync(join(tmpdir(), "al-grants-")), "grants.db"));
    upsertGrant(db, row("/Volumes/Agentic Leash 1", 100));
    upsertGrant(db, row("/Volumes/Agentic Leash 1", 250, 20));
    const grants = listGrants(db);
    expect(grants).toHaveLength(1);
    expect(grants[0]?.expiresAt).toBe(250);
    expect(grants[0]?.createdAt).toBe(20);
    db.close();
  });

  it("keeps a longer grant, including forever", () => {
    const db = openGrantsDb(join(mkdtempSync(join(tmpdir(), "al-grants-")), "grants.db"));
    upsertGrant(db, row("/work", null, 5));
    upsertGrant(db, row("/work", 50, 9));
    expect(listGrants(db)[0]).toMatchObject({ expiresAt: null, createdAt: 5 });
    upsertGrant(db, row("/other", 80, 1));
    upsertGrant(db, row("/other", 40, 2));
    expect(listGrants(db).find((grant) => grant.path === "/other")).toMatchObject({ expiresAt: 80, createdAt: 1 });
    db.close();
  });
});

describe("collapseGrantDupes", () => {
  it("leaves one row per path and keeps forever over a timed grant", () => {
    const db = openGrantsDb(join(mkdtempSync(join(tmpdir(), "al-grants-")), "grants.db"));
    const insert = db.prepare("INSERT INTO grants (agent, path, access, source, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?)");
    insert.run("cursor", "/Volumes/Agentic Leash 1", "write", "leash", 1, 150);
    insert.run("cursor", "/Volumes/Agentic Leash 1", "write", "leash", 2, null);
    insert.run("cursor", "/Volumes/Agentic Leash 1", "write", "leash", 3, 900);
    collapseGrantDupes(db);
    const grants = listGrants(db);
    expect(grants).toHaveLength(1);
    expect(grants[0]?.expiresAt).toBe(null);
    db.close();
  });
});
