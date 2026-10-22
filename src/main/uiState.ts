import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { ThemeSource } from "../shared/types";

export interface UiState {
  hideNoticeShown?: boolean;
  loginItemConfigured?: boolean;
  theme?: ThemeSource;
  onboarded?: boolean;
  historySeen?: number;
  disabledAgents?: string[];
  storageWarningDismissed?: number;
}

export function readUiState(dir: string): UiState {
  try {
    return JSON.parse(readFileSync(join(dir, "ui-state.json"), "utf8")) as UiState;
  } catch {
    return {};
  }
}

export function writeUiState(dir: string, state: UiState): void {
  writeFileSync(join(dir, "ui-state.json"), JSON.stringify(state));
}
