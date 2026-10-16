export type Density = "compact" | "comfortable";
export interface AppearancePrefs {
  contrast: number;
  glass: number;
  density: Density;
}

const KEY = "agentic-leash:appearance";
export const DEFAULT_APPEARANCE: AppearancePrefs = { contrast: 100, glass: 80, density: "comfortable" };

export function readAppearance(): AppearancePrefs {
  try {
    return { ...DEFAULT_APPEARANCE, ...JSON.parse(localStorage.getItem(KEY) ?? "{}") };
  } catch {
    return DEFAULT_APPEARANCE;
  }
}

// Contrast below 100% fades toward the background. Above 100% it pushes toward black or white.
export function applyAppearance(prefs: AppearancePrefs): void {
  const root = document.documentElement;
  root.style.setProperty("--appearance-contrast-base", `${Math.min(prefs.contrast, 100)}%`);
  root.style.setProperty("--appearance-contrast-boost", `${Math.max(prefs.contrast - 100, 0)}%`);
  root.style.setProperty("--appearance-contrast-border-boost", `${Math.max(prefs.contrast - 100, 0) / 4}%`);
  root.style.setProperty("--glass-opacity", `${prefs.glass}%`);
  root.dataset.density = prefs.density;
}

export function saveAppearance(prefs: AppearancePrefs): void {
  localStorage.setItem(KEY, JSON.stringify(prefs));
  applyAppearance(prefs);
}
