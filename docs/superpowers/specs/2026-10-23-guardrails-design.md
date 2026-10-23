# Guardrails: secrets, short-lived access, fewer prompts, Insights

Created using Anthropic Claude. Internal draft; a person should review and verify it before it is shared more widely.

## Problem

A folder grant covered every file under it, including `.env` and keys. A forever rule on `~` covered `~/.ssh`. Every shell command counted as a write, so a read grant never covered `git status`. Network and MCP calls always passed, even right after a secret read. Diffs of secret files were stored in plain text. There was no view of how often people were asked.

## Locked decisions

- One secret catalog for macOS, Linux and Windows lives in `src/shared/sensitive.ts`: key folders, token files, browser profiles, shell history, and secret file names anywhere (`.env*` except templates, `*.pem`, `*.key`, `id_ed25519`, `*.tfstate`, ...). System cert bundles and vendored folders are exempt. `isSensitive` and the History noise filter both use it.
- Startup files (`~/.zshrc`, LaunchAgents, `.git/hooks`, agent configs, ...) are guarded for writes only.
- A secret path, or a write to a startup path, is covered only by a grant or rule whose root is itself guarded. A parent folder never reaches it.
- The home folder can't be granted. A file directly in home is granted on its own. Forever rules reject secrets, startup paths, and whole personal folders (`~/Documents`), but accept a folder inside one.
- A shell line is `read` when every segment is a known read-only command (`git status|diff|log|show…`, `ls`, `cat`, `rg`, `find` without `-exec/-delete`, ...), with no env overrides, no command substitution, and redirects only to `/dev/null`. Words are split by a small lexer, not a regex on the raw string.
- Shell path extraction follows `cd`, `$HOME`, bare relative names like `.env`, and absolute paths inside quoted code. It is still not a sandbox.
- The popup offers at most three one-click choices, picked by the main process for each request. It clamps whatever the renderer sends to the nearest shorter allowed choice:
  - in a git repo: Once · This session · Always in *repo* (default This session, repo folder chip preselected).
  - elsewhere: Once · This session · Today (default This session).
  - personal folder outside a repo: Once · 15 min (default Once).
  - secret, startup-file write, or network call after a secret read: Once only; high risk; Enter does nothing.
- "Once" writes nothing. "This session" binds the grant to the agent's session id and slides its expiry: 30 idle minutes, at most 12 hours after approval. "Today" ends at the end-of-day hour (Settings, default 7 pm), or at midnight once that has passed. "Always in *repo*" is a forever write grant on the repo root; secrets and startup files inside still ask.
- 1 hour, 8 hours and Always remain for the Access page and older callers. Manual grants and +1 h extends on secret, startup and personal paths are capped at 15 minutes.
- Locking or sleeping the Mac ends personal-folder grants (outside repos) by default. Settings can switch this to every timed grant. Always and Always in *repo* are never affected.
- After a session gets a secret read through, its web, MCP and egress shell calls (`curl`, `scp`, `git push`, ...) ask for 15 minutes.
- Deny is remembered for 10 minutes for that request and session. Never saves a block rule for that agent: the exact command, or the path (or chosen folder chip) and everything under it. Never beats every grant and rule.
- After Deny or Never, the popup stays open 6 seconds with Undo, and the Access page toast has Undo too. Access → Blocked lists remembered denials (Remove, Clear all) and Never rules (Remove, with a confirm). Log rows that were denied or timed out have Ask again, which drops matching blocks. None of these can allow a call that was already denied; the agent's next try asks again.
- Quiet approval style sends notifications but still opens the popup for high-risk requests. The notification's Allow button uses the request's default choice.
- History stores secret files redacted (`KEY=•••• 3f2a`, private keys collapsed). Startup-file writes are flagged like secrets. Notifications for the same agent and path are throttled to one per 10 minutes.
- Decisions record session id, secret, and whether a person was asked. `duration_ms` is now real (it was always 0). Diagnostics latency excludes time spent waiting on a person.
- Insights (`/insights`): prompts per day, share allowed without asking, median wait, blocked and secret counts, per-agent counts and top folders, grants with no recorded use (30 min) or forever grants idle for 14 days, and recent secret and startup activity.

## Out of scope

- OS sandboxing of agent shells (Seatbelt, bubblewrap, Landlock, AppContainer).
- Content sniffing for keys inside unlisted files.
- Grouping History by agent session.
