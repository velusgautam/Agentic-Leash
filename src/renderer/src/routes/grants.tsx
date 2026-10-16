import { useEffect, useState } from "react";
import type { DecisionRow, Grant } from "../../../shared/types";
import { PageContainer, SettingsSection } from "~/components/settings";
import { Button } from "~/components/ui/button";

function remaining(expiresAt: number | null): string {
  if (expiresAt === null) return "Forever";
  const seconds = Math.max(0, Math.round((expiresAt - Date.now()) / 1000));
  if (seconds >= 3600) return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
  if (seconds >= 60) return `${Math.floor(seconds / 60)}m`;
  return `${seconds}s`;
}

export function GrantsPage() {
  const [grants, setGrants] = useState<Grant[]>([]);
  const [decisions, setDecisions] = useState<DecisionRow[]>([]);
  const [log, setLog] = useState(false);
  const load = () => {
    void window.leash.listGrants().then(setGrants);
    void window.leash.listDecisions().then(setDecisions);
  };
  useEffect(() => {
    load();
    const timer = window.setInterval(load, 1000);
    return () => window.clearInterval(timer);
  }, []);
  return (
    <PageContainer>
      <div className="flex items-center justify-between px-3">
        <h1 className="text-lg font-medium">Grants</h1>
        <Button size="sm" variant="outline" onClick={() => setLog((value) => !value)}>{log ? "Show grants" : "Decision log"}</Button>
      </div>
      {log ? (
        <SettingsSection title="Decisions, last 30 days">
          {decisions.length === 0 ? <p className="px-4 py-3 text-sm text-muted-foreground">No decisions yet</p> : null}
          {decisions.map((row) => (
            <div key={row.id} className="px-4 py-2 text-sm">{new Date(row.ts).toLocaleString()} · {row.agent} · {row.tool} · {row.verdict}</div>
          ))}
        </SettingsSection>
      ) : grants.length === 0 ? (
        <p className="px-3 text-sm text-muted-foreground">No grants yet</p>
      ) : (
        <SettingsSection title="Live grants">
          {grants.map((grant) => (
            <div key={grant.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
              <div>
                <div className="font-medium">{grant.path}</div>
                <div className="text-xs text-muted-foreground">{grant.agent} · {grant.access} · {grant.source} · {remaining(grant.expiresAt)}</div>
              </div>
              {grant.source === "leash" ? <Button size="sm" variant="destructive-outline" onClick={() => void window.leash.revokeGrant(grant.id).then(load)}>Revoke</Button> : null}
            </div>
          ))}
        </SettingsSection>
      )}
      <div className="px-3">
        <Button variant="destructive" onClick={() => void window.leash.revokeAll().then(load)}>Revoke all and lock down</Button>
        <Button className="ml-2" variant="outline" onClick={() => void window.leash.unlock()}>End lockdown</Button>
      </div>
    </PageContainer>
  );
}
