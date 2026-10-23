// Solid (100%) covers the window. Below that, macOS vibrancy shows through the sidebar.
export function windowVibrancy(glass: number): "sidebar" | null {
  return glass >= 100 ? null : "sidebar";
}
