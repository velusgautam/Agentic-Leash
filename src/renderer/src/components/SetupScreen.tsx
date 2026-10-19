import type { SetupAgent } from "../../../shared/setup";
import { LeashMark } from "~/components/Icons";
import { PageContainer, SettingsRow, SettingsSection } from "~/components/settings";
import { SetupButton } from "~/components/SetupButton";
import { Button } from "~/components/ui/button";
import { useSetup } from "~/components/useSetup";

const HOOKS: Record<string, { title: string; id: "claude-code" | "cursor" | "codex" }> = {
  "claude-code": { title: "Claude hooks", id: "claude-code" },
  cursor: { title: "Cursor hooks", id: "cursor" },
  codex: { title: "Codex hooks", id: "codex" },
};

function HookRows({ agents }: { agents: SetupAgent[] }) {
  const { run } = useSetup();
  const rows = agents.filter((agent) => agent.hooks !== null && agent.installed && agent.enabled);
  if (!rows.length) return <SettingsRow title="Hooks" description="Claude and Cursor are not on this Mac yet. This step can wait." />;
  return rows.map((agent) => {
    const hook = HOOKS[agent.id];
    if (!hook) return null;
    return (
      <SettingsRow
        key={agent.id}
        title={hook.title}
        description="New sessions pick the hooks up after a restart."
        control={
          <span className="flex items-center gap-2">
            <SetupButton kind="hook" actionKey={agent.id} done={agent.hooks === true} onClick={() => window.leash.installHooks(hook.id)} />
            {agent.hooks ? <Button size="sm" variant="outline" onClick={() => run(`${agent.id}:off`, () => window.leash.uninstallHooks(hook.id))}>Uninstall</Button> : null}
          </span>
        }
      />
    );
  });
}

export function SetupScreen() {
  const { status } = useSetup();
  const helperSkipped = status?.helper === "skipped";
  return (
    <div className="flex h-dvh flex-col bg-background">
      <div className="drag-region flex h-13 items-center gap-3 px-5">
        <LeashMark className="h-7 w-auto" />
        <span className="text-base font-semibold tracking-tight">Agentic Leash</span>
      </div>
      <PageContainer>
        <div className="px-3 sm:px-4">
          <h1 className="text-lg font-medium">Set up this Mac</h1>
          <p className="mt-1 text-sm text-muted-foreground">Hooks, the history helper, and Full Disk Access. The app opens when these checks pass.</p>
        </div>
        <SettingsSection title="1. Hooks">
          <HookRows agents={status?.agents ?? []} />
        </SettingsSection>
        <SettingsSection title="2. History helper">
          <SettingsRow
            title="File history helper"
            description={helperSkipped ? "Available in the installed app." : "Installs a root LaunchDaemon. macOS asks for an administrator password."}
            control={helperSkipped ? <Button size="sm" disabled>Available in the installed app</Button> : <SetupButton kind="helper" actionKey="helper" done={status?.helper === "running"} onClick={() => window.leash.installHelper()} />}
          />
        </SettingsSection>
        <SettingsSection title="3. Full Disk Access">
          <SettingsRow
            title="Full Disk Access"
            description="Opens the Full Disk Access pane. If Agentic Leash is missing, click + and add Agentic Leash.app."
            control={<SetupButton kind="fda" actionKey="fda" done={Boolean(status?.fda)} onClick={() => window.leash.openFullDiskAccess()} />}
          />
        </SettingsSection>
      </PageContainer>
    </div>
  );
}
