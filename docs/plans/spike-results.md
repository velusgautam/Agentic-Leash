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
