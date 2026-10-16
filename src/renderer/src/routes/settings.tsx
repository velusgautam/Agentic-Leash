import { useEffect, useState } from "react";
import { useParams } from "@tanstack/react-router";
import licenses from "../../../../THIRD_PARTY_LICENSES.md?raw";
import type { OpenAtLoginState } from "../../../shared/bridge";
import type { Diagnostics, ThemeSource } from "../../../shared/types";
import { PageContainer, SettingsRow, SettingsSection } from "~/components/settings";
import { Button } from "~/components/ui/button";
import { Switch } from "~/components/ui/switch";
import { SETTINGS_SECTIONS } from "~/nav";

function General() {
  const [login, setLogin] = useState<OpenAtLoginState | null>(null);
  useEffect(() => {
    void window.leash.getOpenAtLogin().then(setLogin);
  }, []);
  return (
    <SettingsSection title="Startup">
      <SettingsRow
        title="Open at login"
        description={
          login?.available === false
            ? "Available in the installed app."
            : "Starts hidden in the menu bar when you log in."
        }
        control={
          <Switch
            aria-label="Open at login"
            checked={login?.enabled ?? false}
            disabled={!login?.available}
            onCheckedChange={(enabled) => void window.leash.setOpenAtLogin(enabled).then(setLogin)}
          />
        }
      />
    </SettingsSection>
  );
}

function Agents() {
  const [installed, setInstalled] = useState(false);
  useEffect(() => {
    void window.leash.hooksInstalled().then(setInstalled);
  }, []);
  return (
    <SettingsSection title="Hooks">
      <SettingsRow title="Agent hooks" description={installed ? "Installed. New sessions pick them up." : "Not installed yet."} control={<Button size="sm" onClick={() => void window.leash.installHooks().then(() => setInstalled(true))}>Install</Button>} />
      <SettingsRow title="Remove hooks" description="Removes only Agentic Leash entries. A .bak is written first." control={<Button size="sm" variant="outline" onClick={() => void window.leash.uninstallHooks().then(() => setInstalled(false))}>Uninstall</Button>} />
    </SettingsSection>
  );
}

function Monitoring() {
  return (
    <SettingsSection title="Helper">
      <SettingsRow title="File history helper" description="Installs a root LaunchDaemon that runs eslogger. macOS will ask for an administrator password." control={<Button size="sm" onClick={() => void window.leash.installHelper()}>Install helper</Button>} />
    </SettingsSection>
  );
}

function Appearance() {
  const [theme, setTheme] = useState<ThemeSource>("system");
  useEffect(() => {
    void window.leash.getTheme().then(setTheme);
  }, []);
  return (
    <SettingsSection title="Theme">
      {(["system", "light", "dark"] as const).map((value) => (
        <SettingsRow key={value} title={value[0]!.toUpperCase() + value.slice(1)} control={<input type="radio" name="theme" aria-label={value} checked={theme === value} onChange={() => void window.leash.setTheme(value).then(setTheme)} />} />
      ))}
    </SettingsSection>
  );
}

function Keybindings() {
  const rows = [["Hide to menu bar", "⌘Q"], ["Command palette", "⌘K"], ["Allow for 1 hour", "Return"], ["Presets", "1–4"], ["Deny", "Esc"], ["Revoke all", "⌃⌥⌘L"]];
  return (
    <SettingsSection title="Keybindings">
      {rows.map(([action, keys]) => <SettingsRow key={action} title={action} control={<span className="font-mono text-xs">{keys}</span>} />)}
    </SettingsSection>
  );
}

function Diagnostics() {
  const [info, setInfo] = useState<Diagnostics | null>(null);
  useEffect(() => {
    void window.leash.diagnostics().then(setInfo);
  }, []);
  return (
    <SettingsSection title="Health">
      <SettingsRow title="Hook latency" description={info ? `p50 ${info.hookP50Ms ?? "—"} ms · p95 ${info.hookP95Ms ?? "—"} ms` : "Measuring"} />
      <SettingsRow title="Helper" description={info?.helperStatus ?? "Checking"} />
      <SettingsRow title="Hooks" description={info?.hooksInstalled ? "Installed" : "Missing"} />
      <SettingsRow title="Last sweep" description={info?.lastSweep || "No sweep recorded"} />
      {(info?.gaps ?? []).map((gap) => <SettingsRow key={gap} title="Known gap" description={gap} />)}
    </SettingsSection>
  );
}

function Onboarding() {
  return (
    <SettingsSection title="First-run setup">
      <SettingsRow title="1. Install hooks" description="Merges into Claude and Cursor, and writes a .bak first." control={<Button size="sm" onClick={() => void window.leash.installHooks()}>Install hooks</Button>} />
      <SettingsRow title="2. Install the helper" description="Available from the installed app. Grants the history database to root." control={<Button size="sm" onClick={() => void window.leash.installHelper()}>Install helper</Button>} />
      <SettingsRow title="3. Full Disk Access" description="System Settings → Privacy & Security → Full Disk Access → Agentic Leash." />
      <SettingsRow title="4. Start at login" description="Use the switch in General. It turns on in the installed app." control={<Button size="sm" variant="outline" onClick={() => void window.leash.setOnboarding(true)}>Mark setup done</Button>} />
    </SettingsSection>
  );
}

function Licenses() {
  return (
    <SettingsSection title="Third-party licenses">
      <pre className="overflow-auto px-4 py-3 font-mono text-xs whitespace-pre-wrap text-muted-foreground">{licenses}</pre>
    </SettingsSection>
  );
}

export function SettingsPage() {
  const { section } = useParams({ from: "/settings/$section" });
  const entry = SETTINGS_SECTIONS.find((s) => s.id === section) ?? SETTINGS_SECTIONS[0];
  return (
    <PageContainer>
      <h1 className="px-3 text-lg font-medium sm:px-4">{entry.label}</h1>
      {entry.id === "general" ? <><General /><Onboarding /></> : entry.id === "agents" ? <Agents /> : entry.id === "monitoring" ? <Monitoring /> : entry.id === "appearance" ? <Appearance /> : entry.id === "keybindings" ? <Keybindings /> : entry.id === "diagnostics" ? <Diagnostics /> : <Licenses />}
    </PageContainer>
  );
}
