import { useState } from "react";
import { ShieldAlert, ShieldCheck, TriangleAlert } from "lucide-react";
import { parentFolders } from "../../../shared/parents";
import { allowText, presetById, presetLabel } from "../../../shared/presets";
import type { HookRequest, PresetId, RequestPolicy, RiskLevel } from "../../../shared/types";
import { Button } from "~/components/ui/button";
import { cn } from "~/lib/utils";

// Before the main process sends a policy, offer the plain choices.
const FALLBACK: PresetId[] = ["once", "session", "today"];

export const presetsFor = (policy: RequestPolicy | undefined): PresetId[] => policy?.presets ?? FALLBACK;
export const defaultPreset = (policy: RequestPolicy | undefined): PresetId => policy?.preset ?? "session";

export const folderLabel = (path: string) => {
  const parts = path.split("/").filter(Boolean);
  return parts[0] === "Users" && parts.length === 2 ? "~" : parts.at(-1) ?? path;
};

/** Text for an allow button, naming the folder chip when one is picked. "Always in repo" ignores the chip. */
export const allowLabel = (scope: string | null, choice: PresetId, repo: string | null = null) => {
  const text = allowText(choice, repo);
  return scope && choice !== "once" && choice !== "repo" ? text.replace(/^Allow /, `Allow ${folderLabel(scope)} `) : text;
};

export const Kbd = ({ children, className }: { children: string; className?: string }) => (
  <kbd className={cn("rounded border border-current/20 px-1 font-sans text-[10px] leading-4 font-medium opacity-70", className)}>{children}</kbd>
);

const RISK: Record<RiskLevel, { label: string; className: string; Icon: typeof ShieldCheck }> = {
  low: { label: "Low risk", className: "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300", Icon: ShieldCheck },
  medium: { label: "Check this", className: "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300", Icon: TriangleAlert },
  high: { label: "High risk", className: "border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-300", Icon: ShieldAlert },
};

export function RiskNote({ policy }: { policy: RequestPolicy }) {
  const risk = RISK[policy.risk];
  return (
    <div className={cn("flex items-start gap-2 rounded-lg border px-3 py-2 text-xs", risk.className)}>
      <risk.Icon className="mt-px size-3.5 shrink-0" aria-hidden />
      <div className="min-w-0">
        <span className="font-medium">{risk.label}</span>
        {policy.reasons.length ? <span>{` · ${policy.reasons.join(" · ")}`}</span> : null}
        {policy.kind === "secret" ? <p className="mt-0.5 opacity-80">Secrets are allowed one call at a time.</p> : null}
        {policy.kind === "personal" ? <p className="mt-0.5 opacity-80">Personal folders are allowed for a short time only, and locking your Mac ends it.</p> : null}
      </div>
    </div>
  );
}

/** What is being asked for, and the optional folder chips. The choices live in `AllowButtons`. */
export function ApprovalChoices({ request, policy, scope, onScope }: { request: HookRequest; policy?: RequestPolicy; scope: string | null; onScope: (scope: string | null) => void }) {
  const folders = policy?.exact ? [] : parentFolders(request.paths);
  const target = request.command
    ? { label: "Command", value: request.command }
    : request.url
      ? { label: "URL", value: request.url }
      : { label: request.paths.length > 1 ? "Paths" : "Path", value: request.paths.join("\n") };
  return (
    <>
      {policy ? <RiskNote policy={policy} /> : null}
      <div>
        <div className="mb-1 text-[11px] font-medium text-muted-foreground">{target.label}</div>
        <pre className="max-h-24 overflow-auto rounded-lg border border-border/60 bg-muted/40 px-3 py-2 font-mono text-xs leading-relaxed break-all whitespace-pre-wrap">{target.value}</pre>
      </div>
      {folders.length ? (
        <div>
          <div className="mb-1 text-[11px] font-medium text-muted-foreground">Or allow this whole folder</div>
          <div className="flex max-h-16 flex-wrap gap-1 overflow-auto">
            {folders.map((folder) => (
              <button
                key={folder}
                type="button"
                title={folder === policy?.repo ? `${folder} — the git repo` : folder}
                aria-pressed={scope === folder}
                onClick={() => onScope(scope === folder ? null : folder)}
                className={cn(
                  "rounded-md border px-2 py-1 font-mono text-xs",
                  scope === folder ? "border-primary bg-primary/10 font-medium ring-1 ring-primary/30" : "border-border bg-background hover:bg-accent",
                )}
              >
                {folderLabel(folder)}
                {folder === policy?.repo ? <span className="ml-1 font-sans text-[10px] text-muted-foreground">repo</span> : null}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </>
  );
}

/** One click allows. The policy's default is the filled button; Enter picks it unless the request is high risk. */
export function AllowButtons({ policy, scope, disabled, showKeys, onAllow }: { policy?: RequestPolicy; scope: string | null; disabled?: boolean; showKeys?: boolean; onAllow: (id: PresetId) => void }) {
  const presets = presetsFor(policy);
  const preferred = defaultPreset(policy);
  const [hover, setHover] = useState<PresetId | null>(null);
  const explained = hover ?? preferred;
  const enterOk = policy?.risk !== "high";
  return (
    <div>
      <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${presets.length}, minmax(0, 1fr))` }}>
        {presets.map((id, index) => (
          <Button
            key={id}
            size="sm"
            variant={id === preferred ? (policy?.risk === "high" ? "destructive" : "default") : "outline"}
            disabled={disabled}
            className="h-9 min-w-0 text-sm"
            title={presetById(id).hint}
            onMouseEnter={() => setHover(id)}
            onMouseLeave={() => setHover(null)}
            onFocus={() => setHover(id)}
            onBlur={() => setHover(null)}
            onClick={() => onAllow(id)}
          >
            <span className="truncate">{presetLabel(id, policy?.repo ?? null)}</span>
            {showKeys ? <Kbd>{String(index + 1)}</Kbd> : null}
          </Button>
        ))}
      </div>
      {/* The buttons stay short; this line says exactly what the hovered or default one does. */}
      <p className="mt-1.5 min-h-4 text-xs text-muted-foreground">
        <span className="font-medium text-foreground/80">{allowLabel(scope, explained, policy?.repo ?? null)}</span>
        {` · ${presetById(explained).hint}`}
        {showKeys && explained === preferred && enterOk ? <Kbd className="ml-1.5">↵</Kbd> : null}
      </p>
    </div>
  );
}
