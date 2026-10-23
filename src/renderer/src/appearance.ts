import { isPalette, paintPalette, type PaletteId } from "../../shared/palettes";

export type Density = "compact" | "comfortable";
export interface AppearancePrefs {
  contrast: number;
  glass: number;
  density: Density;
  palette: PaletteId;
}

const KEY = "agentic-leash:appearance";
export const DEFAULT_APPEARANCE: AppearancePrefs = { contrast: 100, glass: 80, density: "comfortable", palette: "plain" };

export function readAppearance(): AppearancePrefs {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) ?? "{}") as Partial<AppearancePrefs>;
    return { ...DEFAULT_APPEARANCE, ...parsed, palette: isPalette(parsed.palette) ? parsed.palette : DEFAULT_APPEARANCE.palette };
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
  paintPalette(root, prefs.palette, root.classList.contains("dark") ? "dark" : "light");
  void window.leash.setGlass(prefs.glass);
}

export function saveAppearance(prefs: AppearancePrefs): void {
  localStorage.setItem(KEY, JSON.stringify(prefs));
  applyAppearance(prefs);
}
