# Agentic Leash

See and control what AI coding agents can touch on your Mac.

[Download Agentic Leash 0.1.2 for Apple Silicon](https://github.com/velusgautam/Agentic-Leash/releases/download/v0.1.2/Agentic.Leash-0.1.2-arm64.dmg)

![Agentic Leash launch](docs/media/launch.gif)

[Launch video, 1920×1080 MP4](docs/media/launch.mp4)

Claude, Cursor, Codex, Gemini CLI and Hermes keep working. Agentic Leash watches the files they read and write, asks before they reach a folder you have not allowed, and flags sensitive paths like `~/.ssh` the moment they are touched.

## Features

### Grants on a timer

![Grants filtered and sorted by expiry](docs/media/grants.png)

A grant can last 15 minutes, a couple of hours, or forever. Filter the list by agent and sort it by when it was approved or when it expires.

### Revoke, then lock down

![Revoke all confirmation](docs/media/revoke.png)

Revoke a single grant, or revoke every grant at once. Revoke all turns lockdown on, so the next tool call is blocked until you end it.

### Every write keeps its diff

![History with a write diff and the grant that allowed it](docs/media/history-diff.png)

History stores the before and after of each write. Open it later and the diff is still there, next to the grant that allowed the path.

### Sensitive paths turn red

![Live activity with sensitive reads highlighted](docs/media/live-sensitive.png)

Reads of `~/.ssh`, `~/.aws` and other secret paths are marked in red on Live and in History, with a count on the Sensitive filter.

### Ask before a new folder

![Approval popup for a write to ~/.ssh/config](docs/media/approval.png)

A tool call outside an existing grant opens this popup. Allow it for 15 minutes, 1 hour, 8 hours or always, or deny it. The same choices are on the Grants page while a request is waiting.

## How it hooks in

```mermaid
flowchart TB
  subgraph gate ["Blocks the tool call"]
    direction TB
    claude["Claude<br>PreToolUse"]
    codex["Codex<br>PreToolUse"]
    cursor["Cursor<br>preToolUse · beforeReadFile<br>beforeShellExecution · beforeMCPExecution"]
    gemini["Gemini CLI<br>BeforeTool"]
    hermes["Hermes<br>pre_tool_call"]
    hook["leash-hook<br>fail closed"]
    broker["Broker"]
    rules["Grants · TTL · lockdown"]
    popup["Approval popup"]
    allow["Allow"]
    deny["Deny"]
    claude --> hook
    codex --> hook
    cursor --> hook
    gemini --> hook
    hermes --> hook
    hook --> broker --> rules
    rules --> allow
    rules --> deny
    rules --> popup
    popup --> allow
    popup --> deny
  end

  subgraph record ["Records what happened"]
    direction TB
    es["eslogger"]
    helper["Root helper"]
    db[("history.db<br>writes, diffs, sensitive flags")]
    ui["Live · History · Grants"]
    es --> helper --> db --> ui
  end

  rules -.-> ui

  classDef claude fill:#4a2c1a,stroke:#e8a87c,color:#fff
  classDef cursor fill:#1a2744,stroke:#7eb6ff,color:#fff
  classDef codex fill:#1a3324,stroke:#7dcea0,color:#fff
  classDef gemini fill:#2a1a3a,stroke:#d7a3ff,color:#fff
  classDef hermes fill:#3a2a14,stroke:#f0c36a,color:#fff
  classDef core fill:#3a1214,stroke:#ff8a7a,color:#fff
  classDef ok fill:#12301c,stroke:#86efac,color:#fff
  classDef no fill:#3f1515,stroke:#fca5a5,color:#fff
  classDef watch fill:#12182e,stroke:#a5b4fc,color:#fff
  class claude claude
  class cursor cursor
  class codex codex
  class gemini gemini
  class hermes hermes
  class hook,broker,rules,popup core
  class allow ok
  class deny no
  class es,helper,db,ui watch
```

Setup installs the hook into each agent that is turned on. The hook asks the broker before the tool runs. A matching grant that has not expired is allowed. Lockdown denies. Anything else waits on the approval popup.

Separately, a root helper tails `eslogger` and writes file activity into `history.db`, including the before and after of writes and a sensitive flag. Live and History read that database. The grant shown beside a write is the one whose folder covers the path.

## Run it

macOS on Apple Silicon, Node 24 and pnpm 12.

```bash
pnpm install
pnpm dev
```

`pnpm test` runs the unit tests. `pnpm test:e2e` launches the window. `pnpm dist` builds `dist/Agentic Leash-0.1.2-arm64.dmg`.

The first open stays on setup until the history helper is running and Full Disk Access is granted. In a dev build the helper step reads "Available in the installed app". Claude covers both the desktop app and the `claude` CLI. Turning an agent off in Settings hides it and removes its hooks. The helper is a root LaunchDaemon, so macOS asks for an administrator password once.

`SCREENSHOTS=1 pnpm exec playwright test tests/e2e/marketing.e2e.ts` refreshes the feature images. `node docs/media/launch/record.mjs` rebuilds the MP4 and GIF from those images.
