import { useEffect, useState, type CSSProperties } from "react";
import { useParams } from "@tanstack/react-router";
import { Monitor, Moon, Sun } from "lucide-react";
import licenses from "../../../../THIRD_PARTY_LICENSES.md?raw";
import type { OpenAtLoginState } from "../../../shared/bridge";
import type { Diagnostics, ThemeSource } from "../../../shared/types";
import { PageContainer, SettingsRow, SettingsSection } from "~/components/settings";
import { Button } from "~/components/ui/button";
import { Switch } from "~/components/ui/switch";
import { cn } from "~/lib/utils";
import { SETTINGS_SECTIONS } from "~/nav";
import { DEFAULT_APPEARANCE, readAppearance, saveAppearance, type AppearancePrefs } from "../appearance";

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

const THEMES = [
  { value: "system", label: "System", icon: Monitor, preview: "bg-[linear-gradient(135deg,#f5f5f4_50%,#18181b_50%)]" },
  { value: "light", label: "Light", icon: Sun, preview: "bg-[#f5f5f4]" },
  { value: "dark", label: "Dark", icon: Moon, preview: "bg-[#18181b]" },
] as const;

function Slider({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange: (value: number) => void }) {
  const ratio = (value - min) / (max - min);
  const style = { "--settings-slider-progress": `${ratio * 100}%`, "--settings-slider-fill-offset": `${0.5 - ratio}rem` } as CSSProperties;
  return (
    <div className="flex w-full items-center gap-3 sm:w-52">
      <output className="min-w-12 rounded-md bg-muted px-2 py-1 text-center font-mono text-xs font-medium tabular-nums">{value}%</output>
      <input aria-label={label} className="settings-slider min-w-0 flex-1" type="range" min={min} max={max} step={5} value={value} style={style} onChange={(event) => onChange(Number(event.currentTarget.value))} />
    </div>
  );
}

function Appearance() {
  const [theme, setTheme] = useState<ThemeSource>("system");
  const [prefs, setPrefs] = useState<AppearancePrefs>(readAppearance);
  useEffect(() => {
    void window.leash.getTheme().then(setTheme);
  }, []);
  const update = (next: Partial<AppearancePrefs>) => {
    const merged = { ...prefs, ...next };
    setPrefs(merged);
    saveAppearance(merged);
  };
  return (
    <>
      <SettingsSection title="Theme">
        <div className="grid grid-cols-3 gap-3 p-3 sm:p-4">
          {THEMES.map(({ value, label, icon: Icon, preview }) => (
            <button
              key={value}
              type="button"
              aria-label={label}
              aria-pressed={theme === value}
              onClick={() => void window.leash.setTheme(value).then(setTheme)}
              className={cn("overflow-hidden rounded-lg border text-left transition-colors", theme === value ? "border-primary ring-2 ring-primary/30" : "border-border hover:border-foreground/30")}
            >
              <div className={cn("flex h-16 items-end gap-1 p-2", preview)}>
                <span className="h-8 w-6 rounded-sm bg-[#ff8a5c]/80" />
                <span className="h-5 flex-1 rounded-sm bg-zinc-500/30" />
              </div>
              <div className="flex items-center gap-1.5 px-2.5 py-2 text-sm">
                <Icon className="size-3.5 text-muted-foreground" aria-hidden />
                {label}
              </div>
            </button>
          ))}
        </div>
      </SettingsSection>
      <SettingsSection title="Interface">
        <SettingsRow title="Contrast" description="Adjust the contrast of text and borders across the app." control={<Slider label="Contrast" value={prefs.contrast} min={50} max={200} onChange={(contrast) => update({ contrast })} />} />
        <SettingsRow title="Transparency" description="Higher values make the sidebar, menus and dialogs more solid." control={<Slider label="Glass opacity" value={prefs.glass} min={40} max={100} onChange={(glass) => update({ glass })} />} />
        <SettingsRow
          title="Density"
          description="Compact fits more rows on screen."
          control={
            <div className="inline-flex rounded-lg border border-border p-0.5">
              {(["compact", "comfortable"] as const).map((density) => (
                <button key={density} type="button" aria-pressed={prefs.density === density} onClick={() => update({ density })} className={cn("rounded-md px-2.5 py-1 text-xs capitalize", prefs.density === density ? "bg-accent font-medium" : "text-muted-foreground")}>
                  {density}
                </button>
              ))}
            </div>
          }
        />
        <SettingsRow title="Reset" description="Back to the default contrast, transparency and density." control={<Button size="sm" variant="outline" onClick={() => update(DEFAULT_APPEARANCE)}>Reset</Button>} />
      </SettingsSection>
    </>
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
