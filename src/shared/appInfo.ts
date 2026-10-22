import type { AppInfo, BuildKind } from "./types";

export function buildKind(isPackaged: boolean, rendererUrl?: string): BuildKind {
  if (isPackaged) return "release";
  return rendererUrl ? "dev" : "local";
}

export const BUILD_LABELS: Record<BuildKind, string> = {
  dev: "Development (pnpm dev)",
  local: "Local build (not packaged)",
  release: "Release",
};

export const runtimeLine = (info: AppInfo) => `Electron ${info.electron} · Chromium ${info.chrome} · Node ${info.node} · ${info.platform}`;

export const aboutText = (info: AppInfo) => `Agentic Leash ${info.version}\nBuild: ${BUILD_LABELS[info.build]}\n${runtimeLine(info)}`;
