# Agentic Leash

See and control what AI coding agents can touch on your Mac.

![Agentic Leash](docs/screenshot.png)

Claude Code, Cursor, Codex and Gemini keep working. Agentic Leash watches the files they read and write, asks before they reach a folder you have not allowed, and flags sensitive paths like `~/.ssh` the moment they are touched.

- **Live** activity from the agents on this Mac, with a red mark on sensitive files
- **Grants** that expire, plus one shortcut to revoke everything and lock down
- **Per-agent** folders, MCP servers, network rules and macOS privacy
- **Appearance** controls for theme, contrast, transparency and density
- A menu-bar app: closing the window hides it, Quit is in the tray

## Run it

macOS on Apple Silicon, Node 24 and pnpm 12.

```bash
pnpm install
pnpm dev
```

`pnpm test` runs the unit tests. `pnpm test:e2e` launches the window. `pnpm dist` builds `dist/Agentic Leash-0.1.0-arm64.dmg`.

File history needs the helper (Settings → Monitoring) and Full Disk Access for the app. The helper is a root LaunchDaemon, so macOS asks for an administrator password once.
