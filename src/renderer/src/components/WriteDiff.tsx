import { FileDiff } from "@pierre/diffs/react";
import { parsePatchFiles } from "@pierre/diffs";
import { Component, useEffect, useMemo, useState, type ReactNode } from "react";
import { unifiedPatch } from "../../../shared/patch";
import { Button } from "~/components/ui/button";
import { cn } from "~/lib/utils";

function PlainDiff({ patch }: { patch: string }) {
  return (
    <pre className="overflow-auto p-3 font-mono text-xs">
      {patch.split("\n").map((line, index) => (
        <div key={index} className={line.startsWith("+") ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" : line.startsWith("-") ? "bg-red-500/15 text-red-700 dark:text-red-300" : undefined}>
          {line || " "}
        </div>
      ))}
    </pre>
  );
}

class DiffBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }
  render(): ReactNode {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

export function WriteDiff({ path, before, after, className }: { path: string; before: string; after: string; className?: string }) {
  const [style, setStyle] = useState<"unified" | "split">("unified");
  const [wrap, setWrap] = useState(true);
  const [dark, setDark] = useState(() => document.documentElement.classList.contains("dark"));
  useEffect(() => {
    const observer = new MutationObserver(() => setDark(document.documentElement.classList.contains("dark")));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);
  const patch = useMemo(() => unifiedPatch(path, before, after), [path, before, after]);
  const fileDiff = useMemo(() => {
    try {
      return parsePatchFiles(patch, path, true)[0]?.files[0];
    } catch {
      return undefined;
    }
  }, [patch, path]);
  if (!before && !after) return <p className="px-4 py-4 text-sm text-muted-foreground">No before or after text was captured for this write.</p>;
  if (!fileDiff || fileDiff.hunks.length === 0) return <PlainDiff patch={patch} />;
  return (
    <div className={cn("overflow-auto", className ?? "max-h-[32rem]")}>
      <div className="sticky top-0 z-10 flex gap-2 border-b border-border/50 bg-card/90 px-3 py-2">
        <Button size="sm" variant="outline" onClick={() => setStyle((value) => (value === "unified" ? "split" : "unified"))}>
          {style === "unified" ? "Split" : "Unified"}
        </Button>
        <Button size="sm" variant="outline" onClick={() => setWrap((value) => !value)}>
          {wrap ? "Scroll" : "Wrap"}
        </Button>
      </div>
      <DiffBoundary fallback={<PlainDiff patch={patch} />}>
        <FileDiff
          fileDiff={fileDiff}
          disableWorkerPool
          options={{ diffStyle: style, overflow: wrap ? "wrap" : "scroll", themeType: dark ? "dark" : "light", diffIndicators: "bars", disableFileHeader: true }}
        />
      </DiffBoundary>
    </div>
  );
}
