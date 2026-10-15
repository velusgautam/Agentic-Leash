import { useEffect, useState } from "react";
import { useParams } from "@tanstack/react-router";
import licenses from "../../../../THIRD_PARTY_LICENSES.md?raw";
import type { OpenAtLoginState } from "../../../shared/bridge";
import { Placeholder } from "~/components/Placeholder";
import { PageContainer, SettingsRow, SettingsSection } from "~/components/settings";
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
      {entry.id === "general" ? (
        <General />
      ) : entry.id === "licenses" ? (
        <Licenses />
      ) : (
        <Placeholder icon={entry.icon} title={entry.label} description="These settings arrive in a later milestone." />
      )}
    </PageContainer>
  );
}
