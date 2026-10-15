import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export interface UiState {
  hideNoticeShown?: boolean;
  loginItemConfigured?: boolean;
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
