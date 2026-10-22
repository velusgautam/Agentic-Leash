import { TriangleAlert } from "lucide-react";
import { isHomeFolder, parentFolders } from "../../../shared/parents";
import type { HookRequest } from "../../../shared/types";
import { cn } from "~/lib/utils";

export const PRESETS = [
  { key: "1", label: "15 min", seconds: 15 * 60 },
  { key: "2", label: "1 hour", seconds: 60 * 60 },
  { key: "3", label: "8 hours", seconds: 8 * 60 * 60 },
  { key: "4", label: "Always", seconds: null },
] as const;

export const folderLabel = (path: string) => {
  const parts = path.split("/").filter(Boolean);
  return parts[0] === "Users" && parts.length === 2 ? "~" : parts.at(-1) ?? path;
};

export const isBroad = (scope: string | null, choice: number) => scope !== null && isHomeFolder(scope) && PRESETS[choice]!.seconds === null;

export const allowLabel = (scope: string | null, choice: number) =>
  `Allow ${scope ? `${folderLabel(scope)} ` : ""}${PRESETS[choice]!.seconds === null ? "always" : `for ${PRESETS[choice]!.label}`}`;

export const Kbd = ({ children, className }: { children: string; className?: string }) => (
  <kbd className={cn("rounded border border-current/20 px-1 font-sans text-[10px] leading-4 font-medium opacity-70", className)}>{children}</kbd>
);

export function ApprovalChoices({ request, choice, onChoice, scope, onScope, showKeys }: { request: HookRequest; choice: number; onChoice: (index: number) => void; scope: string | null; onScope: (scope: string | null) => void; showKeys?: boolean }) {
  const folders = parentFolders(request.paths);
  const target = request.command
    ? { label: "Command", value: request.command }
    : request.url
      ? { label: "URL", value: request.url }
      : { label: request.paths.length > 1 ? "Paths" : "Path", value: request.paths.join("\n") };
  return (
    <>
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
                title={isHomeFolder(folder) ? `${folder} — your whole home folder` : folder}
                aria-pressed={scope === folder}
                onClick={() => onScope(scope === folder ? null : folder)}
                className={cn(
                  "rounded-md border px-2 py-1 font-mono text-xs",
                  isHomeFolder(folder)
                    ? cn("border-amber-500/50 text-amber-700 dark:text-amber-300", scope === folder ? "bg-amber-500/10 font-medium ring-1 ring-amber-500/30" : "bg-background hover:bg-accent")
                    : scope === folder ? "border-primary bg-primary/10 font-medium ring-1 ring-primary/30" : "border-border bg-background hover:bg-accent",
                )}
              >
                {folderLabel(folder)}
              </button>
            ))}
          </div>
          {scope && isHomeFolder(scope) ? (
            <p className="mt-1.5 flex items-center gap-1.5 text-xs text-amber-700 dark:text-amber-300">
              <TriangleAlert className="size-3.5 shrink-0" aria-hidden />
              Covers your whole home folder, including ~/.ssh and ~/.aws.
            </p>
          ) : null}
        </div>
      ) : null}
      <div>
        <div className="mb-1 text-[11px] font-medium text-muted-foreground">Allow for</div>
        <div role="radiogroup" aria-label="Allow for" className="grid grid-cols-4 gap-1 rounded-lg border border-border/60 bg-muted/40 p-0.5">
          {PRESETS.map((preset, index) => (
            <button
              key={preset.key}
              type="button"
              role="radio"
              aria-checked={choice === index}
              onClick={() => onChoice(index)}
              className={cn(
                "flex items-center justify-center gap-1.5 rounded-md px-2 py-1 text-xs transition-colors",
                choice === index ? "bg-background font-medium shadow-xs ring-1 ring-border" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {preset.label}
              {showKeys ? <Kbd>{preset.key}</Kbd> : null}
            </button>
          ))}
        </div>
      </div>
    </>
  );
}
