import type { MenuItemConstructorOptions } from "electron";

export function appMenuTemplate({ hide, dev }: { hide: () => void; dev: boolean }): MenuItemConstructorOptions[] {
  return [
    {
      label: "Agentic Leash",
      submenu: [
        { role: "about" },
        { type: "separator" },
        { id: "hide-to-menu-bar", label: "Hide to Menu Bar", accelerator: "Command+Q", click: hide },
      ],
    },
    { role: "editMenu" },
    ...(dev ? [{ role: "viewMenu" } as const] : []),
    { role: "windowMenu" },
  ];
}

export function trayMenuTemplate({
  open,
  quit,
  pending = 0,
  revokeAll,
  review,
}: {
  open: () => void;
  quit: () => void;
  pending?: number;
  revokeAll?: () => void;
  review: () => void;
}): MenuItemConstructorOptions[] {
  return [
    { id: "open", label: "Open Agentic Leash", click: open },
    { id: "pending", label: pending ? `Pending requests (${pending})` : "Pending requests", enabled: pending > 0, click: review },
    { id: "revoke-all", label: "Revoke all", click: revokeAll },
    { type: "separator" },
    { id: "quit", label: "Quit Agentic Leash", click: quit },
  ];
}
