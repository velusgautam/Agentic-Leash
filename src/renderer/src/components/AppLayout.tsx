import { useEffect, useState } from "react";
import { Link, Outlet, useLocation, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Settings } from "lucide-react";
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
import { AGENT_NAV, MAIN_NAV, SETTINGS_SECTIONS } from "~/nav";

function MainNav({ pathname }: { pathname: string }) {
  return (
    <>
      <SidebarGroup>
        <SidebarMenu>
          {MAIN_NAV.map(({ to, label, icon: Icon }) => (
            <SidebarMenuItem key={to}>
              <SidebarMenuButton isActive={pathname === to} render={<Link to={to} />}>
                <Icon />
                {label}
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarGroup>
      <SidebarGroup>
        <div className="px-2 pb-1 text-xs text-muted-foreground">Agents</div>
        <SidebarMenu>
          {AGENT_NAV.map(({ id, label }) => (
            <SidebarMenuItem key={id}>
              <SidebarMenuButton
                isActive={pathname === `/agents/${id}`}
                render={<Link to="/agents/$agentId" params={{ agentId: id }} />}
              >
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
    <SidebarGroup>
      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarMenuButton render={<Link to="/live" />}>
            <ArrowLeft />
            Back
          </SidebarMenuButton>
        </SidebarMenuItem>
        {SETTINGS_SECTIONS.map(({ id, label, icon: Icon }) => (
          <SidebarMenuItem key={id}>
            <SidebarMenuButton
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
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const [palette, setPalette] = useState(false);
  const [restart, setRestart] = useState(false);
  const [path, setPath] = useState("");
  const onSettings = pathname.startsWith("/settings");
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
  return (
    <SidebarProvider className="h-dvh! min-h-0!" defaultOpen>
      <Sidebar
        side="left"
        collapsible="offcanvas"
        aria-label={onSettings ? "Settings" : "Navigation"}
        resizable={{ minWidth: 208, maxWidth: 360, storageKey: "agentic-leash:sidebar-width" }}
      >
        {/* pl-20 clears the traffic lights at x=16. */}
        <SidebarHeader className="drag-region h-13 flex-row items-center pr-3 pl-20 text-sm font-medium">
          Agentic Leash
        </SidebarHeader>
        <SidebarContent>{onSettings ? <SettingsNav pathname={pathname} /> : <MainNav pathname={pathname} />}</SidebarContent>
        {onSettings ? null : (
          <SidebarFooter>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton variant="outline" className="text-destructive" onClick={() => void window.leash.revokeAll()}>
                  Revoke all
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton render={<Link to="/settings/$section" params={{ section: "general" }} />}>
                  <Settings />
                  Settings
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarFooter>
        )}
        <SidebarRail />
      </Sidebar>
      <SidebarInset className="min-h-0 overflow-auto">
        <div className="drag-region h-13 shrink-0" />
        {restart ? (
          <div className="mx-5 mb-2 flex items-center justify-between rounded-lg border border-border px-3 py-2 text-sm">
            <span>Restart needed. Start new agent sessions, or restart the running ones.</span>
            <Button size="sm" onClick={() => void window.leash.restartAgents().then(() => setRestart(false))}>
              Restart agents
            </Button>
          </div>
        ) : null}
        <Outlet />
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
              <Button type="button" variant="ghost" className="justify-start" onClick={() => { setPalette(false); void navigate({ to: "/agents/$agentId", params: { agentId: "claude-code" } }); }}>Jump to Claude Code</Button>
              <Button type="button" variant="ghost-destructive" className="justify-start" onClick={() => { setPalette(false); void window.leash.revokeAll(); }}>Revoke all</Button>
            </div>
          </form>
        </div>
      ) : null}
    </SidebarProvider>
  );
}
