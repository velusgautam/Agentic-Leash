export const CAP_MIN_GB = 1;
export const CAP_MAX_GB = 1024;
export const CAP_DEFAULT_GB = 10;
export const PRUNE_START = 0.5;
export const PRUNE_STOP = 0.45;
export const SCRATCH_READ_FLOOR_DAYS = 1;
export const PROJECT_READ_FLOOR_DAYS = 7;

export function parseCapGb(value: string): number | null {
  if (!/^\d+$/.test(value.trim())) return null;
  const gb = Number(value);
  return gb < CAP_MIN_GB || gb > CAP_MAX_GB ? null : gb;
}

export function capBytes(value: string): number {
  return (parseCapGb(value) ?? CAP_DEFAULT_GB) * 1024 ** 3;
}

export interface HistoryStats {
  usedBytes: number;
  fileBytes: number;
  capBytes: number;
  counts: { table: "events" | "noise"; kind: string; sensitive: boolean; rows: number }[];
  prunedAt: number | null;
  prunedRows: number;
  hardCap: boolean;
}

export interface StorageWarning {
  step: number;
  percent: number;
  closable: boolean;
}

function usagePercent(stats: HistoryStats): number {
  return stats.capBytes > 0 ? Math.floor((stats.usedBytes * 100) / stats.capBytes) : 0;
}

export function storageWarning(stats: HistoryStats | null, dismissed: number): StorageWarning | null {
  if (!stats) return null;
  const percent = usagePercent(stats);
  if (stats.hardCap || percent >= 100) return { step: 100, percent, closable: false };
  const step = Math.floor(percent / 10) * 10;
  return step < 50 || step <= dismissed ? null : { step, percent, closable: true };
}

export function rearmDismissed(stats: HistoryStats | null, dismissed: number): number {
  return stats ? Math.min(dismissed, Math.floor((usagePercent(stats) + 10) / 10) * 10) : dismissed;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  const unit = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)) - 1, units.length - 1);
  return `${(bytes / 1024 ** (unit + 1)).toFixed(unit > 0 ? 1 : 0)} ${units[unit]}`;
}
