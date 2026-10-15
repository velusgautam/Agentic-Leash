import { FolderLock } from "lucide-react";
import { Placeholder } from "~/components/Placeholder";

export function GrantsPage() {
  return (
    <Placeholder
      icon={FolderLock}
      title="No grants yet"
      description="Folders you let an agent use, and their time limits, show up here."
    />
  );
}
