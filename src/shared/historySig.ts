import type { HistoryRow } from "./types";

export const historySig = (rows: HistoryRow[]) => `${rows.length}:${rows[0]?.id ?? 0}:${rows[rows.length - 1]?.id ?? 0}`;
