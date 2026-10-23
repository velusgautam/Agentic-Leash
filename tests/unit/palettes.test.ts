import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { PALETTES, paintPalette, paletteSwatch } from "../../src/shared/palettes";

const css = readFileSync(new URL("../../src/renderer/src/index.css", import.meta.url), "utf8");

describe("palettes", () => {
  it("renames the T3 palettes", () => {
    expect(PALETTES.map((palette) => palette.label)).toEqual(["Plain", "Leash", "Signal", "Clear", "Watch", "Lock"]);
    expect(paletteSwatch("plain", "light")).toBeNull();
    expect(paletteSwatch("leash", "dark")?.accent).toBe("oklch(0.762174 0.124117 52.082)");
    expect(paletteSwatch("signal", "light")?.accent).toBe("oklch(0.591646 0.217985 0.584)");
    expect(paletteSwatch("clear", "light")?.accent).toBe("oklch(0.523295 0.112292 158.089)");
    expect(paletteSwatch("watch", "dark")?.accent).toBe("oklch(0.758933 0.105833 241.548)");
    expect(paletteSwatch("lock", "light")?.accent).toBe("oklch(0.525348 0.15373 294.176)");
    expect(paletteSwatch("leash", "light")?.canvas).not.toBe(paletteSwatch("leash", "dark")?.canvas);
    expect(css).toContain('data-theme-id="leash"');
    expect(css).not.toMatch(/data-theme-id="(agentic-leash-chat|grove|ocean|ember|iris)"/);
  });

  it("paints theme variables and clears them for plain", () => {
    const props = new Map<string, string>();
    const root = {
      dataset: {} as { themeId?: string },
      style: {
        setProperty: (name: string, value: string) => props.set(name, value),
        removeProperty: (name: string) => props.delete(name),
      },
    };
    paintPalette(root, "leash", "dark");
    expect(root.dataset.themeId).toBe("leash");
    expect(props.get("--app-theme-canvas")).toBe(paletteSwatch("leash", "dark")?.canvas);
    paintPalette(root, "plain", "light");
    expect(root.dataset.themeId).toBeUndefined();
    expect(props.size).toBe(0);
  });
});
