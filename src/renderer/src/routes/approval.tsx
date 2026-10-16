import { useEffect, useState } from "react";
import type { PendingRequest } from "../../../shared/types";
import { Button } from "~/components/ui/button";

const PRESETS = [
  { key: "1", label: "15 min", seconds: 15 * 60 },
  { key: "2", label: "1 hour", seconds: 60 * 60 },
  { key: "3", label: "8 hours", seconds: 8 * 60 * 60 },
  { key: "4", label: "Forever", seconds: null },
] as const;

export function ApprovalPage() {
  const [pending, setPending] = useState<PendingRequest[]>([]);
  const load = () => void window.leash.listPending().then(setPending);
  useEffect(() => {
    load();
    const timer = window.setInterval(load, 300);
    return () => window.clearInterval(timer);
  }, []);
  const current = pending[0];
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!current) return;
      if (event.key === "Enter") void window.leash.decidePending(current.id, "allow", 3600);
      if (event.key === "Escape") void window.leash.decidePending(current.id, "deny", null);
      const preset = PRESETS.find((item) => item.key === event.key);
      if (preset) void window.leash.decidePending(current.id, "allow", preset.seconds);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [current]);
  if (!current) return <p className="p-4 text-sm">No requests waiting.</p>;
  return (
    <div className="flex h-dvh flex-col gap-3 p-4">
      <h1 className="text-sm font-medium">{current.request.agent} wants {current.request.access} access</h1>
      <p className="text-xs text-muted-foreground">{current.request.tool} {current.request.command || current.request.paths.join(", ") || current.request.url || ""}</p>
      <div className="mt-auto flex flex-wrap gap-2">
        {PRESETS.map((preset) => (
          <Button key={preset.key} size="sm" onClick={() => void window.leash.decidePending(current.id, "allow", preset.seconds)}>{preset.key} {preset.label}</Button>
        ))}
        <Button size="sm" variant="destructive" onClick={() => void window.leash.decidePending(current.id, "deny", null)}>Deny</Button>
      </div>
    </div>
  );
}
