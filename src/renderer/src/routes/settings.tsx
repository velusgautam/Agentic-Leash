import { useEffect, useState, type CSSProperties } from "react";
import { useParams } from "@tanstack/react-router";
import { Monitor, Moon, Sun } from "lucide-react";
import licenses from "../../../../THIRD_PARTY_LICENSES.md?raw";
import type { AutoAllow } from "../../../shared/autoAllow";
import type { OpenAtLoginState } from "../../../shared/bridge";
import type { AgentId, Diagnostics, ThemeSource } from "../../../shared/types";
import { AGENT_LABELS } from "~/components/Icons";
import { PageContainer, SettingsRow, SettingsSection } from "~/components/settings";
import { FullDiskControl } from "~/components/FullDiskControl";
import { SetupButton } from "~/components/SetupButton";
import { useSetup } from "~/components/useSetup";
import { Button } from "~/components/ui/button";
import { Switch } from "~/components/ui/switch";
import { cn } from "~/lib/utils";
import { SETTINGS_SECTIONS } from "~/nav";
import { parseRetentionDays } from "../../../shared/retention";
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

function AutomaticAllows() {
  const [rows, setRows] = useState<(AutoAllow & { enabled: boolean })[]>([]);
  useEffect(() => {
    void window.leash.listAutoAllows().then(setRows);
  }, []);
  const groups: { agent: string; title: string }[] = [];
  for (const row of rows) {
    if (!groups.some((group) => group.agent === row.agent)) groups.push({ agent: row.agent, title: row.agent === "*" ? "Every agent" : (AGENT_LABELS[row.agent] ?? row.agent) });
  }
  if (!rows.length) return null;
  return (
    <div className="space-y-6">
      <p className="px-3 text-xs leading-normal text-muted-foreground/80 sm:px-4">Read is allowed without a prompt, at home or inside a project. Write still asks. Sensitive files still ask.</p>
      {groups.map((group) => (
        <SettingsSection key={group.agent} title={group.title}>
          {rows.filter((row) => row.agent === group.agent).map((row) => (
            <SettingsRow
              key={row.id}
              title={row.label}
              description={row.folder}
              control={<Switch aria-label={`${group.title} ${row.label}`} checked={row.enabled} onCheckedChange={(enabled) => void window.leash.setAutoAllow(row.id, enabled).then(setRows)} />}
            />
          ))}
        </SettingsSection>
      ))}
    </div>
  );
}

function Agents() {
  const { status, run } = useSetup();
  const rows = (status?.agents ?? []).filter((agent) => agent.installed);
  if (!rows.length) return <SettingsSection title="Agents"><SettingsRow title="No agents on this Mac" description="Claude, Cursor, Codex, or Gemini shows up here once it is installed." /></SettingsSection>;
  return (
    <SettingsSection title="Agents">
      {rows.map((agent) => {
        const name = AGENT_LABELS[agent.id] ?? agent.id;
        const hookId = agent.id === "claude-code" || agent.id === "cursor" ? agent.id : null;
        return (
          <SettingsRow
            key={agent.id}
            title={name}
            description={hookId ? "Off hides this agent and removes its hooks." : "Off hides this agent. It has no hook install yet."}
            control={
              <span className="flex items-center gap-2">
                {hookId ? <SetupButton kind="hook" actionKey={agent.id} done={agent.hooks === true} onClick={() => window.leash.installHooks(hookId)} /> : null}
                {hookId && agent.hooks ? <Button size="sm" variant="outline" onClick={() => run(`${agent.id}:off`, () => window.leash.uninstallHooks(hookId))}>Uninstall</Button> : null}
                <Switch aria-label={`Show ${name}`} checked={agent.enabled} onCheckedChange={(enabled) => run(`show:${agent.id}`, () => window.leash.setAgentEnabled(agent.id as AgentId, enabled))} />
              </span>
            }
          />
        );
      })}
    </SettingsSection>
  );
}

function DayField({ label, value, onCommit }: { label: string; value: number; onCommit: (days: number) => void }) {
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);
  const commit = () => {
    const days = parseRetentionDays(text.trim());
    if (days === null) {
      setText(String(value));
      return;
    }
    if (days !== value) onCommit(days);
  };
  return (
    <input
      aria-label={label}
      className="h-8 w-20 rounded-lg border border-border bg-background/60 px-2 text-right font-mono text-sm tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-ring"
      inputMode="numeric"
      value={text}
      onChange={(event) => setText(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === "Enter") event.currentTarget.blur();
      }}
    />
  );
}

function Monitoring() {
  const [days, setDays] = useState<{ main: number; noise: number } | null>(null);
  useEffect(() => {
    void window.leash.historyRetention().then(setDays);
  }, []);
  const save = (which: "main" | "noise", value: number) => {
    void window.leash.setHistoryRetention(which, value).then(setDays);
  };
  const { status } = useSetup();
  const skipped = status?.helper === "skipped";
  return (
    <SettingsSection title="Helper">
      <SettingsRow
        title="File history helper"
        description={skipped ? "Available in the installed app." : "Installs a root LaunchDaemon that runs eslogger. macOS will ask for an administrator password."}
        control={skipped ? <Button size="sm" disabled>Available in the installed app</Button> : <SetupButton kind="helper" actionKey="helper" done={status?.helper === "running"} onClick={() => window.leash.installHelper()} />}
      />
      <SettingsRow title="Full Disk Access" description="If Agentic Leash is missing from the list, click + and add Agentic Leash.app." control={<FullDiskControl />} />
      <SettingsRow title="Main history" description="Days to keep project files, network, and sensitive paths. From 5 to 365." control={days ? <DayField label="Main history days" value={days.main} onCommit={(value) => save("main", value)} /> : null} />
      <SettingsRow title="Noise history" description="Days to keep scratch-path writes, execs, and temporary reads. From 5 to 365." control={days ? <DayField label="Noise history days" value={days.noise} onCommit={(value) => save("noise", value)} /> : null} />
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
  const rows = [["Hide to menu bar", "⌘Q"], ["Command palette", "⌘K"], ["Approval: pick duration", "1–4"], ["Approval: allow", "Return"], ["Approval: deny", "Esc"], ["Revoke all, no confirm", "⌃⌥⌘L"]];
  return (
    <SettingsSection title="Keybindings">
      {rows.map(([action, keys]) => <SettingsRow key={action} title={action} control={<span className="font-mono text-xs">{keys}</span>} />)}
    </SettingsSection>
  );
}

const HOOK_STATUS = { installed: "Installed", missing: "Missing", none: "No hook" };
const VERDICT_LABEL: Record<string, string> = { pass: "Allowed", deny: "Denied", timeout: "Timed out" };

function when(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

function Diagnostics() {
  const [info, setInfo] = useState<Diagnostics | null>(null);
  useEffect(() => {
    void window.leash.diagnostics().then(setInfo);
  }, []);
  if (!info) return <SettingsSection title="Diagnostics"><SettingsRow title="Checking" /></SettingsSection>;
  const decision = info.lastDecision;
  const decisionText = decision
    ? `${AGENT_LABELS[decision.agent] ?? decision.agent} · ${decision.tool} · ${VERDICT_LABEL[decision.verdict] ?? decision.verdict}${decision.reason ? ` · ${decision.reason}` : ""} · ${when(new Date(decision.ts).toISOString())}`
    : "None yet";
  return (
    <>
      <SettingsSection title="Hooks">
        {info.hooks.map((hook) => <SettingsRow key={hook.agent} title={hook.label} description={HOOK_STATUS[hook.status]} />)}
      </SettingsSection>
      <SettingsSection title="Health">
        <SettingsRow title="Helper" description={info.helperStatus} />
        <SettingsRow title="Hook latency" description={`p50 ${info.hookP50Ms ?? "—"} ms · p95 ${info.hookP95Ms ?? "—"} ms`} />
        <SettingsRow title="Last sweep" description={info.lastSweep ? when(info.lastSweep) : "No sweep recorded"} />
        <SettingsRow title="Last decision" description={decisionText} />
      </SettingsSection>
      <SettingsSection title="Errors">
        {info.errors.length ? info.errors.map((error) => <SettingsRow key={error} title={error} />) : <SettingsRow title="None" description="Hooks and the helper are fine." />}
      </SettingsSection>
    </>
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
      {entry.id === "general" ? <><General /><AutomaticAllows /></> : entry.id === "agents" ? <Agents /> : entry.id === "monitoring" ? <Monitoring /> : entry.id === "appearance" ? <Appearance /> : entry.id === "keybindings" ? <Keybindings /> : entry.id === "diagnostics" ? <Diagnostics /> : <Licenses />}
    </PageContainer>
  );
}
