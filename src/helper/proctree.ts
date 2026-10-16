const ROOTS = new Set(["claude", "cursor-agent", "codex", "gemini", "opencode"]);

export interface EsEvent {
  time?: string;
  process?: { audit_token?: { pid?: number }; ppid?: number; executable?: { path?: string } };
  event?: Record<string, unknown>;
}

export class ProcTree {
  private readonly tracked = new Map<number, string>();

  constructor(private readonly t3Pids: Set<number> = new Set()) {}

  has(pid: number): boolean {
    return this.tracked.has(pid);
  }

  agent(pid: number): string {
    return this.tracked.get(pid) ?? "unknown";
  }

  apply(event: EsEvent): void {
    const kind = event.event ?? {};
    if (kind.exec) this.onExec(event);
    if (kind.fork) this.onFork(kind.fork as { child?: { audit_token?: { pid?: number }; executable?: { path?: string } } });
    if (kind.exit) {
      const pid = event.process?.audit_token?.pid;
      if (pid) this.tracked.delete(pid);
    }
  }

  private onExec(event: EsEvent): void {
    const exec = event.event?.exec as { target?: { executable?: { path?: string }; audit_token?: { pid?: number }; ppid?: number } } | undefined;
    const path = exec?.target?.executable?.path ?? event.process?.executable?.path ?? "";
    const pid = exec?.target?.audit_token?.pid ?? event.process?.audit_token?.pid;
    const ppid = exec?.target?.ppid ?? event.process?.ppid;
    if (!pid) return;
    const base = path.split("/").pop() ?? "";
    if (ROOTS.has(base) || (ppid !== undefined && (this.tracked.has(ppid) || this.t3Pids.has(ppid)))) {
      this.tracked.set(pid, this.tracked.get(ppid ?? -1) ?? base);
    }
  }

  private onFork(fork: { child?: { audit_token?: { pid?: number }; executable?: { path?: string }; ppid?: number } }): void {
    const child = fork.child?.audit_token?.pid;
    const parent = fork.child?.ppid;
    if (!child || parent === undefined || !this.tracked.has(parent)) return;
    this.tracked.set(child, this.tracked.get(parent)!);
  }
}
