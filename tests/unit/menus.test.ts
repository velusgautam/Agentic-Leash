import type { MenuItemConstructorOptions } from "electron";
import { describe, expect, it, vi } from "vitest";
import { appMenuTemplate, trayMenuTemplate } from "../../src/main/menus";

const click = (item: MenuItemConstructorOptions | undefined) => item?.click?.({} as never, undefined, {} as never);

describe("appMenuTemplate", () => {
  it("binds Command+Q to hide, and has no quit role", () => {
    const hide = vi.fn();
    const items = appMenuTemplate({ hide, dev: false })[0]!.submenu as MenuItemConstructorOptions[];
    expect(items.some((i) => i.role === "quit")).toBe(false);
    const item = items.find((i) => i.accelerator === "Command+Q");
    expect(item?.id).toBe("hide-to-menu-bar");
    click(item);
    expect(hide).toHaveBeenCalledOnce();
  });

  it("adds the View menu only in development", () => {
    expect(appMenuTemplate({ hide: vi.fn(), dev: true }).some((m) => m.role === "viewMenu")).toBe(true);
    expect(appMenuTemplate({ hide: vi.fn(), dev: false }).some((m) => m.role === "viewMenu")).toBe(false);
  });
});

describe("trayMenuTemplate", () => {
  it("opens from Open and quits only from Quit", () => {
    const actions = { open: vi.fn(), quit: vi.fn() };
    const items = trayMenuTemplate(actions);
    click(items.find((i) => i.id === "open"));
    expect(actions.open).toHaveBeenCalledOnce();
    expect(actions.quit).not.toHaveBeenCalled();
    const quit = items.find((i) => i.id === "quit");
    expect(quit?.label).toBe("Quit Agentic Leash");
    click(quit);
    expect(actions.quit).toHaveBeenCalledOnce();
  });
});
