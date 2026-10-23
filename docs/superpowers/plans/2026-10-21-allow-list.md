# Allow list and command grants Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Auto-approve child folders of a granted folder, show shell commands on Grants, and let Settings store forever folder and command rules that skip the popup.

**Architecture:** Forever rows live in a new `rules` table. Popup shell allows add a command grant on the existing `grants` table (`command` text, `path` `""`). `decide()` checks lockdown, protected roots, an exact command match, then folder coverage. Settings edits rules. Grants lists command grants. Claude rules mode publishes folder rules for Claude and Global only.

**Tech Stack:** TypeScript, Electron, better-sqlite via `node:sqlite` `DatabaseSync`, Vitest, React, TanStack Router, existing Tailwind settings components.

## Global Constraints

- A request passes when every path sits inside a live folder grant or a forever folder rule for that agent or Global. A child folder counts. A shell that names a path outside still asks, unless that exact command is approved.
- Empty Cursor `cwd` uses `workspace_roots[0]`.
- Allow on a shell keeps the folder grant and adds a command row on Grants. Revoke on one leaves the other.
- A command matches the full text, for Global or that agent, in any working directory.
- `npm test` matches `npm test` only.
- Lockdown denies folder grants, command grants, and forever rules until it is turned off.
- A forever folder rule is write, so it covers read and write. The form has no read/write choice. `/` and `/Users` are rejected.
- Forever rows live only in Settings. Popup "Always" is a Grants row with `expiresAt` null. It is not copied into Settings.
- Revoke all deletes every `leash` and `config` grant, including command grants and popup Always. Rules stay. They apply again when lockdown ends.
- The agent menu is Global, Claude, Cursor, Codex, Gemini, and Hermes.
- Built-in skill toggles stay on Settings → General.
- Command grants store `path` as `""`. Folder matching ignores rows whose `command` is non-null.
- Validation errors, exact strings: `Enter a folder path or a command.` / `Pick a folder or a command.` / `Pick an agent.` / `Folder path must be absolute.` / `That folder is too broad.` / `Already in the allow list.` / `That rule is gone.`
- No new dependency. No new code comments.
- Commit subjects are one line, no body, matching this repo (`feat: ...`). No ticket id.
- Out of scope: History exec rows, command prefixes, a cwd limit, a read/write choice, copying popup Always into Settings, `t3-code` in the menu, moving the built-in skill toggles.

## File map

- `src/shared/types.ts` — `Grant.command`, `AllowRule`, `DecideOptions.rules`
- `src/shared/rules.ts` — `validateRule` (create)
- `src/shared/db.ts` — column, `rules` table, rule CRUD, command upsert
- `src/hook/decide.ts` — match order
- `src/hook/handle.ts` — pass rules into `decide`
- `src/hook/normalise.ts` — empty cwd and duplicate Cursor Shell (keep the working-tree change)
- `src/main/rulesMode.ts` — publish Claude and Global folder rules
- `src/main/runtime.ts` — command grant on allow, rules IPC, `releaseCovered` passes rules
- `src/shared/bridge.ts`, `src/preload/index.ts` — four rule methods
- `src/renderer/src/nav.ts`, `src/renderer/src/routes/settings.tsx` — Allow list page
- `src/renderer/src/routes/grants.tsx` — Commands section
- `tests/e2e/navigation.e2e.ts` — expect the Allow list link
- Tests: `tests/unit/rules.test.ts` (create), plus `grantsDb.test.ts`, `decide.test.ts`, `milestones.test.ts`, `hook.test.ts`, `grantView.test.ts`

---

### Task 1: Rule validation

**Files:**
- Create: `src/shared/rules.ts`
- Modify: `src/shared/types.ts`
- Modify: `tests/unit/decide.test.ts`
- Modify: `tests/unit/grantView.test.ts`
- Modify: `tests/unit/milestones.test.ts`
- Test: `tests/unit/rules.test.ts`

**Interfaces:**
- Consumes: `expandHome` and `normalise` from `src/shared/paths.ts`, `grantRoot` from `src/shared/parents.ts`
- Produces:
  - `AllowRule` = `{ id: number; kind: "folder" | "command"; agent: "claude-code" | "cursor" | "codex" | "gemini" | "hermes" | "*"; value: string; createdAt: number }`
  - `Grant.command: string | null`
  - `validateRule(input: { kind: unknown; agent: unknown; value: unknown }, home: string): { ok: true; kind: AllowRule["kind"]; agent: AllowRule["agent"]; value: string } | { ok: false; error: string }`
  - Check order: kind, agent, blank value, then folder path. `~` alone stores `home` and is accepted.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/rules.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { validateRule } from "../../src/shared/rules";

const home = "/Users/v";

describe("validateRule", () => {
  it("rejects a bad kind before a blank value", () => {
    expect(validateRule({ kind: "nope", agent: "*", value: "  " }, home)).toEqual({ ok: false, error: "Pick a folder or a command." });
  });
  it("rejects an unknown agent", () => {
    expect(validateRule({ kind: "command", agent: "t3-code", value: "npm test" }, home)).toEqual({ ok: false, error: "Pick an agent." });
  });
  it("rejects a blank value", () => {
    expect(validateRule({ kind: "command", agent: "*", value: "  " }, home)).toEqual({ ok: false, error: "Enter a folder path or a command." });
  });
  it("stores a trimmed command and keeps internal spaces", () => {
    expect(validateRule({ kind: "command", agent: "cursor", value: "  npm  test  " }, home)).toEqual({ ok: true, kind: "command", agent: "cursor", value: "npm  test" });
  });
  it("rejects a relative folder and stores an absolute one", () => {
    expect(validateRule({ kind: "folder", agent: "*", value: "proj" }, home)).toEqual({ ok: false, error: "Folder path must be absolute." });
    expect(validateRule({ kind: "folder", agent: "*", value: "~/proj" }, home)).toEqual({ ok: true, kind: "folder", agent: "*", value: "/Users/v/proj" });
  });
  it("rejects / and /Users and accepts home", () => {
    expect(validateRule({ kind: "folder", agent: "*", value: "/" }, home)).toEqual({ ok: false, error: "That folder is too broad." });
    expect(validateRule({ kind: "folder", agent: "*", value: "/Users" }, home)).toEqual({ ok: false, error: "That folder is too broad." });
    expect(validateRule({ kind: "folder", agent: "*", value: "~" }, home)).toEqual({ ok: true, kind: "folder", agent: "*", value: "/Users/v" });
  });
});
```

Add `command: null` to the `Grant` object literals in `tests/unit/decide.test.ts` (`grant()`), `tests/unit/grantView.test.ts` (`grant()`), and the `rulesForGrants` argument in `tests/unit/milestones.test.ts`.

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run tests/unit/rules.test.ts`

Expected: FAIL. Cannot find module `../../src/shared/rules`.

- [ ] **Step 3: Add the types and implement validation**

In `src/shared/types.ts`, add `command: string | null` to `Grant` after `source`. Add:

```ts
export interface AllowRule {
  id: number;
  kind: "folder" | "command";
  agent: "claude-code" | "cursor" | "codex" | "gemini" | "hermes" | "*";
  value: string;
  createdAt: number;
}
```

On `DecideOptions`, add `rules?: AllowRule[]`.

Create `src/shared/rules.ts`:

```ts
import { grantRoot } from "./parents";
import { expandHome, normalise } from "./paths";
import type { AllowRule } from "./types";

function ruleAgent(agent: unknown): AllowRule["agent"] | null {
  if (agent === "*" || agent === "claude-code" || agent === "cursor" || agent === "codex" || agent === "gemini" || agent === "hermes") return agent;
  return null;
}

export function validateRule(
  input: { kind: unknown; agent: unknown; value: unknown },
  home: string,
): { ok: true; kind: AllowRule["kind"]; agent: AllowRule["agent"]; value: string } | { ok: false; error: string } {
  if (input.kind !== "folder" && input.kind !== "command") return { ok: false, error: "Pick a folder or a command." };
  const agent = ruleAgent(input.agent);
  if (!agent) return { ok: false, error: "Pick an agent." };
  const raw = typeof input.value === "string" ? input.value.trim() : "";
  if (!raw) return { ok: false, error: "Enter a folder path or a command." };
  if (input.kind === "command") return { ok: true, kind: "command", agent, value: raw };
  const expanded = expandHome(raw, home);
  if (!expanded.startsWith("/")) return { ok: false, error: "Folder path must be absolute." };
  const value = normalise(expanded, home, home);
  if (grantRoot(value, true, () => true) === null) return { ok: false, error: "That folder is too broad." };
  return { ok: true, kind: "folder", agent, value };
}
```

- [ ] **Step 4: Run the tests**

Run: `pnpm exec vitest run tests/unit/rules.test.ts tests/unit/decide.test.ts tests/unit/grantView.test.ts tests/unit/milestones.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/shared/types.ts src/shared/rules.ts tests/unit/rules.test.ts tests/unit/decide.test.ts tests/unit/grantView.test.ts tests/unit/milestones.test.ts
git commit -m "$(cat <<'EOF'
feat: Validate forever allow rules

EOF
)"
```

---

### Task 2: Grants column and rules table

**Files:**
- Modify: `src/shared/db.ts`
- Test: `tests/unit/grantsDb.test.ts`

**Interfaces:**
- Consumes: `validateRule` from Task 1, `AllowRule`
- Produces:
  - `listRules(db: DatabaseSync): AllowRule[]` ordered by id
  - `createRule(db, input: { kind: unknown; agent: unknown; value: unknown }, home: string, now: number): { rules: AllowRule[]; error: string | null }`
  - `updateRule(db, id: number, input: { kind: unknown; agent: unknown; value: unknown }, home: string, now: number): { rules: AllowRule[]; error: string | null }`
  - `deleteRule(db, id: number): AllowRule[]`
  - `upsertCommandGrant(db, grant: { agent: string; command: string; createdAt: number; expiresAt: number | null }): number`
  - Folder `upsertGrant` matches only `command IS NULL`. Command rows use `path` `""`, access `write`, source `leash`. Expiry merge stays: null wins, otherwise the later expiry. `collapseGrantDupes` key includes `command ?? ""`.

- [ ] **Step 1: Write the failing tests**

Append to `tests/unit/grantsDb.test.ts`:

Merge these names into the existing `../../src/shared/db` import: `createRule`, `deleteRule`, `updateRule`, `upsertCommandGrant`. Add:

```ts
import { DatabaseSync } from "node:sqlite";

describe("command grants", () => {
  it("reads a pre-command database as command null", () => {
    const path = join(mkdtempSync(join(tmpdir(), "al-old-")), "grants.db");
    const raw = new DatabaseSync(path);
    raw.exec("CREATE TABLE grants (id INTEGER PRIMARY KEY, agent TEXT NOT NULL, path TEXT NOT NULL, access TEXT NOT NULL, source TEXT NOT NULL, created_at INTEGER NOT NULL, expires_at INTEGER)");
    raw.prepare("INSERT INTO grants (agent, path, access, source, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?)").run("cursor", "/proj", "write", "leash", 1, null);
    raw.close();
    const db = openGrantsDb(path);
    expect(listGrants(db)[0]).toMatchObject({ path: "/proj", command: null });
    db.close();
  });

  it("keeps a command row off the folder upsert and refreshes its expiry", () => {
    const db = openGrantsDb(join(mkdtempSync(join(tmpdir(), "al-cmd-")), "grants.db"));
    upsertCommandGrant(db, { agent: "cursor", command: "npm test", createdAt: 1, expiresAt: 10 });
    upsertCommandGrant(db, { agent: "cursor", command: "npm test", createdAt: 2, expiresAt: null });
    upsertGrant(db, row("", 5, 3));
    const grants = listGrants(db);
    expect(grants.filter((grant) => grant.command === "npm test")).toEqual([expect.objectContaining({ path: "", expiresAt: null, createdAt: 1 })]);
    expect(grants.filter((grant) => grant.command == null)).toHaveLength(1);
    db.close();
  });

  it("does not collapse two commands that share an empty path", () => {
    const db = openGrantsDb(join(mkdtempSync(join(tmpdir(), "al-cmd-")), "grants.db"));
    upsertCommandGrant(db, { agent: "cursor", command: "npm test", createdAt: 1, expiresAt: 10 });
    upsertCommandGrant(db, { agent: "cursor", command: "npm test --watch", createdAt: 1, expiresAt: 10 });
    collapseGrantDupes(db);
    expect(listGrants(db)).toHaveLength(2);
    db.close();
  });
});

describe("rules", () => {
  it("creates, rejects a duplicate, updates, and deletes", () => {
    const db = openGrantsDb(join(mkdtempSync(join(tmpdir(), "al-rules-")), "grants.db"));
    const home = "/Users/v";
    const created = createRule(db, { kind: "folder", agent: "*", value: "~/proj" }, home, 5);
    expect(created.error).toBeNull();
    expect(created.rules[0]).toMatchObject({ kind: "folder", agent: "*", value: "/Users/v/proj", createdAt: 5 });
    expect(createRule(db, { kind: "folder", agent: "*", value: "/Users/v/proj" }, home, 6).error).toBe("Already in the allow list.");
    const id = created.rules[0]!.id;
    expect(updateRule(db, id, { kind: "command", agent: "cursor", value: "npm test" }, home, 7)).toMatchObject({ error: null, rules: [expect.objectContaining({ kind: "command", value: "npm test", createdAt: 7 })] });
    expect(createRule(db, { kind: "command", agent: "cursor", value: "ls" }, home, 8).error).toBeNull();
    expect(updateRule(db, id, { kind: "command", agent: "cursor", value: "ls" }, home, 9).error).toBe("Already in the allow list.");
    expect(updateRule(db, id, { kind: "command", agent: "cursor", value: "npm test" }, home, 8).error).toBeNull();
    expect(updateRule(db, 99, { kind: "command", agent: "*", value: "ls" }, home, 8)).toMatchObject({ error: "That rule is gone." });
    const left = deleteRule(db, id);
    expect(left.map((rule) => rule.value)).toEqual(["ls"]);
    expect(deleteRule(db, id)).toEqual(left);
    expect(deleteRule(db, left[0]!.id)).toEqual([]);
    db.close();
  });
});
```

Add those imports to the existing import from `../../src/shared/db`. Import `DatabaseSync` from `node:sqlite`.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm exec vitest run tests/unit/grantsDb.test.ts`

Expected: FAIL. `createRule` is not exported.

- [ ] **Step 3: Implement storage**

In the `SCHEMA` string in `src/shared/db.ts`, change the grants table so it ends with `expires_at INTEGER, command TEXT`. After the grants index, add:

```sql
CREATE TABLE IF NOT EXISTS rules (
  id INTEGER PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('folder','command')),
  agent TEXT NOT NULL,
  value TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  UNIQUE (kind, agent, value)
);
```

In `openGrantsDb`, after `db.exec(SCHEMA)`:

```ts
const cols = db.prepare("PRAGMA table_info(grants)").all() as { name: string }[];
if (!cols.some((col) => col.name === "command")) db.exec("ALTER TABLE grants ADD COLUMN command TEXT");
```

Add `command: string | null` to `GrantSql`. In `toGrant`, set `command: row.command ?? null`.

`insertGrant` writes the column. Add optional `command?: string | null` on `GrantWrite`. The SQL is:

```ts
.prepare("INSERT INTO grants (agent, path, access, source, created_at, expires_at, command) VALUES (?, ?, ?, ?, ?, ?, ?)")
.run(grant.agent, grant.path, grant.access, grant.source, grant.createdAt, grant.expiresAt, grant.command ?? null);
```

`upsertGrant` lookup becomes:

```ts
.prepare("SELECT id, created_at, expires_at FROM grants WHERE agent = ? AND path = ? AND access = ? AND source = ? AND command IS NULL ORDER BY id LIMIT 1")
```

`collapseGrantDupes` key:

```ts
const key = `${grant.source}\0${grant.agent}\0${grant.access}\0${grant.path}\0${grant.command ?? ""}`;
```

Add:

```ts
export function upsertCommandGrant(db: DatabaseSync, grant: { agent: string; command: string; createdAt: number; expiresAt: number | null }): number {
  const existing = db
    .prepare("SELECT id, created_at, expires_at FROM grants WHERE agent = ? AND command = ? AND access = 'write' AND source = 'leash' ORDER BY id LIMIT 1")
    .get(grant.agent, grant.command) as { id: number; created_at: number; expires_at: number | null } | undefined;
  if (!existing) {
    return insertGrant(db, { agent: grant.agent, path: "", access: "write", source: "leash", createdAt: grant.createdAt, expiresAt: grant.expiresAt, command: grant.command });
  }
  const expiresAt = existing.expires_at === null || grant.expiresAt === null ? null : Math.max(existing.expires_at, grant.expiresAt);
  if (expiresAt === existing.expires_at) return existing.id;
  db.prepare("UPDATE grants SET created_at = ?, expires_at = ? WHERE id = ?").run(existing.created_at, expiresAt, existing.id);
  return existing.id;
}

function ruleRows(db: DatabaseSync): AllowRule[] {
  const rows = db.prepare("SELECT id, kind, agent, value, created_at FROM rules ORDER BY id").all() as {
    id: number;
    kind: AllowRule["kind"];
    agent: AllowRule["agent"];
    value: string;
    created_at: number;
  }[];
  return rows.map((row) => ({ id: row.id, kind: row.kind, agent: row.agent, value: row.value, createdAt: row.created_at }));
}

export function listRules(db: DatabaseSync): AllowRule[] {
  return ruleRows(db);
}

export function createRule(db: DatabaseSync, input: { kind: unknown; agent: unknown; value: unknown }, home: string, now: number): { rules: AllowRule[]; error: string | null } {
  const parsed = validateRule(input, home);
  if (!parsed.ok) return { rules: ruleRows(db), error: parsed.error };
  if (ruleRows(db).some((rule) => rule.kind === parsed.kind && rule.agent === parsed.agent && rule.value === parsed.value)) {
    return { rules: ruleRows(db), error: "Already in the allow list." };
  }
  db.prepare("INSERT INTO rules (kind, agent, value, created_at) VALUES (?, ?, ?, ?)").run(parsed.kind, parsed.agent, parsed.value, now);
  return { rules: ruleRows(db), error: null };
}

export function updateRule(db: DatabaseSync, id: number, input: { kind: unknown; agent: unknown; value: unknown }, home: string, now: number): { rules: AllowRule[]; error: string | null } {
  const parsed = validateRule(input, home);
  if (!parsed.ok) return { rules: ruleRows(db), error: parsed.error };
  const rows = ruleRows(db);
  if (!rows.some((rule) => rule.id === id)) return { rules: rows, error: "That rule is gone." };
  if (rows.some((rule) => rule.id !== id && rule.kind === parsed.kind && rule.agent === parsed.agent && rule.value === parsed.value)) {
    return { rules: rows, error: "Already in the allow list." };
  }
  db.prepare("UPDATE rules SET kind = ?, agent = ?, value = ?, created_at = ? WHERE id = ?").run(parsed.kind, parsed.agent, parsed.value, now, id);
  return { rules: ruleRows(db), error: null };
}

export function deleteRule(db: DatabaseSync, id: number): AllowRule[] {
  db.prepare("DELETE FROM rules WHERE id = ?").run(id);
  return ruleRows(db);
}
```

Import `validateRule` from `./rules` and `AllowRule` from `./types`.

`upsertCommandGrant` keeps the original `created_at` when expiry changes. The folder upsert updates `created_at`. Command refresh keeps the first approval time so Grants still shows when it was first allowed. The test expects `createdAt: 1` after a forever refresh.

- [ ] **Step 4: Run the tests**

Run: `pnpm exec vitest run tests/unit/grantsDb.test.ts tests/unit/rules.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/shared/db.ts tests/unit/grantsDb.test.ts
git commit -m "$(cat <<'EOF'
feat: Store command grants and allow rules

EOF
)"
```

---

### Task 3: Matching

**Files:**
- Modify: `src/hook/decide.ts`
- Test: `tests/unit/decide.test.ts`

**Interfaces:**
- Consumes: `AllowRule`, `DecideOptions.rules` from Task 1. `Grant.command`.
- Produces: `decide(req, grants, opts)` with this order: lockdown, protected root, exact command (live command grant or command rule), empty paths pass, every path covered by a folder grant (`command` null), a folder rule, or the existing read auto-allow. `opts.rules` defaults to `[]`.

- [ ] **Step 1: Write the failing tests**

Add to `tests/unit/decide.test.ts` inside `describe("decide")`:

```ts
const rule = (over: Partial<AllowRule>): AllowRule => ({ id: 1, kind: "folder", agent: "*", value: "/proj", createdAt: 0, ...over });

it("covers a child of a folder grant", () => {
  expect(decide(req({ paths: ["/a/b/c/d"], access: "write" }), [grant({ path: "/a/b", access: "write" })], opts).kind).toBe("pass");
});

it("passes an exact command grant from another directory and ignores expiry that has passed", () => {
  const command = "cat /etc/hosts";
  const shell = req({ command, paths: ["/elsewhere", "/etc/hosts"], access: "write", cwd: "/elsewhere" });
  expect(decide(shell, [grant({ command, access: "write", path: "" })], opts).kind).toBe("pass");
  expect(decide(shell, [grant({ command, access: "write", path: "", expiresAt: 500 })], opts).kind).toBe("prompt");
  expect(decide(req({ command: "npm test --watch", paths: ["/a/b"], access: "write" }), [grant({ command: "npm test", access: "write", path: "" })], opts).kind).toBe("prompt");
});

it("lets a command rule pass and lets lockdown deny it", () => {
  const shell = req({ command: "npm test", paths: ["/etc/hosts"], access: "write" });
  const rules = [rule({ kind: "command", value: "npm test", agent: "cursor" })];
  expect(decide(shell, [], { ...opts, rules }).kind).toBe("pass");
  expect(decide(shell, [], { ...opts, rules, lockdown: true }).kind).toBe("deny");
});

it("lets a folder rule cover a child read and ignores a command grant path", () => {
  expect(decide(req({ paths: ["/proj/sub/a"], access: "read" }), [], { ...opts, rules: [rule({ value: "/proj" })] }).kind).toBe("pass");
  expect(decide(req({ agent: "claude-code", paths: ["/proj/a"], access: "write" }), [], { ...opts, rules: [rule({ agent: "cursor", value: "/proj" })] }).kind).toBe("prompt");
  expect(decide(req({ agent: "claude-code", paths: ["/proj/a"], access: "write" }), [], { ...opts, rules: [rule({ agent: "*", value: "/proj" })] }).kind).toBe("pass");
  expect(decide(req({ paths: ["/secret-file"], access: "read" }), [grant({ command: "npm test", path: "", access: "write" })], opts).kind).toBe("prompt");
});
```

Import `AllowRule` from `../../src/shared/types`.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm exec vitest run tests/unit/decide.test.ts`

Expected: FAIL. The child-path case may already pass. The command and rule cases fail with `prompt` or by ignoring `opts.rules`.

- [ ] **Step 3: Implement matching**

Replace `decide` in `src/hook/decide.ts` with:

```ts
export function decide(req: HookRequest, grants: Grant[], opts: DecideOptions): Verdict {
  if (opts.lockdown) return { kind: "deny", reason: "Agentic Leash lockdown is on" };
  if (req.paths.some((path) => opts.protectedRoots.some((root) => isUnder(path, root)))) {
    return { kind: "deny", reason: "Agentic Leash protects its own files" };
  }
  const rules = opts.rules ?? [];
  const live = grants.filter((grant) => (grant.agent === "*" || grant.agent === req.agent) && (grant.expiresAt === null || grant.expiresAt > opts.now));
  const command = req.command?.trim() ?? "";
  const sameAgent = (agent: string) => agent === "*" || agent === req.agent;
  if (command && (live.some((grant) => grant.command != null && grant.command.trim() === command && sameAgent(grant.agent)) || rules.some((rule) => rule.kind === "command" && sameAgent(rule.agent) && rule.value.trim() === command))) {
    return { kind: "pass" };
  }
  if (req.paths.length === 0) return { kind: "pass" };
  const covered = req.paths.every((path) => {
    if (live.some((grant) => grant.command == null && isUnder(path, grant.path) && (grant.access === "write" || req.access === "read"))) return true;
    if (rules.some((rule) => rule.kind === "folder" && sameAgent(rule.agent) && isUnder(path, rule.value))) return true;
    return req.access === "read" && !isSensitive(path, opts.home) && autoAllowCovers(req.agent, path, opts.autoAllowOff ?? []);
  });
  return covered ? { kind: "pass" } : { kind: "prompt" };
}
```

- [ ] **Step 4: Run the tests**

Run: `pnpm exec vitest run tests/unit/decide.test.ts tests/unit/autoAllow.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/hook/decide.ts tests/unit/decide.test.ts
git commit -m "$(cat <<'EOF'
feat: Match child folders and exact commands

EOF
)"
```

---

### Task 4: Claude folder rules

**Files:**
- Modify: `src/main/rulesMode.ts`
- Modify: `tests/unit/milestones.test.ts`

**Interfaces:**
- Consumes: `listRules` from Task 2, `AllowRule`
- Produces: `rulesForGrants(grants: Grant[], rules: AllowRule[], lockdown: boolean, home: string): LeashRules`. `publishClaudeRules` keeps its signature and passes `listRules(db)`. `migratedRules(prev, next, live, rules, lockdown, home, previous)` passes `rules` through. Folder rules for `claude-code` or `*` are added. Command rules and other agents are left out. Command grants are left out because their path is `""`.

- [ ] **Step 1: Write the failing test**

In `tests/unit/milestones.test.ts`, update the existing `rulesForGrants` call to pass `[]` as the second argument. Add:

```ts
it("publishes Claude and Global folder rules and skips commands and other agents", () => {
  const grants = [{ id: 1, agent: "claude-code" as const, path: "/Users/me/Desktop", access: "write" as const, source: "leash" as const, createdAt: 0, expiresAt: null, command: null }];
  const rules = [
    { id: 1, kind: "folder" as const, agent: "claude-code" as const, value: "/Users/me/src", createdAt: 0 },
    { id: 2, kind: "folder" as const, agent: "*" as const, value: "/Users/me/shared", createdAt: 0 },
    { id: 3, kind: "folder" as const, agent: "cursor" as const, value: "/Users/me/cursor", createdAt: 0 },
    { id: 4, kind: "command" as const, agent: "claude-code" as const, value: "npm test", createdAt: 0 },
  ];
  const next = rulesForGrants(grants, rules, false, "/Users/me");
  expect(next.additionalDirectories).toEqual(["/Users/me/Desktop", "/Users/me/src", "/Users/me/shared"]);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run tests/unit/milestones.test.ts`

Expected: FAIL. `rulesForGrants` does not take rules, or the directories are missing.

- [ ] **Step 3: Publish folder rules**

Change `rulesForGrants` to:

```ts
export function rulesForGrants(grants: Grant[], rules: AllowRule[], lockdown: boolean, home: string): LeashRules {
  const fromGrants = grants
    .filter((grant) => grant.source === "leash" && grant.command == null && (grant.agent === "claude-code" || grant.agent === "*"))
    .map((grant) => normalise(grant.path, home, home));
  const fromRules = rules
    .filter((rule) => rule.kind === "folder" && (rule.agent === "claude-code" || rule.agent === "*"))
    .map((rule) => normalise(rule.value, home, home));
  const deny = [...SENSITIVE_DENY];
  if (lockdown) deny.push(...LOCKDOWN_DENY);
  return { additionalDirectories: [...new Set([...fromGrants, ...fromRules])], deny };
}
```

Import `AllowRule`. In `publishClaudeRules`:

```ts
const next = rulesMode ? rulesForGrants(live, listRules(db), getSetting(db, "lockdown", "0") === "1", home) : { additionalDirectories: [] as string[], deny: [] as string[] };
```

Import `listRules` from `../shared/db`. Change `migratedRules` to take `rules: AllowRule[]` after `live`, and pass `rules` into each `rulesForGrants` call.

- [ ] **Step 4: Run the tests**

Run: `pnpm exec vitest run tests/unit/milestones.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/main/rulesMode.ts tests/unit/milestones.test.ts
git commit -m "$(cat <<'EOF'
feat: Publish forever Claude folder rules

EOF
)"
```

---

### Task 5: Hook and runtime wiring

**Files:**
- Modify: `src/hook/handle.ts`
- Modify: `src/hook/normalise.ts` (keep the working-tree behavior)
- Modify: `src/main/runtime.ts`
- Modify: `src/shared/bridge.ts`
- Modify: `src/preload/index.ts`
- Test: `tests/unit/hook.test.ts`

**Interfaces:**
- Consumes: `listRules`, `createRule`, `updateRule`, `deleteRule`, `upsertCommandGrant`, `decide` with `opts.rules`
- Produces bridge methods:
  - `listRules(): Promise<AllowRule[]>`
  - `createRule(input: { kind: AllowRule["kind"]; agent: AllowRule["agent"]; value: string }): Promise<{ rules: AllowRule[]; error: string | null }>`
  - `updateRule(id: number, input: { kind: AllowRule["kind"]; agent: AllowRule["agent"]; value: string }): Promise<{ rules: AllowRule[]; error: string | null }>`
  - `deleteRule(id: number): Promise<AllowRule[]>`
  - IPC: `rules:list`, `rules:create`, `rules:update`, `rules:delete`
  - On allow, a trimmed non-empty `request.command` upserts a command grant with the same TTL as the folder grant. Blank command writes the folder grant only. Successful rule writes call `publishClaudeRules`. `releaseCovered` passes `rules: listRules(db)`.

- [ ] **Step 1: Confirm the Cursor shell tests exist**

`tests/unit/hook.test.ts` already contains `uses the cursor workspace root when cwd is empty` and `gates cursor shell once, at beforeShellExecution`. Leave them. They assert paths `["/w/a", "/w/a/b"]` and `permission: "allow"` for an ignored `preToolUse` Shell.

- [ ] **Step 2: Pass rules through the hook**

In `src/hook/handle.ts`, import `listRules` beside `listGrants`. The `decide` options include `rules: listRules(options.db)`.

Keep the working-tree `normalise.ts` behavior:

- `cwd` is `str(payload.cwd) || str(input.cwd) || (Array.isArray(payload.workspace_roots) ? str(payload.workspace_roots[0]) : "") || "/"`
- `preToolUse` + tool `Shell` for Cursor returns `{ kind: "ignore" }`
- `handlePayload` turns `ignore` into `respond(options.entry, { kind: "pass" })`

- [ ] **Step 3: Save the command and expose rules**

In `src/main/runtime.ts` `approval:decide`, compute the TTL once:

```ts
const ttl = ttlSeconds === undefined ? DEFAULT_TTL_S : ttlSeconds;
if (decision === "allow" && pending) {
  const scope = typeof scopePath === "string" && parentFolders(pending.request.paths).includes(scopePath) ? scopePath : undefined;
  allow(scope ? [scope] : pending.request.paths, pending.request.agent, pending.request.access, ttl, Boolean(scope));
  const command = pending.request.command?.trim() ?? "";
  if (command) {
    upsertCommandGrant(db, {
      agent: pending.request.agent,
      command,
      createdAt: Date.now(),
      expiresAt: ttl === null ? null : Date.now() + ttl * 1000,
    });
  }
}
```

`releaseCovered` options include `rules: listRules(db)`.

Add handlers next to the auto-allow handlers. `publishRules` is the same `publishClaudeRules(db, join(claudeRoot(), "settings.json"), home, snapshots.find((snapshot) => snapshot.id === "claude-code")?.enforcement === "rules")` call already used after `allow()`.

```ts
ipcMain.handle("rules:list", () => listRules(db));
ipcMain.handle("rules:create", (_event, input: { kind: unknown; agent: unknown; value: unknown }) => {
  const result = createRule(db, input, home, Date.now());
  if (!result.error) publishClaudeRules(db, join(claudeRoot(), "settings.json"), home, snapshots.find((snapshot) => snapshot.id === "claude-code")?.enforcement === "rules");
  return result;
});
ipcMain.handle("rules:update", (_event, id: number, input: { kind: unknown; agent: unknown; value: unknown }) => {
  const result = updateRule(db, id, input, home, Date.now());
  if (!result.error) publishClaudeRules(db, join(claudeRoot(), "settings.json"), home, snapshots.find((snapshot) => snapshot.id === "claude-code")?.enforcement === "rules");
  return result;
});
ipcMain.handle("rules:delete", (_event, id: number) => {
  const rules = deleteRule(db, id);
  publishClaudeRules(db, join(claudeRoot(), "settings.json"), home, snapshots.find((snapshot) => snapshot.id === "claude-code")?.enforcement === "rules");
  return rules;
});
```

Import `createRule`, `deleteRule`, `listRules`, `updateRule`, `upsertCommandGrant` from `../shared/db`.

On `LeashBridge` in `src/shared/bridge.ts`, import `AllowRule` and add the four methods from the Interfaces block. In `src/preload/index.ts`:

```ts
listRules: () => ipcRenderer.invoke("rules:list"),
createRule: (input) => ipcRenderer.invoke("rules:create", input),
updateRule: (id, input) => ipcRenderer.invoke("rules:update", id, input),
deleteRule: (id) => ipcRenderer.invoke("rules:delete", id),
```

- [ ] **Step 4: Run the tests**

Run: `pnpm exec vitest run tests/unit/hook.test.ts tests/unit/decide.test.ts && pnpm typecheck`

Expected: PASS. Typecheck exits 0.

- [ ] **Step 5: Commit**

```bash
git add src/hook/handle.ts src/hook/normalise.ts src/main/runtime.ts src/shared/bridge.ts src/preload/index.ts tests/unit/hook.test.ts
git commit -m "$(cat <<'EOF'
feat: Apply allow rules in the hook and popup

EOF
)"
```

---

### Task 6: Grants commands and Settings allow list

**Files:**
- Modify: `src/renderer/src/routes/grants.tsx`
- Modify: `src/renderer/src/routes/settings.tsx`
- Modify: `src/renderer/src/nav.ts`
- Modify: `tests/e2e/navigation.e2e.ts`

**Interfaces:**
- Consumes: `window.leash.listRules`, `createRule`, `updateRule`, `deleteRule`. `Grant.command`. `AGENT_NAV` ids. `AllowRule`.
- Produces: Settings route `/settings/allow-list` labeled `Allow list`, placed after Agents. Grants shows a Commands section for rows with `command != null`. Folder rows are `command == null`. One agent filter and one Approved/Expires sort drive both lists. An empty kind is omitted. When both filtered lists are empty, the page says `No grants for {agent}`. The allow-list form is one form: kind radiogroup default Folder, value field, agent select default Global, Add. Edit loads the row and shows Save and Cancel. Delete uses `ConfirmAction` with effect `The next matching request opens the approval popup.` Empty copy: `Nothing is allowed forever yet.` The IPC error renders under the fields and the typed values stay.

- [ ] **Step 1: Add the nav link the e2e already walks**

In `tests/e2e/navigation.e2e.ts`, change `SECTIONS` to:

```ts
const SECTIONS = ["General", "Agents", "Allow list", "Monitoring", "Appearance", "Keybindings", "Diagnostics", "Licenses"];
```

In `src/renderer/src/nav.ts`, import `ListChecks` from `lucide-react`. Insert after Agents:

```ts
{ id: "allow-list", label: "Allow list", icon: ListChecks },
```

- [ ] **Step 2: Split the Grants lists**

In `src/renderer/src/routes/grants.tsx`, import `SquareTerminal` from `lucide-react`. Change `GrantList` so it still builds the agent chips and the sort control from every grant. Then:

```ts
const folders = viewGrants(grants.filter((grant) => grant.command == null), { agent, sort, dir });
const commands = viewGrants(grants.filter((grant) => grant.command != null), { agent, sort, dir });
```

Render the folder `SettingsSection` only when `folders.length > 0`. Render a second section titled `Commands` only when `commands.length > 0`. A command row uses `SquareTerminal`, shows `grant.command` in the mono line, and the same agent, access, approved time, expiry, source, and Revoke controls as a folder row. When both arrays are empty, render `<p className="px-4 py-4 text-sm text-muted-foreground">No grants for {agentName(agent)}.</p>`.

The page empty state stays `grants.length === 0`. Revoke all still uses `grants.length`, which includes command grants.

- [ ] **Step 3: Build the Allow list page**

In `src/renderer/src/routes/settings.tsx`, add `AllowList` and render it when `entry.id === "allow-list"`, before the agents branch.

```tsx
import { useState } from "react";
import type { AllowRule } from "../../../shared/types";
import { AGENT_NAV } from "~/nav";

const AGENTS = [{ id: "*", label: "Global" }, ...AGENT_NAV.map((agent) => ({ id: agent.id, label: agent.label }))] as const;

function AllowList() {
  const [rules, setRules] = useState<AllowRule[]>([]);
  const [kind, setKind] = useState<AllowRule["kind"]>("folder");
  const [value, setValue] = useState("");
  const [agent, setAgent] = useState<AllowRule["agent"]>("*");
  const [editing, setEditing] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    void window.leash.listRules().then(setRules);
  }, []);
  const reset = () => {
    setKind("folder");
    setValue("");
    setAgent("*");
    setEditing(null);
    setError(null);
  };
  const apply = (result: { rules: AllowRule[]; error: string | null }) => {
    setRules(result.rules);
    if (result.error) setError(result.error);
    else reset();
  };
  const save = () => {
    const input = { kind, agent, value };
    if (editing === null) void window.leash.createRule(input).then(apply);
    else void window.leash.updateRule(editing, input).then(apply);
  };
  return (
    <div className="space-y-6">
      <SettingsSection title={editing === null ? "Add" : "Edit"}>
        <div className="space-y-3 px-4 py-3">
          <div role="radiogroup" aria-label="Kind" className="inline-flex rounded-lg border border-border p-0.5">
            {(["folder", "command"] as const).map((item) => (
              <button key={item} type="button" role="radio" aria-checked={kind === item} onClick={() => setKind(item)} className={cn("rounded-md px-2.5 py-1 text-xs capitalize", kind === item ? "bg-accent font-medium" : "text-muted-foreground")}>
                {item}
              </button>
            ))}
          </div>
          <label className="block space-y-1 text-xs text-muted-foreground">
            {kind === "folder" ? "Folder path" : "Command"}
            <input aria-label={kind === "folder" ? "Folder path" : "Command"} className="h-8 w-full rounded-lg border border-border bg-background/60 px-2 font-mono text-sm text-foreground" value={value} onChange={(event) => setValue(event.target.value)} />
          </label>
          <label className="block space-y-1 text-xs text-muted-foreground">
            Agent
            <select aria-label="Agent" className="h-8 w-full rounded-lg border border-border bg-background px-2 text-sm text-foreground" value={agent} onChange={(event) => setAgent(event.target.value as AllowRule["agent"])}>
              {AGENTS.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
            </select>
          </label>
          {error ? <p className="text-xs text-destructive">{error}</p> : null}
          <div className="flex gap-2">
            <Button size="sm" onClick={save}>{editing === null ? "Add" : "Save"}</Button>
            {editing !== null ? <Button size="sm" variant="outline" onClick={reset}>Cancel</Button> : null}
          </div>
        </div>
      </SettingsSection>
      <SettingsSection title="Forever">
        {rules.length === 0 ? <p className="px-4 py-4 text-sm text-muted-foreground">Nothing is allowed forever yet.</p> : null}
        {rules.map((rule) => (
          <div key={rule.id} className="flex items-center gap-3 px-4 py-3 text-sm">
            <div className="min-w-0 flex-1 space-y-1">
              <div className="text-xs capitalize text-muted-foreground">{rule.kind}</div>
              <div className="overflow-x-auto font-mono text-xs font-medium whitespace-nowrap">{rule.value}</div>
              <div className="text-xs text-muted-foreground">{AGENTS.find((item) => item.id === rule.agent)?.label ?? rule.agent}</div>
            </div>
            <Button size="sm" variant="outline" onClick={() => { setEditing(rule.id); setKind(rule.kind); setValue(rule.value); setAgent(rule.agent); setError(null); }}>Edit</Button>
            <ConfirmAction
              trigger={<Button size="sm" variant="destructive-outline">Delete</Button>}
              title="Delete this allow rule?"
              description={rule.value}
              effects={["The next matching request opens the approval popup."]}
              confirmLabel="Delete"
              onConfirm={() => void window.leash.deleteRule(rule.id).then((next) => { setRules(next); if (editing === rule.id) reset(); })}
            />
          </div>
        ))}
      </SettingsSection>
    </div>
  );
}
```

`settings.tsx` already imports `useEffect`, `ConfirmAction`, `Button`, `cn`, and `AGENT_LABELS`. Add the `AllowRule` import and `AGENT_NAV` import. `useState` is already imported.

In `SettingsPage`, the chain becomes `entry.id === "allow-list" ? <AllowList /> : entry.id === "agents" ? ...`.

- [ ] **Step 4: Typecheck**

Run: `pnpm typecheck && pnpm exec vitest run tests/unit/rules.test.ts tests/unit/grantsDb.test.ts tests/unit/decide.test.ts tests/unit/milestones.test.ts tests/unit/hook.test.ts tests/unit/autoAllow.test.ts`

Expected: typecheck exits 0 and the unit tests PASS. `tests/e2e/navigation.e2e.ts` now requires the Allow list link. Run `pnpm test:e2e` only if the app build is already part of this pass. The spec does not add a new settings e2e case.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/nav.ts src/renderer/src/routes/settings.tsx src/renderer/src/routes/grants.tsx tests/e2e/navigation.e2e.ts
git commit -m "$(cat <<'EOF'
feat: Show command grants and the allow list

EOF
)"
```
