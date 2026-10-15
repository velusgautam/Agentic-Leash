import { Link, Outlet, useLocation } from "@tanstack/react-router";
import { ArrowLeft, Settings } from "lucide-react";
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
  const onSettings = pathname.startsWith("/settings");
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
        <Outlet />
      </SidebarInset>
    </SidebarProvider>
  );
}
