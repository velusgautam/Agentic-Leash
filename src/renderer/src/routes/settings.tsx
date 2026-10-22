import { useEffect, useState, type CSSProperties } from "react";
import { useParams } from "@tanstack/react-router";
import { Monitor, Moon, Sun } from "lucide-react";
import licenses from "../../../../THIRD_PARTY_LICENSES.md?raw";
import type { IgnoredRow } from "../../../shared/ignored";
import type { HistoryOptimizationInfo, HistoryOptimizationResult, OpenAtLoginState } from "../../../shared/bridge";
import type { ApprovalStyle } from "../../../shared/approvalStyle";
import type { AgentId, Diagnostics, ThemeSource } from "../../../shared/types";
import { ConfirmAction } from "~/components/ConfirmAction";
import { AGENT_LABELS } from "~/components/Icons";
import { PageContainer, SettingsRow, SettingsSection } from "~/components/settings";
import { FullDiskControl } from "~/components/FullDiskControl";
import { SetupButton } from "~/components/SetupButton";
import { isHookAgent } from "../../../shared/setup";
import { useSetup } from "~/components/useSetup";
import { Button } from "~/components/ui/button";
import { Switch } from "~/components/ui/switch";
import { cn } from "~/lib/utils";
import { SETTINGS_SECTIONS } from "~/nav";
import { parseRetentionDays } from "../../../shared/retention";
import { DEFAULT_APPEARANCE, readAppearance, saveAppearance, type AppearancePrefs } from "../appearance";

function General() {
  const [login, setLogin] = useState<OpenAtLoginState | null>(null);
  const [style, setStyle] = useState<ApprovalStyle>("popup");
  useEffect(() => {
    void window.leash.getOpenAtLogin().then(setLogin);
    void window.leash.getApprovalStyle().then(setStyle);
  }, []);
  return (
    <>
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
    <SettingsSection title="Approvals">
      <SettingsRow
        title="Ask for approval with"
        description="Popup takes focus so you can answer right away. Notification waits in the corner with Allow 15 min and Deny buttons; requests still time out and are denied after 2 minutes. macOS must allow alerts from Agentic Leash for the buttons to show."
        control={
          <div className="flex gap-1" role="group" aria-label="Ask for approval with">
            {(["popup", "notification"] as const).map((value) => (
              <Button
                key={value}
                size="sm"
                variant={style === value ? "default" : "outline"}
                aria-pressed={style === value}
                onClick={() => {
                  setStyle(value);
                  void window.leash.setApprovalStyle(value);
                }}
              >
                {value === "popup" ? "Popup" : "Notification"}
              </Button>
            ))}
          </div>
        }
      />
    </SettingsSection>
    </>
  );
}

const UNINSTALL_EFFECTS = [
  "Removes this app's hooks from Claude, Cursor, Codex, Gemini, and Hermes.",
  "Removes the login item and the sweep agent.",
  "In the installed app, removes the history helper. macOS asks for your password.",
  "Deletes grants and settings for this app.",
  "In the installed app, moves Agentic Leash to the Trash and quits.",
];

function UninstallApp() {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <SettingsSection title="Uninstall">
      <SettingsRow
        title="Uninstall Agentic Leash"
        description={error ?? "Removes hooks, the helper, and this app's data, then quits."}
        control={
          <ConfirmAction
            trigger={<Button size="sm" variant="destructive" disabled={busy}>Uninstall</Button>}
            title="Uninstall Agentic Leash?"
            description="This app's hooks and data are removed. Your other hook settings stay."
            effects={UNINSTALL_EFFECTS}
            confirmLabel="Uninstall"
            onConfirm={() => {
              setBusy(true);
              setError(null);
              void window.leash.uninstallApp().catch((caught: unknown) => {
                setBusy(false);
                setError(caught instanceof Error ? caught.message : "Uninstall stopped.");
              });
            }}
          />
        }
      />
    </SettingsSection>
  );
}

function Agents() {
  const { status, run } = useSetup();
  const rows = (status?.agents ?? []).filter((agent) => agent.installed);
  if (!rows.length) return <SettingsSection title="Agents"><SettingsRow title="No agents on this Mac" description="Claude, Cursor, Codex, Gemini, or Hermes shows up here once it is installed." /></SettingsSection>;
  return (
    <SettingsSection title="Agents">
      {rows.map((agent) => {
        const name = AGENT_LABELS[agent.id] ?? agent.id;
        const hookId = isHookAgent(agent.id) ? agent.id : null;
        const description = agent.id === "codex"
          ? "Off hides this agent and removes its hooks. After install, run /hooks in Codex and trust Agentic Leash."
          : agent.id === "hermes"
            ? "Off hides this agent and removes its hooks. Hermes asks once to allow this hook."
            : hookId ? "Off hides this agent and removes its hooks." : "Off hides this agent. It has no hook install yet.";
        return (
          <SettingsRow
            key={agent.id}
            title={name}
            description={description}
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

function IgnoredNoises() {
  const [rows, setRows] = useState<IgnoredRow[]>([]);
  const [prefix, setPrefix] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    void window.leash.listIgnored().then(setRows);
  }, []);
  return (
    <SettingsSection title="Paths">
      <div className="px-3 py-3 sm:px-4">
        <p className="mb-3 text-xs leading-normal text-muted-foreground/80">Checked paths are left out of history. Built-in rows stay in the list.</p>
        <form
          className="flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            void window.leash.addIgnored(prefix).then((result) => {
              setRows(result.rows);
              if (result.added) {
                setPrefix("");
                setError("");
              } else setError("Use a full path, such as /tmp/scratch.");
            });
          }}
        >
          <input
            aria-label="Ignored path"
            className="h-8 min-w-0 flex-1 rounded-lg border border-border bg-background/60 px-2 font-mono text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
            placeholder="/tmp/scratch"
            value={prefix}
            onChange={(event) => setPrefix(event.target.value)}
          />
          <Button size="sm" type="submit">Add</Button>
        </form>
        {error ? <p className="mt-2 text-xs text-destructive">{error}</p> : null}
      </div>
      {rows.map((row) => (
        <SettingsRow
          key={row.id}
          title={
            <span className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-xs whitespace-pre">{row.prefix}</span>
              <span className="rounded-md bg-muted px-1.5 py-0.5 text-xs font-medium text-muted-foreground">{row.category}</span>
            </span>
          }
          description={row.builtin ? "Built in" : "Added by you"}
          control={
            <span className="flex items-center gap-2">
              {row.builtin ? null : (
                <Button size="sm" variant="outline" onClick={() => void window.leash.deleteIgnored(row.id).then(setRows)}>Delete</Button>
              )}
              <Switch aria-label={row.prefix} checked={row.enabled} onCheckedChange={(enabled) => void window.leash.setIgnored(row.id, enabled).then(setRows)} />
            </span>
          }
        />
      ))}
    </SettingsSection>
  );
}

function Monitoring() {
  const [days, setDays] = useState<{ main: number; noise: number } | null>(null);
  const [optimization, setOptimization] = useState<HistoryOptimizationInfo | null>(null);
  const [optimized, setOptimized] = useState<HistoryOptimizationResult | null>(null);
  const [optimizationError, setOptimizationError] = useState<string | null>(null);
  const [optimizing, setOptimizing] = useState(false);
  useEffect(() => {
    void window.leash.historyRetention().then(setDays);
    void window.leash.historyOptimizationInfo().then(setOptimization);
  }, []);
  const save = (which: "main" | "noise", value: number) => {
    void window.leash.setHistoryRetention(which, value).then(setDays);
  };
  const optimize = () => {
    setOptimizing(true);
    setOptimized(null);
    setOptimizationError(null);
    void window.leash.optimizeHistory().then((result) => {
      setOptimized(result);
      return window.leash.historyOptimizationInfo();
    }).then(setOptimization).catch((caught: unknown) => {
      setOptimizationError(caught instanceof Error ? caught.message : "History optimization stopped.");
    }).finally(() => setOptimizing(false));
  };
  const formatBytes = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    const units = ["KB", "MB", "GB", "TB"];
    const unit = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)) - 1, units.length - 1);
    return `${(bytes / 1024 ** (unit + 1)).toFixed(unit > 0 ? 1 : 0)} ${units[unit]}`;
  };
  const optimizationDescription = optimizationError
    ?? (optimized ? `Reduced history from ${formatBytes(optimized.beforeBytes)} to ${formatBytes(optimized.afterBytes)}.`
      : optimization?.available ? `History database is ${formatBytes(optimization.sizeBytes)}. Optimization needs up to ${formatBytes(optimization.requiredBytes)} free; ${formatBytes(optimization.freeBytes)} is available.`
        : "No history database yet.");
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
      <SettingsRow title="Noise history" description="Days to keep scratch-path writes and temporary reads. From 5 to 365." control={days ? <DayField label="Noise history days" value={days.noise} onCommit={(value) => save("noise", value)} /> : null} />
      <SettingsRow
        title="Optimize history"
        description={<span aria-live="polite">{optimizationDescription}</span>}
        control={
          <ConfirmAction
            trigger={<Button size="sm" variant="outline" disabled={optimizing || !optimization?.available || optimization.freeBytes < optimization.requiredBytes}>{optimizing ? "Optimizing…" : "Optimize history"}</Button>}
            title="Optimize history?"
            description="Agent monitoring pauses while History is rebuilt."
            effects={["Removes existing process execution rows.", "Removes duplicate snapshot storage.", "Keeps file changes, network activity, and tool decisions."]}
            confirmLabel="Optimize"
            onConfirm={optimize}
          />
        }
      />
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
  const rows = [["Hide to menu bar", "⌘Q"], ["Command palette", "⌘K"], ["Approval: pick duration", "1–4"], ["Approval: allow", "Return"], ["Approval: deny", "Esc"], ["Revoke all, no confirm", "⌃⌥⌘L"], ["Go to Live", "⌘1"], ["Go to Access", "⌘2"], ["Go to History", "⌘3"], ["Search history", "⌘F"]];
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
      {entry.id === "general" ? <><General /><UninstallApp /></> : entry.id === "agents" ? <Agents /> : entry.id === "monitoring" ? <Monitoring /> : entry.id === "ignored" ? <IgnoredNoises /> : entry.id === "appearance" ? <Appearance /> : entry.id === "keybindings" ? <Keybindings /> : entry.id === "diagnostics" ? <Diagnostics /> : <Licenses />}
    </PageContainer>
  );
}
