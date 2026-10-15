export function getLocalStorageItem(key: string): number | null {
  const raw = localStorage.getItem(key);
  const value = Number(raw);
  return raw !== null && Number.isFinite(value) ? value : null;
}

export function setLocalStorageItem(key: string, value: number): void {
  localStorage.setItem(key, String(value));
}
