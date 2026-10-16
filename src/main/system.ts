export interface PsRow {
  pid: number;
  ppid: number;
  args: string;
}

const GUI = [
  { name: "Cursor", bundleId: "com.todesktop.230313mzl4w4u92", match: /Cursor\.app|cursor-agent/ },
  { name: "T3 Code", bundleId: "com.t3tools.t3code", match: /T3 Code/ },
  { name: "Claude", bundleId: "com.anthropic.claudefordesktop", match: /Claude\.app/ },
];

export function parsePs(text: string): PsRow[] {
  return text
    .split("\n")
    .slice(1)
    .map((line) => {
      const match = /^\s*(\d+)\s+(\d+)\s+(.*)$/.exec(line);
      return match ? { pid: Number(match[1]), ppid: Number(match[2]), args: match[3]! } : null;
    })
    .filter((row): row is PsRow => row !== null);
}

export function restartTargets(rows: PsRow[]): { name: string; pid: number; kind: "gui" | "cli"; bundleId?: string; hint?: string }[] {
  const targets: { name: string; pid: number; kind: "gui" | "cli"; bundleId?: string; hint?: string }[] = [];
  for (const row of rows) {
    const gui = GUI.find((app) => app.match.test(row.args) && !row.args.includes("cursor-agent"));
    if (gui) {
      targets.push({ name: gui.name, pid: row.pid, kind: "gui", bundleId: gui.bundleId });
      continue;
    }
    if (/\bclaude\b/.test(row.args)) targets.push({ name: "Claude Code", pid: row.pid, kind: "cli", hint: "claude --continue" });
    else if (row.args.includes("cursor-agent")) targets.push({ name: "Cursor agent", pid: row.pid, kind: "cli" });
  }
  return targets;
}

export function guiQuitScript(bundleId: string): string {
  return `tell application id "${bundleId}" to quit`;
}

export function percentiles(values: number[]): { p50: number | null; p95: number | null } {
  if (!values.length) return { p50: null, p95: null };
  const sorted = [...values].sort((a, b) => a - b);
  const at = (p: number) => sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)]!;
  return { p50: at(50), p95: at(95) };
}

export function parseLsof(text: string): { pid: number; remote: string }[] {
  const rows: { pid: number; remote: string }[] = [];
  for (const line of text.split("\n").slice(1)) {
    const parts = line.trim().split(/\s+/);
    const pid = Number(parts[1]);
    const name = parts.find((part) => part.includes("->")) ?? "";
    const remote = name.includes("->") ? name.split("->")[1] : "";
    if (pid && remote) rows.push({ pid, remote: remote.replace(/\s*\(.*\)$/, "") });
  }
  return rows;
}
