import {
  Activity,
  Bot,
  EyeOff,
  FolderLock,
  History,
  Keyboard,
  ListChecks,
  Palette,
  Radar,
  Scale,
  Settings2,
  Stethoscope,
} from "lucide-react";

export const MAIN_NAV = [
  { to: "/live", label: "Live", icon: Activity },
  { to: "/grants", label: "Grants", icon: FolderLock },
  { to: "/history", label: "History", icon: History },
] as const;

export const AGENT_NAV = [
  { id: "claude-code", label: "Claude" },
  { id: "cursor", label: "Cursor" },
  { id: "codex", label: "Codex" },
  { id: "gemini", label: "Gemini CLI" },
  { id: "hermes", label: "Hermes" },
] as const;

export const SETTINGS_SECTIONS = [
  { id: "general", label: "General", icon: Settings2 },
  { id: "agents", label: "Agents", icon: Bot },
  { id: "allow-list", label: "Allow list", icon: ListChecks },
  { id: "monitoring", label: "Monitoring", icon: Radar },
  { id: "ignored", label: "Ignored noises", icon: EyeOff },
  { id: "appearance", label: "Appearance", icon: Palette },
  { id: "keybindings", label: "Keybindings", icon: Keyboard },
  { id: "diagnostics", label: "Diagnostics", icon: Stethoscope },
  { id: "licenses", label: "Licenses", icon: Scale },
] as const;

export type SettingsSectionId = (typeof SETTINGS_SECTIONS)[number]["id"];
