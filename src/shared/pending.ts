export const POPUP_TIMEOUT_S = 120;

export function pendingSecondsLeft(askedAt: number, now: number, timeoutS: number): number {
  return Math.max(0, timeoutS - Math.floor((now - askedAt) / 1000));
}

export function denyCountdown(seconds: number): string {
  const left = Math.max(0, Math.floor(seconds));
  if (left >= 60) return `Denies in ${Math.floor(left / 60)}m ${left % 60}s`;
  return `Denies in ${left}s`;
}
