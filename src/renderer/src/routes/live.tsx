import { Activity } from "lucide-react";
import { Placeholder } from "~/components/Placeholder";

export function LivePage() {
  return (
    <Placeholder
      icon={Activity}
      title="Live activity"
      description="File reads, writes and commands from your agents show up here once monitoring is on."
    />
  );
}
