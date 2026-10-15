# Milestone 0 spike results

## Task 0.1: Hook start-up latency

- **Machine:** macOS 26.6.2, Apple Silicon
- **Electron:** 44.7.2 / node 24.21.0
- **node:sqlite:** loaded without flags in both runtimes

| Runtime | Run | p50 | p95 |
|---------|-----|-----|-----|
| Electron-as-Node | 1 | 43 ms | 48 ms |
| Electron-as-Node | 2 | 44 ms | 65 ms |
| System Node v24.15.0 | 1 | 22 ms | 25 ms |
| System Node v24.15.0 | 2 | 23 ms | 25 ms |

**Verdict:** Pass — Electron p95 (65 ms) < 150 ms; keep Electron-as-Node runtime.

**Note:** pnpm did not run Electron's postinstall; binary downloaded manually via `node node_modules/electron/install.js`.

## Task 0.2: `eslogger` event volume

Sample: 400,000 events (11.2 s) from one `eslogger` instance while Claude Code and T3 Code ran.

| Stream | Events/s | MB/s | Node parse rate | Headroom |
|---|---|---|---|---|
| With `write` | 35,768 | 81.1 | 238,977/s | 6.7× |
| Without `write` | 3,236 | 7.1 | 223,687/s | 69× |

- 91% of events were `write`. Most came from `eslogger` writing its own output, a feedback loop that made 13 GB in ~8 min. The rest was mostly SentinelOne (`sentineld`).
- **Verdict:** Pass without `write`. The helper never subscribes to `write`; `close.modified` already marks writes. Keep `eslogger`, no `fs_usage` fallback.
- `eslogger` ignored `pkill -INT`; only `SIGKILL` stopped it. The helper must stop it with `SIGKILL` or by closing its stdout.
- Fixtures: `tests/fixtures/eslogger/<type>.jsonl` (20 each; `rename` 10, `unlink` 13). `exec` args after `argv[0]` and `env` are redacted. `eslogger` and `sentineld` events are excluded.

| Field | JSON path |
|---|---|
| pid | `process.audit_token.pid` |
| ppid | `process.ppid` (`original_ppid` survives reparenting) |
| executable | `process.executable.path` |
| fork child | `event.fork.child.audit_token.pid`, `event.fork.child.executable.path` |
| exec target | `event.exec.target.executable.path`, `event.exec.args`, `event.exec.cwd.path` |
| open | `event.open.file.path`, `event.open.fflag` (kernel flags: `FREAD` 1, `FWRITE` 2) |
| close | `event.close.target.path`, `event.close.modified` |
| create | `event.create.destination.existing_file.path` when `destination_type` 0; `new_path.dir.path` + `new_path.filename` when 1 (from Apple's docs; not in sample) |
| rename | `event.rename.source.path`; destination same shape as `create` |
| unlink | `event.unlink.target.path` |
| time | `time` (ISO 8601, ns) |

## Task 0.3: Real hook payloads (partial)

**Cursor CLI `2026.10.01-e373342`** (`cursor-agent -p --force --trust`), fixtures in `tests/fixtures/hooks/cursor-*.json`:

| Event | Fields used |
|---|---|
| `preToolUse` Shell | `tool_input.command`, `tool_input.cwd`, `cwd` |
| `preToolUse` Read | `tool_input.file_path` (no top-level `cwd`) |
| `preToolUse` Write | `tool_input.file_path`, `tool_input.content` |
| `beforeReadFile` | `file_path`, `content` (full file text), `attachments` |
| `beforeShellExecution` | `command`, `cwd`, `sandbox` |

- Every payload also has `session_id`, `conversation_id`, `workspace_roots`, `cursor_version`, `model`, `user_email` and `transcript_path`.
- Cursor's docs show `working_directory` for Shell; the real field is `tool_input.cwd`.
- The hook must never log `content`, `user_email` or `transcript_path`.
- A running session doesn't pick up a newly created `~/.cursor/hooks.json`. This T3 Code Cursor chat fired no hooks; a fresh `cursor-agent` session fired all of them. Installing hooks therefore needs a "start new agent sessions" banner.

**Claude Code (company account):** inconclusive. `claude -p` failed with `OAuth session expired and could not be refreshed` before any tool call.

**Still to capture:** Cursor IDE, an MCP call, Claude on the company account (after you sign in again), Claude on a personal account.
