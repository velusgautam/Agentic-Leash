export type RevokePreset = "hour" | "tonight" | "tomorrow";

export function revokeDue(preset: RevokePreset, now = new Date()): number {
  if (preset === "hour") return now.getTime() + 60 * 60 * 1000;
  if (preset === "tonight") {
    const due = new Date(now);
    due.setHours(23, 59, 0, 0);
    if (due.getTime() <= now.getTime()) due.setDate(due.getDate() + 1);
    return due.getTime();
  }
  const due = new Date(now);
  due.setDate(due.getDate() + 1);
  due.setHours(9, 0, 0, 0);
  return due.getTime();
}
