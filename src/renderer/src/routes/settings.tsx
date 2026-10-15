import { useParams } from "@tanstack/react-router";
import licenses from "../../../../THIRD_PARTY_LICENSES.md?raw";
import { Placeholder } from "~/components/Placeholder";
import { PageContainer, SettingsSection } from "~/components/settings";
import { SETTINGS_SECTIONS } from "~/nav";

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
      {entry.id === "licenses" ? (
        <Licenses />
      ) : (
        <Placeholder icon={entry.icon} title={entry.label} description="These settings arrive in a later milestone." />
      )}
    </PageContainer>
  );
}
