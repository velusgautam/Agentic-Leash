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
