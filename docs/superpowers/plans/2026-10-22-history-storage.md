# History storage, size cap and clean uninstall Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show history and data usage in Settings, let the user force a cleanup, cap history with a user-set size (default 10 GB, minimum 1 GB) that is pruned automatically once it reaches half the cap (reads go first, oldest first at the limit), warn the user as it fills, and make uninstall a full clean slate.

**Architecture:** The helper (root) owns `history.db`, so automatic pruning runs in the helper on its existing 60 s prune tick. The helper reads the cap from `grants.db`, the same way it reads retention days. It measures *used* bytes (live pages + WAL) and, at 50% of the cap or more, deletes rows in a fixed priority order with per-category floors. Then it writes a stats row into `meta`. The app reads `meta` and file sizes read-only for the Storage section. Manual cleanup reuses the admin-prompt path that Optimize already uses: stop helper → `leash-helper --purge <mode>` → rebuild → restart. Uninstall removes everything the app created, including every `.bak`.

**Tech Stack:** TypeScript, Electron, `node:sqlite` `DatabaseSync`, Vitest, Playwright, React, existing Settings components.

## What exists today (verified in code)

- `eventBucket` (`src/shared/noise.ts`) already drops new `exec` events at insert, and Optimize already strips old `exec` rows. Any `exec` rows left are from before 679a32a.
- Reads are stored in two places:
  - **Project reads** are reads of folders, project paths and critical files. They go to the `events` table, and critical files are marked `sensitive = 1`.
  - **Scratch reads** are reads under temp, logs and cache paths (`/tmp`, `/Library/Logs`, `.cache`, ...). They go to the `noise` table or are dropped.
  - Reads collapse to one row per minute per path.
- Pruning is day-based only (`pruneHistory`, 90/30 days). There's no size limit.
- `DELETE` does not shrink a SQLite file. Freed pages are reused, but the file only gets smaller after a rebuild.
- `helper.log` is never rotated.
- In the packaged mac app, uninstall already does these things:
  - removes `/Library/Application Support/AgenticLeash`, which holds `history.db`, `-wal`, `-shm` and `helper.log`
  - removes hooks for all 5 agents and the Claude rules
  - removes the sweep and login LaunchAgents
  - removes `~/.agentic-leash` and `userData`
- Uninstall leaves these behind:
  - the `.bak` files that `writeWithBackup` writes, including new ones the uninstall itself writes when it strips hooks
  - `~/.hermes/agent-hooks/`
  - Electron's own `~/Library` files
  - in dev runs, the `AGENTIC_LEASH_HISTORY_DIR` history

## Global Constraints

- **Cap.** Setting `history_cap_gb` in `grants.db`. It's a whole number of GB: default `10`, min `1`, max `1024`. The helper falls back to 10 if the value is missing or invalid. If a value is out of range, the UI leaves it unchanged, the same way `DayField` does.
- **Usage.** Usage is `(page_count - freelist_count) * page_size + size(-wal)`, not file size, so pruning works before a rebuild.
- **Trigger.** A pruning pass starts when usage reaches 50% of the cap. It stops as soon as usage is below 45%. Day retention (90/30) still runs on every tick regardless of size.
- **Category floors.** Normal pruning never deletes these:

  | Rows | Kept for at least |
  |---|---|
  | Scratch reads (`noise` table, `kind = 'read'`) | the last 1 day |
  | Project reads (`events` table, `kind = 'read'`, any `sensitive`) | the last 7 days |
  | Sensitive non-read rows (writes etc. to critical files) | always |

- **Deletion order** while usage is at least 50% of the cap. Each step deletes oldest first, in batches of 5 000 ids per transaction, rechecking usage between batches. It moves to the next step only when the current step has nothing left to delete.
  1. Scratch reads older than 1 day.
  2. Non-sensitive project reads older than 7 days.
  3. Sensitive project reads older than 7 days.
  4. Every `exec` row in both tables.
  5. Other non-sensitive `noise` rows (scratch writes, creates, deletes, renames).
  6. Other non-sensitive `events` rows (project writes, creates, deletes, renames, net).
- **Hard cap.** If steps 1–6 leave usage at or above 100% of the cap, the floors no longer apply. The helper deletes the oldest rows of any kind, from either table and sensitive or not, strictly oldest first, until usage is below 90%. History never stays over the cap. The helper sets `hardCap = true` in stats when this happens, and clears it on the first tick where usage is below 90% without a hard-cap pass.
- **Warnings.**
  - **Steps.** The warning step is `floor(percent / 10) * 10` for 50–90%, and 100 when `hardCap` is set or usage is at or above 100%.
  - **50–90%.** These banners can be closed. Closing one stores the step in `ui-state.json` as `storageWarningDismissed`. A step at or below the stored value isn't shown again.
  - **Re-arming.** When usage falls 10 points below a dismissed step, the stored value drops to `floor((percent + 10) / 10) * 10`. This keeps the 50% warning from coming back while the pruner holds usage at 45–50%. It still shows again if usage falls under 40% and climbs back.
  - **100%.** This banner can't be closed. It stays until the condition clears.
  - **When 60–90% shows.** Pruning normally holds usage near 45–50%, so the 60–90% warnings only appear when protected reads and sensitive rows fill the space faster than pruning can free it.
- **Insert path.** It's unchanged: new reads keep being recorded.
- **Disk space.** New and rebuilt DBs use `PRAGMA auto_vacuum = INCREMENTAL`. After a pass that deleted rows, the helper runs `PRAGMA incremental_vacuum` and `wal_checkpoint(TRUNCATE)` so the file shrinks. Existing DBs switch over on their next Compact or Clean up rebuild.
- **Admin password.** Force cleanup always asks for it, the same as Optimize. Don't add a user-writable trigger file the helper obeys.
- **Cap setting exposure.** The cap setting has the same exposure as today's retention days. `grants.db` lives in `~/.agentic-leash`, which hooks already protect as a protected root.
- **Log rotation.** `helper.log` rotates at 10 MB to `helper.log.1`.
- **Uninstall is a full clean slate.** Every file or directory the app created is removed, including every `.bak` at a path the app backs up, whoever wrote it.
- **Repo conventions.** No new dependency. No new code comments. Commit subjects are one line, no body (`feat: ...`).
- **Out of scope.** Per-agent quotas, exporting history before cleanup, Windows/Linux helper paths, a UI to manage the deletion policy (see Future work).

## File map

- `src/shared/storage.ts` (create): cap bounds, `parseCapGb`, `capBytes`, `HistoryStats`, `formatBytes` (moved from settings.tsx)
- `src/helper/historyDb.ts`: `auto_vacuum`, `kind` indexes, `historyUsage`, `pruneBySize`, `purgeHistory`, `writeHistoryStats`, `readHistoryStats`
- `src/helper/leash-helper.ts`: read cap, size prune on the tick, stats, log rotation, `--purge` CLI
- `src/main/helperInstall.ts`: generalise `helperOptimizeCommand` to `helperMaintenanceCommand(args)`
- `src/main/backup.ts`: `backupTargets(home, claudeRoot)`, the single list of files `writeWithBackup` touches
- `src/main/uninstall.ts` (create): `uninstallLeftovers(...)` path list + `removeLeftovers`
- `src/main/runtime.ts`: `history:cap:get/set`, `history:storage:info`, `history:purge:run`, uninstall leftovers
- `src/main/uiState.ts`: `storageWarningDismissed`
- `src/shared/bridge.ts`, `src/preload/index.ts`: `historyCap()`, `setHistoryCap(gb)`, `historyStorage()`, `purgeHistory(mode, days?)`, `storageWarning()`, `dismissStorageWarning(step)`
- `src/renderer/src/components/AppLayout.tsx`: `StorageBanner`
- `src/renderer/src/routes/settings.tsx`: Storage section on Monitoring, Optimize folded into Clean up, uninstall copy
- Tests: `tests/unit/historyStorage.test.ts` (create), `tests/unit/helperUninstall.test.ts`, `tests/unit/uninstall.test.ts` (create), `tests/e2e/settings.e2e.ts`

---

### Task 0: Store less (snapshots and WAL)

Measured on the dev Mac: 87% of the 21 GB DB was before/after snapshots of `noise` writes. Project-write snapshots were 62% exact duplicates, and the WAL was 2.3 GB.

**Files:**
- Modify `src/helper/snapshots.ts`, `src/helper/historyDb.ts`, `src/helper/leash-helper.ts`, `src/shared/types.ts`
- Tests: `tests/unit/capture.test.ts` (or wherever `ContentCache` is tested), `tests/unit/historyStorage.test.ts`

- [ ] **No snapshots for scratch paths.**
  - `ContentCache.observe` returns the event untouched when `isNoise(event.path)` is true: no `readText`, no `gitShow`, no cache entry.
  - `insertEvents` also writes `null` blobs for any row going to the `noise` bucket. This is defence in depth.
  - Tests:
    - a write under `/private/var/folders/...` or `/tmp/...` produces no blob and no `readText` call
    - a project write still gets before/after
- [ ] **Bounded cache.** `ContentCache` keeps at most 2 000 paths. On insert it evicts the oldest entry, using a `Map` delete-and-set to keep it LRU. Test: entry 2 001 evicts entry 1.
- [ ] **Content-addressed, compressed blobs.**
  - New table `blobs (hash TEXT PRIMARY KEY, size INTEGER NOT NULL, data BLOB NOT NULL)`. `data` is `deflateRawSync(text)` from `node:zlib`.
  - New columns on `events` and `noise`: `before_hash TEXT`, `after_hash TEXT`. Add them with `ALTER TABLE ... ADD COLUMN` in `openHistoryDb` when missing, so existing DBs keep opening.
  - `insertEvents` hashes each blob (`sha256` from `classify.ts`), runs `INSERT OR IGNORE INTO blobs`, and stores the hashes. `sha256` gets the after-hash. The legacy `before_blob` / `after_blob` stay `null` for new rows.
  - `historyText` reads through the hashes and inflates. It falls back to the legacy text columns for old rows.
  - `optimizeHistory` copies `blobs` and the new columns.
  - Tests:
    - two identical writes store one `blobs` row
    - `historyText` round-trips the text
    - a legacy row with text columns still reads
    - the optimize rebuild keeps blobs
- [ ] **Orphan blobs.** `deleteOrphanBlobs(db)`: `DELETE FROM blobs WHERE hash NOT IN (SELECT before_hash FROM events WHERE before_hash IS NOT NULL UNION SELECT after_hash FROM events WHERE after_hash IS NOT NULL UNION <same for noise>)`. It runs after any day prune, size prune or purge that deleted rows. Test: pruning the only row that references a blob removes the blob.
- [ ] **WAL bound.**
  - `openHistoryDb` sets `PRAGMA journal_size_limit = 67108864` on writable connections.
  - The helper's prune tick runs `PRAGMA wal_checkpoint(TRUNCATE)` and ignores busy results.
  - Test: after a large insert and a checkpoint, the `-wal` file is at most 64 MB, or 0 bytes.
- [ ] Commit `feat: Store history snapshots once, compressed, and skip scratch files`

### Task 1: Cap setting and storage types

**Files:** Create `src/shared/storage.ts`, `tests/unit/historyStorage.test.ts`

- [ ] Failing tests for `parseCapGb`: `"10"` → 10, `"1"` → 1, `"0"` / `"1.5"` / `"abc"` / `"1025"` → null. `capBytes("")` → `10 * 1024 ** 3`.
- [ ] Implement:

```ts
export const CAP_MIN_GB = 1;
export const CAP_MAX_GB = 1024;
export const CAP_DEFAULT_GB = 10;
export const PRUNE_START = 0.5;
export const PRUNE_STOP = 0.45;
export const SCRATCH_READ_FLOOR_DAYS = 1;
export const PROJECT_READ_FLOOR_DAYS = 7;

export function parseCapGb(value: string): number | null {
  if (!/^\d+$/.test(value.trim())) return null;
  const gb = Number(value);
  return gb < CAP_MIN_GB || gb > CAP_MAX_GB ? null : gb;
}

export function capBytes(value: string): number {
  return (parseCapGb(value) ?? CAP_DEFAULT_GB) * 1024 ** 3;
}

export interface HistoryStats {
  usedBytes: number;
  fileBytes: number;
  capBytes: number;
  counts: { table: "events" | "noise"; kind: string; sensitive: boolean; rows: number }[];
  prunedAt: number | null;
  prunedRows: number;
  hardCap: boolean;
}

export interface StorageWarning {
  step: number;
  percent: number;
  closable: boolean;
}

export function storageWarning(stats: HistoryStats | null, dismissed: number): StorageWarning | null;
export function rearmDismissed(stats: HistoryStats | null, dismissed: number): number;
```

- [ ] Failing tests for `storageWarning`:
  - 49% → null; 50% → step 50, closable; 67% → step 60
  - 67% with dismissed 60 → null; 72% with dismissed 60 → step 70
  - `hardCap` at 85% → step 100, not closable; 100% with dismissed 100 → still shown, not closable
- [ ] Failing tests for `rearmDismissed`:
  - dismissed 80 at 65% → 70; dismissed 50 at 45% → 50; dismissed 50 at 39% → 40; `null` stats → unchanged
- [ ] Move `formatBytes` out of `settings.tsx` into this file and export it.
- [ ] Commit `feat: Add history cap setting`

### Task 2: Size-based pruning

**Files:** Modify `src/helper/historyDb.ts`, `tests/unit/historyStorage.test.ts`

- [ ] `SCHEMA`:
  - put `PRAGMA auto_vacuum = INCREMENTAL;` first (it only takes effect on an empty file)
  - add `CREATE INDEX IF NOT EXISTS events_kind ON events (kind, sensitive, ts)` and the same on `noise`

  The optimize rebuild goes through `openHistoryDb(replacement)`, so rebuilt files pick this up.
- [ ] `historyUsage(db, path)`: `(page_count - freelist_count) * page_size + size(path-wal)`.
- [ ] `pruneBySize(db, path, cap, now): { deleted: number; hardCap: boolean }` runs the steps from Global Constraints. The hard-cap step picks the oldest 5 000 ids from `SELECT id, 'events' ... UNION ALL SELECT id, 'noise' ... ORDER BY ts LIMIT 5000` and deletes them per table. Write it as a table of `{ table, where, args }` steps fed to one batch-delete loop: `DELETE FROM t WHERE id IN (SELECT id FROM t WHERE <where> ORDER BY ts LIMIT 5000)`.
- [ ] Tests use a tiny cap (e.g. 256 KB) and seeded rows with fixed `now`:
  - under 50% → nothing deleted
  - at 50% → scratch reads older than 1 day go before any project read; scratch reads under 1 day stay
  - project reads older than 7 days go next, non-sensitive before sensitive; reads under 7 days stay
  - `exec` goes before any write
  - `noise` writes go before `events` writes, oldest first
  - the pass stops once usage is under 45% and doesn't touch later steps
  - a sensitive write stays through steps 1–6
  - over 100% with only floored and sensitive rows → rows go strictly oldest first across both tables, regardless of kind or sensitivity, until under 90%, and `hardCap` is reported
  - the next pass under 90% reports `hardCap: false`
  - after deleting, the file size drops (`incremental_vacuum` ran) on a freshly created DB
- [ ] `writeHistoryStats` / `readHistoryStats`: JSON in `meta` under the key `storage-stats`. `counts` comes from `SELECT kind, sensitive, count(*) ... GROUP BY kind, sensitive` per table, using the new index.
- [ ] `purgeHistory(db, mode, now, days?)` handles manual cleanup. Manual cleanup ignores the floors because the user asked for it. Modes:
  - `reads`: every non-sensitive read
  - `noise`: every `noise` row, plus `exec`
  - `older`: every row with `ts < now - days`
  - `all` is not a row delete. See `resetHistory` below.
- [ ] `resetHistory(path)`: remove `path`, `-wal`, `-shm` and any `.optimize-*` / `.backup-*` files, then create a fresh DB with `openHistoryDb(path)`, which brings the new `SCHEMA` and `auto_vacuum`. Keep the file mode and owner the same way `optimizeHistory` does. Test: a seeded DB comes back empty, with `auto_vacuum = 2` and the original mode.
- [ ] Commit `feat: Prune history by size`

### Task 3: Helper enforces the cap

**Files:** Modify `src/helper/leash-helper.ts`

- [ ] `prune()` reads `history_cap_gb` next to `history_days` / `noise_days`. It runs the day prune, then `pruneBySize(db, historyPath, capBytes(value), Date.now())`, then `writeHistoryStats`. Usage is written every tick. Counts are written at most every 10 minutes, or right after a pass that deleted rows.
- [ ] The insert timer checks `historyUsage` after each flush. If usage crossed `PRUNE_START`, it calls `prune()` straight away instead of waiting up to 60 s.
- [ ] Rotate `helper.log`: on the prune tick, if it's over 10 MB, rename it to `helper.log.1` (replacing the old one) and reopen the stream.
- [ ] CLI `--purge <mode> <path> [days]`:
  - for `all`: run `resetHistory(path)` and print `{ beforeBytes, afterBytes, deleted: null }`. Don't delete rows or rebuild; it's instant at any size.
  - for other modes:
    1. open the DB and run `purgeHistory`, then close it
    2. run `optimizeHistory(path)`
    3. print `{ beforeBytes, afterBytes, deleted }`
- [ ] Commit `feat: Enforce the history cap in the helper`

### Task 4: Admin command for purge

**Files:** Modify `src/main/helperInstall.ts`, `tests/unit/helperUninstall.test.ts`

- [ ] Rename `helperOptimizeCommand` to `helperMaintenanceCommand(execPath, scriptPath, args: string[], tools)`. It shell-quotes every arg and keeps the stop → run → always-restart → exit-code behaviour. `helperOptimizeScript` becomes `helperMaintenanceScript(execPath, scriptPath, args)`.
- [ ] Update the optimize tests to pass `["--optimize", path]`. Add a purge case that asserts the `'--purge' 'older' ... '30'` quoting and that a failing purge still restarts the helper.
- [ ] Commit `refactor: Share the helper maintenance command`

### Task 5: Storage IPC

**Files:** Modify `src/main/runtime.ts`, `src/shared/bridge.ts`, `src/preload/index.ts`

- [ ] `history:warning:get` returns `{ warning: StorageWarning | null, capBytes }`. It reads stats with `readHistoryStats`, reads `storageWarningDismissed` from `UiState`, saves the value from `rearmDismissed` if it changed, and returns `storageWarning(...)`. Any read error returns `{ warning: null }`, so a missing history DB never shows a banner.
- [ ] `history:warning:dismiss(step)` saves `max(stored, step)` only when `step < 100`. The 100% warning can't be dismissed, even through IPC.
- [ ] Add `storageWarningDismissed?: number` to `UiState`.
- [ ] `history:cap:get` → `{ gb }`. `history:cap:set(gb)` validates with `parseCapGb`, writes `history_cap_gb` and returns `{ gb }`.
- [ ] `history:storage:info` returns:

```ts
{
  stats: HistoryStats | null,
  files: { label: string; path: string; bytes: number }[],
  freeBytes: number,
  requiredBytes: number
}
```

  - `files` covers `history.db` (+wal/shm), `helper.log` (+ `.1`), `grants.db` (+wal/shm) and `userData`.
  - This replaces `history:optimize:info`, so delete that handler and `HistoryOptimizationInfo`.
- [ ] `history:purge:run(mode: "compact" | "reads" | "noise" | "older" | "all", days?)` keeps the `optimizingHistory` / `historyPaused` guards and the free-space check. `older` validates `days` with `parseRetentionDays`. `compact` is today's optimize, and `history:optimize:run` is removed. In the packaged app it calls `helperMaintenanceScript`. In dev it calls `purgeHistory` + `optimizeHistory` directly.
- [ ] Commit `feat: Report history storage and run cleanup`

### Task 6: Storage section in Settings → Monitoring

**Files:** Modify `src/renderer/src/routes/settings.tsx`, `tests/e2e/settings.e2e.ts`

- [ ] New `Storage` `SettingsSection` under Helper. It has these rows:
  - **History size limit**: GB field (same pattern as `DayField`, 1–1024), with the description "Automatic cleanup starts at half this size. Default 10 GB." If the new cap is under twice the current usage, a `ConfirmAction` says automatic cleanup will start within a minute.
  - **History usage**: "3.1 GB used of 10 GB". A bar marks the 50% point. If `hardCap` is set, it repeats the 100% banner wording.
  - **Breakdown**: scratch reads, project reads, sensitive, writes and other changes, network, exec, from `stats.counts`.
  - **Files on disk**: each entry in `files` with its size, and a total.
  - **Last automatic cleanup**: `prunedAt` and `prunedRows`.
  - **Clean up**: a `ConfirmAction` with a choice of Compact only / Remove reads / Remove noise and exec / Remove older than N days (`DayField`) / Delete all history. The effects text changes with the choice. "Delete all history" uses destructive styling. It's disabled while running or when free space is under `requiredBytes`.
- [ ] Remove the old "Optimize history" row. Compact only covers it.
- [ ] E2E:
  - setting the limit to `0` reverts the field, and `5` persists across reload
  - Clean up → Remove reads → confirm shows the result text
  - the existing optimize test moves to Compact only
- [ ] Commit `feat: Show history storage and force cleanup in Settings`

### Task 7: Storage warning banner

**Files:** Modify `src/renderer/src/components/AppLayout.tsx`, `tests/e2e/settings.e2e.ts`

- [ ] Add `StorageBanner` next to the restart banner. It polls `storageWarning()` every 30 s and also on window focus.
- [ ] Closable (50–90%):
  - amber styling, like the restart banner
  - text: "History is using {percent}% of its {cap} limit. Old reads and scratch files are being removed automatically."
  - a "Manage storage" button goes to Settings → Monitoring
  - an `X` (`aria-label="Dismiss"`) calls `dismissStorageWarning(step)` and hides the banner
- [ ] Not closable (100%):
  - destructive styling, like `LockdownBanner`
  - text: "History has reached its {cap} limit. The oldest history, including sensitive files, is being deleted to make room. Raise the limit or clean up history to stop this."
  - a "Manage storage" button and no `X`
- [ ] E2E: drive the IPC from a test fixture with stubbed stats, reusing the existing dev-env override pattern:
  - 55% shows a closable banner, and after dismiss + reload it's still gone
  - 65% shows the 60% banner
  - `hardCap` shows a banner with no Dismiss button
- [ ] Commit `feat: Warn when history nears its size limit`

### Task 8: Uninstall is a full clean slate

**Files:**
- Modify `src/main/backup.ts`, `src/main/runtime.ts`, `settings.tsx` (`UNINSTALL_EFFECTS`)
- Create `src/main/uninstall.ts`, `tests/unit/uninstall.test.ts`

- [ ] `backupTargets(home, claudeRoot)` returns every file `writeWithBackup` writes:
  - `<claudeRoot>/settings.json`
  - `~/.claude.json`
  - `~/.cursor/hooks.json`, `~/.cursor/cli-config.json`, `~/.cursor/mcp.json`
  - `~/.codex/hooks.json`
  - `~/.gemini/settings.json`
  - `~/.hermes/config.yaml`

  Add a unit test that greps `src/main` for `writeWithBackup(` callers and fails if a new caller shows up without this list being reviewed: a snapshot of the caller count.
- [ ] `uninstallLeftovers({ home, claudeRoot, userData, historyDir, systemHistory })` returns:
  - every `backupTargets(...)` path + `.bak`
  - `~/.hermes/agent-hooks/agentic-leash.sh`, plus the `agent-hooks` directory if nothing else is in it (other files there belong to other Hermes hooks)
  - `~/Library/LaunchAgents/com.agenticleash.sweep.plist`, `~/Library/LaunchAgents/com.agenticleash.app.plist`
  - `~/.agentic-leash`, `userData`
  - `~/Library/Logs/Agentic Leash`, `~/Library/Caches/com.agenticleash.app`, `~/Library/Caches/Agentic Leash`, `~/Library/Preferences/com.agenticleash.app.plist`, `~/Library/Saved Application State/com.agenticleash.app.savedState`, `~/Library/HTTPStorages/com.agenticleash.app`
  - `historyDir` when it isn't the root-owned system dir (dev / `AGENTIC_LEASH_HISTORY_DIR`)
- [ ] `app:uninstall` order:
  1. helper uninstall script. This boots out the daemon and `rm -rf`s `/Library/Application Support/AgenticLeash`, which covers `history.db*`, `helper.log*` and any `.optimize-*` / `.backup-*` temp files.
  2. strip hooks and Claude rules (these write fresh `.bak`s)
  3. boot out the LaunchAgents
  4. `removeLeftovers`
  5. `finishUninstall` (moves the app to Trash)
- [ ] Unit test with a temp home seeded with every leftover:
  - all removed
  - a non-empty `agent-hooks` dir keeps the other file
  - the agent config files themselves still exist with only our hooks stripped
- [ ] Extend the `helperUninstallScript` test: the bootout comes before the `rm -rf`.
- [ ] Rewrite `UNINSTALL_EFFECTS` so it lists the history database and log, the backup (`.bak`) files next to agent configs, and the app's caches and preferences.
- [ ] Commit `feat: Make uninstall remove every file the app created`

### Task 9: Verify

- [ ] `npm test`, `npx tsc --noEmit -p tsconfig.node.json`, `npx tsc --noEmit -p tsconfig.web.json`, `npx playwright test tests/e2e/settings.e2e.ts`
- [ ] Manual check in the packaged app:
  - set the cap to 1 GB on a history over 500 MB; within a minute old scratch reads go first and project reads under 7 days stay
  - Clean up → Remove reads asks for the password and shrinks the file
  - Uninstall leaves nothing from `uninstallLeftovers` and no `/Library/Application Support/AgenticLeash`
  - at about 55% of a small cap the closable banner shows once, and stays gone after dismiss and app restart
  - at 100% the banner can't be closed, and it goes away once usage is back under 90%

## Rollout

- **No migration for existing history.** The current history DB (about 21 GB over 6 days on the dev Mac) is thrown away rather than converted.
- **Reset order:**
  1. Install the build with these changes so the new helper is running.
  2. Use Settings → Monitoring → Clean up → Delete all history. This also tests the `resetHistory` path end to end.
- **Don't reset before step 1.** The old helper would refill the new file at about 11 GB a day.
- **Watch growth.** Check the Storage section once a day for the first week: usage, rows by kind, last automatic cleanup and any banners. Write down the daily growth so the 10 GB default and the 50% trigger can be tuned with real numbers.

## Future work

- **Deletion policy UI.** Let the user choose the prune order, the per-category floors (1-day scratch reads, 7-day project reads), whether sensitive rows are ever pruned, and the warning steps. Until then these stay fixed constants in `src/shared/storage.ts`.

---

Created using Anthropic Claude
