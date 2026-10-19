import { useEffect, useState } from "react";
import { Link, Outlet, useLocation, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, RotateCw, Settings, ShieldOff, X } from "lucide-react";
import { ConfirmAction, REVOKE_ALL_EFFECTS } from "~/components/ConfirmAction";
import { AgentIcon, LeashMark } from "~/components/Icons";
import { Button } from "~/components/ui/button";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
} from "~/components/ui/sidebar";
import { needsAgentBanner, visibleAgent } from "../../../shared/setup";
import { SetupScreen } from "~/components/SetupScreen";
import { SetupProvider, useSetup } from "~/components/useSetup";
import { AGENT_NAV, MAIN_NAV, SETTINGS_SECTIONS } from "~/nav";

function RevokeAll() {
  const [status, setStatus] = useState({ count: 0, lockdown: false });
  const [note, setNote] = useState<string | null>(null);
  useEffect(() => {
    const tick = () => void window.leash.grantStatus().then(setStatus);
    tick();
    const timer = window.setInterval(tick, 2000);
    return () => window.clearInterval(timer);
  }, []);
  return (
    <>
      {note ? <span className="text-xs text-muted-foreground">{note}</span> : null}
      <ConfirmAction
        trigger={
          <Button size="sm" variant="outline" className="border-destructive/30 text-destructive hover:bg-destructive/10 disabled:opacity-40" disabled={status.count === 0}>
            <ShieldOff />
            {status.count === 0 ? "Nothing to revoke" : `Revoke all (${status.count})`}
          </Button>
        }
        title={`Revoke all ${status.count} grants?`}
        description="Every agent loses the folder access it has now."
        effects={REVOKE_ALL_EFFECTS}
        confirmLabel="Revoke all"
        onConfirm={() => void window.leash.revokeAll().then((result) => setNote(`Revoked ${result.revoked}. Lockdown is on.`))}
      />
    </>
  );
}

function MainNav({ pathname, agents }: { pathname: string; agents: readonly { id: string; label: string }[] }) {
  return (
    <>
      <SidebarGroup className="pt-3 pb-2">
        <SidebarMenu className="gap-1.5">
          {MAIN_NAV.map(({ to, label, icon: Icon }) => (
            <SidebarMenuItem key={to}>
              <SidebarMenuButton className="h-9" isActive={pathname === to} render={<Link to={to} />}>
                <Icon />
                {label}
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarGroup>
      <div className="mx-3 border-t border-sidebar-border" role="separator" />
      <SidebarGroup className="pt-3 pb-2">
        <div className="px-2.5 pt-1 pb-2 text-[11px] font-medium tracking-wide text-muted-foreground">Agents</div>
        <SidebarMenu className="gap-1.5">
          {agents.map(({ id, label }) => (
            <SidebarMenuItem key={id}>
              <SidebarMenuButton
                className="h-9"
                isActive={pathname === `/agents/${id}`}
                render={<Link to="/agents/$agentId" params={{ agentId: id }} />}
              >
                <AgentIcon agent={id} />
                {label}
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarGroup>
    </>
  );
}

function SettingsNav({ pathname }: { pathname: string }) {
  return (
    <SidebarGroup className="pt-3">
      <SidebarMenu className="gap-1.5">
        <SidebarMenuItem>
            <SidebarMenuButton className="h-9" render={<Link to="/live" />}>
            <ArrowLeft />
            Back
          </SidebarMenuButton>
        </SidebarMenuItem>
        {SETTINGS_SECTIONS.map(({ id, label, icon: Icon }) => (
          <SidebarMenuItem key={id}>
            <SidebarMenuButton
              className="h-9"
              isActive={pathname === `/settings/${id}`}
              render={<Link to="/settings/$section" params={{ section: id }} />}
            >
              <Icon />
              {label}
            </SidebarMenuButton>
          </SidebarMenuItem>
        ))}
      </SidebarMenu>
    </SidebarGroup>
  );
}

export function AppLayout() {
  return (
    <SetupProvider>
      <AppShell />
    </SetupProvider>
  );
}

function AppShell() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const [palette, setPalette] = useState(false);
  const [restart, setRestart] = useState<{ name: string; kind: "gui" | "cli"; count: number }[]>([]);
  const [path, setPath] = useState("");
  const { status } = useSetup();
  const onSettings = pathname.startsWith("/settings");
  const shownAgents = AGENT_NAV.filter((item) => status?.agents.some((agent) => agent.id === item.id && visibleAgent(agent)));
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPalette((open) => !open);
      }
    };
    window.addEventListener("keydown", onKey);
    const timer = window.setInterval(() => void window.leash.restartNeeded().then(setRestart), 2000);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.clearInterval(timer);
    };
  }, []);
  if (pathname === "/approval") return <Outlet />;
  if (!status?.ready) return <SetupScreen />;
  return (
    <SidebarProvider className="h-dvh! min-h-0!" defaultOpen>
      <Sidebar
        side="left"
        collapsible="offcanvas"
        aria-label={onSettings ? "Settings" : "Navigation"}
        resizable={{ minWidth: 232, maxWidth: 360, storageKey: "agentic-leash:sidebar-width" }}
      >
        <SidebarHeader className="gap-0 p-0">
          {/* Traffic lights sit in this strip and hide in fullscreen, so the brand stays left. */}
          <div className="drag-region h-13 shrink-0" />
          <div className="drag-region flex items-center gap-3 border-b border-sidebar-border px-[calc(var(--sidebar-content-inset)+var(--sidebar-row-content-inset))] py-3 text-base font-semibold tracking-tight">
            <LeashMark className="h-7 w-auto shrink-0" />
            <span className="truncate">Agentic Leash</span>
          </div>
        </SidebarHeader>
        <SidebarContent>{onSettings ? <SettingsNav pathname={pathname} /> : <MainNav pathname={pathname} agents={shownAgents} />}</SidebarContent>
        {onSettings ? null : (
          <SidebarFooter className="border-t border-sidebar-border pt-2">
            <SidebarMenu className="gap-1.5">
              <SidebarMenuItem>
                <SidebarMenuButton className="h-9" render={<Link to="/settings/$section" params={{ section: "general" }} />}>
                  <Settings />
                  Settings
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarFooter>
        )}
        <SidebarRail />
      </Sidebar>
      <SidebarInset className="min-h-0 overflow-hidden">
        <div className="drag-region flex h-13 shrink-0 items-center justify-end gap-3 px-5">{onSettings ? null : <RevokeAll />}</div>
        {status && needsAgentBanner(status.agents) ? (
          <div role="status" className="mx-5 mb-2 rounded-lg border border-border bg-muted/50 px-3 py-2 text-sm">
            Install Claude, Cursor, Codex, Gemini, or Hermes to start tracking.
          </div>
        ) : null}
        {restart.length ? (
          <div role="status" className="mx-5 mb-2 flex items-center gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 py-1.5 pr-1.5 pl-3 text-sm">
            <RotateCw className="size-4 shrink-0 text-amber-500" aria-hidden />
            <span className="min-w-0 flex-1">
              {restart.map((item) => item.name).join(", ")} {restart.length === 1 ? "is" : "are"} running with the old settings. Restart to pick up your change.
            </span>
            <ConfirmAction
              trigger={<Button size="sm" variant="outline">Restart</Button>}
              title="Restart these agents?"
              description="Unsaved work in them may be lost."
              effects={restart.map((item) =>
                item.kind === "gui"
                  ? `Quits ${item.name}. Open it again yourself.`
                  : `Stops ${item.count} ${item.name} ${item.count === 1 ? "session" : "sessions"}. Start ${item.count === 1 ? "it" : "them"} again in the terminal${item.name === "Claude" ? " (claude --continue resumes)" : ""}.`,
              )}
              confirmLabel="Restart"
              onConfirm={() => void window.leash.restartAgents().then(() => setRestart([]))}
            />
            <Button size="icon-sm" variant="ghost" aria-label="Dismiss" onClick={() => void window.leash.dismissRestart().then(() => setRestart([]))}>
              <X />
            </Button>
          </div>
        ) : null}
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <Outlet />
        </div>
      </SidebarInset>
      {palette ? (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 pt-24" onClick={() => setPalette(false)}>
          <form
            className="w-[32rem] rounded-xl border border-border bg-popover p-3 shadow-lg"
            onClick={(event) => event.stopPropagation()}
            onSubmit={(event) => {
              event.preventDefault();
              if (path.trim()) void window.leash.createGrant({ agent: "*", path: path.trim(), access: "write", ttlSeconds: 3600 });
              setPalette(false);
            }}
          >
            <input className="mb-2 w-full rounded-md border border-border bg-transparent px-2 py-1.5 text-sm" placeholder="Grant a folder path, then press Return" value={path} onChange={(event) => setPath(event.target.value)} autoFocus />
            <div className="flex flex-col">
              <Button type="submit" variant="ghost" className="justify-start">Grant folder for 1 hour</Button>
              <Button type="button" variant="ghost" className="justify-start" onClick={() => { setPalette(false); void navigate({ to: "/grants" }); }}>Revoke a grant</Button>
              <Button type="button" variant="ghost" className="justify-start" onClick={() => { setPalette(false); void navigate({ to: "/agents/$agentId", params: { agentId: "claude-code" } }); }}>Jump to Claude</Button>
              <ConfirmAction
                trigger={<Button type="button" variant="ghost-destructive" className="justify-start">Revoke all</Button>}
                title="Revoke all grants?"
                description="Every agent loses the folder access it has now."
                effects={REVOKE_ALL_EFFECTS}
                confirmLabel="Revoke all"
                onConfirm={() => {
                  setPalette(false);
                  void window.leash.revokeAll();
                }}
              />
            </div>
          </form>
        </div>
      ) : null}
    </SidebarProvider>
  );
}
