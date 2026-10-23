import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { windowVibrancy } from "../../src/shared/windowGlass";

const css = readFileSync(new URL("../../src/renderer/src/index.css", import.meta.url), "utf8");
const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

describe("appearance glass", () => {
  it("uses macOS vibrancy only while the sidebar is not solid", () => {
    expect(windowVibrancy(40)).toBe("sidebar");
    expect(windowVibrancy(80)).toBe("sidebar");
    expect(windowVibrancy(100)).toBeNull();
  });

  it("mixes the sidebar fill with the transparency setting", () => {
    expect(css).toMatch(/\[data-slot="sidebar-inner"\][\s\S]*?var\(--glass-opacity\)/);
  });

  it("lets vibrancy show through the page background", () => {
    expect(css).toMatch(/html,\s*body\s*\{[^}]*background-color:\s*transparent/);
  });

  it("paints menus and dialogs with the glass utilities", () => {
    expect(read("../../src/renderer/src/components/ConfirmAction.tsx")).toContain("dialog-glass");
    expect(read("../../src/renderer/src/components/WelcomeDialog.tsx")).toContain("dialog-glass");
    expect(read("../../src/renderer/src/components/AppLayout.tsx")).toContain("dropdown-glass");
    expect(read("../../src/renderer/src/routes/agent.tsx")).toContain("dropdown-glass");
  });
});
