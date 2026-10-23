# Allow list and command grants

Approved in chat on 2026-10-21. This file is the spec.

## Problem

A folder grant already covers child paths through `isUnder`. Two gaps remain.

Cursor sends `cwd: ""` for the workspace root. The hook then records the shell as `/`, so a grant on the project does not match, and the popup asks again for a folder inside that project.

Shell approvals are stored as folder paths only. Grants has no command list. Settings can toggle built-in skill-folder reads. It cannot add a folder or a shell command that should pass forever.

## Locked decisions

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

## Storage

Two stores. `decide()` reads both.

### Command column on `grants`

`openGrantsDb` adds `command TEXT` when `pragma table_info(grants)` has no `command` column.

`Grant.command` is `string | null`. Null means a folder grant. A non-null value means a command grant.

Command grants store `path` as `""`, `access` as `write`, and `source` as `leash`. Folder matching ignores rows whose `command` is non-null. The empty path must not become a folder grant.

Folder upsert looks up `agent + path + access + source` and `command IS NULL`. Command upsert looks up `agent + command + access + source`. Expiry merge stays as it is today: null wins, otherwise the later expiry. `collapseGrantDupes` includes `command` in its key so two command rows with `path ""` stay distinct.

### `rules` table

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

No expiry, no access column, no source column. A row is forever and write-level.

```ts
interface AllowRule {
  id: number;
  kind: "folder" | "command";
  agent: AgentId | "*";
  value: string;
  createdAt: number;
}
```

`AgentId` values accepted here are `claude-code`, `cursor`, `codex`, `gemini`, and `hermes`. `t3-code` is not in the menu.

## Matching

`decide(req, grants, opts)` gains `opts.rules: AllowRule[]`, default `[]`. Existing callers keep working. `handlePayload` and `releaseCovered` pass `listRules(db)`.

Order:

1. Lockdown denies with the current reason.
2. A path under a protected root denies with the current reason. A forever rule on that path still denies.
3. Exact command match passes. Compare `req.command.trim()` to the stored command. Trim the ends only. The match is case-sensitive. Internal spaces stay. A live command grant matches when `command` is non-null, the agent is `*` or `req.agent`, and `expiresAt` is null or in the future. A forever command rule matches the same way with no expiry. The working directory is ignored. Paths outside a folder grant are ignored for this step.
4. `paths.length === 0` passes, same as today.
5. Every path must be covered. A path is covered when a live folder grant (`command` null) or a forever folder rule has agent `*` or `req.agent` and `isUnder(path, root)`, and the grant access is `write` or the request access is `read`. A forever folder rule counts as write. The existing read auto-allow for skill folders still applies on this step.
6. Otherwise prompt.

`coveredPending` uses `decide`, so a new folder grant, command grant, or rule releases a waiting popup that is now covered.

## Popup allow

`approval:decide` on allow still writes folder grants through `allow()`. The parent-folder chip still sets the folder scope.

When `pending.request.command.trim()` is non-empty, also upsert one command grant for that agent, that trimmed command, access `write`, source `leash`, and the same TTL. Popup "Always" stores `expiresAt` null on that Grants row.

A blank command writes the folder grant only.

Deny writes nothing.

## Grants page

Split `listGrants()` into folder rows (`command` null) and command rows (`command` non-null).

One agent filter and one sort (Approved / Expires, same directions as today) apply to both lists. Each list is passed through `viewGrants`.

The folder list stays as it is. The command list is a second section, "Commands", under it. Each row shows a terminal icon, the command in mono, the agent, the approved time, the expiry, and Revoke. Revoke calls `revokeGrant(id)`.

When both lists are empty and nothing is pending, the page keeps the current empty state. When only one list has rows, that list shows and the other is omitted. Revoke all stays disabled when `listGrants()` is empty. Its count includes command grants and popup Always grants. It excludes rules. The confirm copy counts those grants. Rules are not in the count.

## Settings → Allow list

Add `{ id: "allow-list", label: "Allow list" }` to `SETTINGS_SECTIONS` after Agents. Route `/settings/allow-list` renders on `SettingsPage`.

One form at the top:

- Kind: Folder or Command, default Folder. A radiogroup.
- Value: one text field. Label "Folder path" or "Command".
- Agent: a select, default Global. Options are Global plus the five agents above.
- Add saves a new row. While a row is being edited, the same form shows Save and Cancel, and Add is hidden.

The list is a `SettingsSection` titled "Forever". Each row shows the kind, the full value in mono, the agent, Edit, and Delete. Delete uses `ConfirmAction`. The description tells the user the next matching request opens the approval popup.

Empty list copy: "Nothing is allowed forever yet."

The form shows the IPC error under the fields. Saving keeps the form values when the error is set.

## Validation

`validateRule(input, home)` is shared by create and update. Tests pass `home` in. The main process checks. The renderer shows the returned error. `~` alone normalises to `home` and is accepted. `/Users/<name>` is accepted.

| Input | Error |
| --- | --- |
| Blank value after trim | Enter a folder path or a command. |
| Kind other than `folder` or `command` | Pick a folder or a command. |
| Agent outside Global and the five agents | Pick an agent. |
| Folder that is relative after `~` expansion | Folder path must be absolute. |
| Folder that `grantRoot` would reject (`/` or `/Users`) | That folder is too broad. |
| Same kind, agent, and value already stored on a different id | Already in the allow list. |

Folder values are stored with `normalise`, so `~/proj` becomes an absolute path. The last path segment is kept. The app does not stat the path and does not turn a file path into its parent.

Command values are stored trimmed. `npm test` and `npm test --watch` are different rows. `npm  test` (two spaces) is a different row from `npm test`.

Update validates the same way. A collision with another id returns "Already in the allow list." Delete of a missing id does nothing.

## IPC

| Channel | Behavior |
| --- | --- |
| `rules:list` | Returns `AllowRule[]` ordered by id. |
| `rules:create` | Body `{ kind, agent, value }`. On success returns `{ rules, error: null }`. On failure returns `{ rules, error }` and writes nothing. |
| `rules:update` | Body `{ id, kind, agent, value }`. Same return shape. Unknown id returns `{ rules, error: "That rule is gone." }` and writes nothing. |
| `rules:delete` | Body `id`. Returns the list. |

Create, update, and delete call `publishClaudeRules` after a successful write.

Bridge methods: `listRules`, `createRule`, `updateRule`, `deleteRule`.

## Claude rules mode

`rulesForGrants(grants, rules, lockdown, home)` also adds forever folder rules whose agent is `claude-code` or `*`. Command rules are left out. Command grants are left out. Cursor-only, Codex-only, Gemini-only, and Hermes-only folder rules are left out. `publishClaudeRules` and `migratedRules` pass `listRules(db)`.

Hook enforcement is what makes command rows pass. Claude's `additionalDirectories` cannot express an exact command.

## Cursor shell

Already started in the working tree. Keep it.

- Empty `cwd` falls through `tool_input.cwd`, then `workspace_roots[0]`, then `/`.
- `preToolUse` + tool `Shell` normalises to `ignore`.
- An ignored hook responds with pass, so the duplicate Shell event does not block. `beforeShellExecution` is the gate.

## Tests

Unit tests, in the existing Vitest files plus one rules file:

- A child path passes under a parent folder grant.
- `cat /etc/hosts` inside a granted folder still prompts.
- A live command grant for `cat /etc/hosts` passes, including from another working directory.
- An expired command grant prompts.
- `npm test` does not cover `npm test --watch`.
- Lockdown denies a forever command rule. With lockdown off, that rule passes.
- A forever folder rule covers a child path and a read of that child.
- A cursor folder rule does not cover Claude. A Global folder rule does.
- A command grant with `path ""` does not cover a folder read.
- Validation errors for blank, relative, `/`, `/Users`, and a duplicate.
- `rulesForGrants` includes a Claude folder rule and a Global folder rule, and skips a command rule and a Cursor folder rule.
- Empty Cursor `cwd` plus `workspace_roots: ["/w/a"]` yields paths `["/w/a", "/w/a/b"]` for `ls /w/a/b`.
- Opening a db created without `command` still lists old grants with `command: null`.
- Existing `Grant` literals in unit tests set `command: null`.

`tests/e2e/settings.e2e.ts` keeps passing. It does not need a new case.

## Out of scope

- OS process exec rows in History.
- Command prefixes, globs, or argv matching.
- A working-directory limit on command rules.
- A read/write choice on forever rows.
- Copying popup "Always" into Settings.
- `t3-code` in the allow-list agent menu.
- Editing the built-in skill toggles into this list.

## Files

- `src/shared/types.ts` — `Grant.command`, `AllowRule`
- `src/shared/db.ts` — column, `rules` table, upsert split, `collapseGrantDupes`
- `src/shared/rules.ts` — `validateRule`
- `src/hook/decide.ts` — match order
- `src/hook/handle.ts` — pass rules; ignored hook returns pass
- `src/hook/normalise.ts` — empty cwd; ignore duplicate Cursor Shell
- `src/main/runtime.ts` — command upsert on allow; rules IPC; pass rules into `releaseCovered`
- `src/main/rulesMode.ts` — publish folder rules for Claude and Global
- `src/shared/bridge.ts`, `src/preload/index.ts` — four rule methods
- `src/renderer/src/nav.ts`, `src/renderer/src/routes/settings.tsx` — Allow list page
- `src/renderer/src/routes/grants.tsx` — Commands section
- `tests/unit/decide.test.ts`, `tests/unit/hook.test.ts`, `tests/unit/rules.test.ts`, rules-mode unit coverage
