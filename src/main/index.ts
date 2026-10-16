import { join, resolve } from "node:path";
import { app, BrowserWindow, dialog, ipcMain, Menu, Notification, nativeTheme, powerMonitor, shell, Tray } from "electron";
import appIcon from "../../resources/icon.png?asset";
import trayIcon from "../../resources/trayTemplate.png?asset";
import type { OpenAtLoginState } from "../shared/bridge";
import { isOpenAtLogin, setOpenAtLogin } from "./loginItem";
import { appMenuTemplate, trayMenuTemplate } from "./menus";
import { startRuntime } from "./runtime";
import { readUiState, writeUiState } from "./uiState";

if (process.env.AGENTIC_LEASH_USER_DATA) app.setPath("userData", process.env.AGENTIC_LEASH_USER_DATA);

let win: BrowserWindow | null = null;
let approval: BrowserWindow | null = null;
// Module scope on purpose: a garbage-collected Tray vanishes from the menu bar.
let tray: Tray | null = null;
let quitting = false;
let pendingCount = 0;
let revokeAll = (): { revoked: number } => ({ revoked: 0 });

function createWindow(visible: boolean): BrowserWindow {
  const window = new BrowserWindow({
    width: 1100,
    height: 720,
    minWidth: 840,
    minHeight: 620,
    show: false,
    title: "Agentic Leash",
    titleBarStyle: "hiddenInset",
    trafficLightPosition: { x: 16, y: 19 },
    backgroundColor: nativeTheme.shouldUseDarkColors ? "#0a0a0a" : "#ffffff",
    webPreferences: { preload: join(__dirname, "../preload/index.js"), sandbox: true, contextIsolation: true },
  });
  if (visible) window.once("ready-to-show", () => window.show());
  window.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: "deny" };
  });
  loadRenderer(window);
  return window;
}

function loadRenderer(window: BrowserWindow, hash = ""): void {
  if (!app.isPackaged && process.env.ELECTRON_RENDERER_URL) void window.loadURL(`${process.env.ELECTRON_RENDERER_URL}${hash}`);
  else void window.loadFile(join(__dirname, "../renderer/index.html"), hash ? { hash: hash.slice(1) } : undefined);
}

function refreshTray(): void {
  if (!tray) return;
  tray.setTitle(pendingCount ? String(pendingCount) : "");
  tray.setContextMenu(
    Menu.buildFromTemplate(
      trayMenuTemplate({
        open: showWindow,
        quit: () => app.quit(),
        pending: pendingCount,
        revokeAll: () => void confirmRevokeAll(),
      }),
    ),
  );
}

async function confirmRevokeAll(): Promise<void> {
  const { response } = await dialog.showMessageBox({
    type: "warning",
    message: "Revoke all grants?",
    detail: "Unmarks Claude's trusted folders (a .bak is written first), removes Cursor allow rules, deletes Agentic Leash grants, and turns lockdown on until you end it on the Grants page.",
    buttons: ["Revoke all", "Cancel"],
    defaultId: 1,
    cancelId: 1,
  });
  if (response === 0) revokeAll();
}

function closeApproval(): void {
  if (approval && !approval.isDestroyed()) approval.hide();
}

const APPROVAL_WIDTH = 520;

// A new window in a fullscreen app gets its own Space unless it is an auxiliary panel.
function presentApproval(window: BrowserWindow): void {
  if (window.isFullScreen()) window.setFullScreen(false);
  window.setFullScreenable(false);
  window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  window.setAlwaysOnTop(true, "floating");
  app.focus({ steal: true });
  window.show();
  window.focus();
}

function openApproval(): void {
  if (approval && !approval.isDestroyed()) {
    presentApproval(approval);
    return;
  }
  const bounds = tray?.getBounds() ?? { x: 0, y: 0, width: 0, height: 0 };
  approval = new BrowserWindow({
    width: APPROVAL_WIDTH,
    height: 324,
    x: Math.round(bounds.x + bounds.width / 2 - APPROVAL_WIDTH / 2),
    y: bounds.y + bounds.height + 4,
    frame: false,
    fullscreenable: false,
    alwaysOnTop: true,
    resizable: false,
    skipTaskbar: true,
    show: false,
    backgroundColor: nativeTheme.shouldUseDarkColors ? "#0a0a0a" : "#ffffff",
    webPreferences: { preload: join(__dirname, "../preload/index.js"), sandbox: true, contextIsolation: true },
  });
  loadRenderer(approval, "#/approval");
  presentApproval(approval);
  approval.on("closed", () => {
    approval = null;
  });
}

function showWindow(): void {
  if (!win) return;
  void app.dock?.show();
  win.show();
  win.focus();
}

function hideToMenuBar(): void {
  if (!win) return;
  win.hide();
  app.dock?.hide();
  const dir = app.getPath("userData");
  const state = readUiState(dir);
  if (state.hideNoticeShown) return;
  new Notification({
    title: "Agentic Leash is still running",
    body: "It stays in the menu bar. Quit from the menu bar icon.",
  }).show();
  writeUiState(dir, { ...state, hideNoticeShown: true });
}

// <bundle>.app/Contents/MacOS/<exe> → <bundle>.app
const appBundlePath = () => resolve(process.execPath, "../../..");

function loginItemState(): OpenAtLoginState {
  return { available: app.isPackaged, enabled: app.isPackaged && isOpenAtLogin() };
}

function registerLoginItem(): void {
  ipcMain.handle("login-item:get", () => loginItemState());
  ipcMain.handle("login-item:set", (_event, enabled: boolean) => {
    if (app.isPackaged) setOpenAtLogin(enabled, appBundlePath());
    return loginItemState();
  });
  const dir = app.getPath("userData");
  const state = readUiState(dir);
  if (app.isPackaged && !state.loginItemConfigured) {
    setOpenAtLogin(true, appBundlePath());
    writeUiState(dir, { ...state, loginItemConfigured: true });
  }
}

// Cmd+Q is a native terminate, so the Hide menu accelerator never sees it.
// JS app.quit() (tray Quit, tests) sets the flag first. Dock Quit is the same event as Cmd+Q.
const nativeQuit = app.quit.bind(app);
app.quit = () => {
  quitting = true;
  nativeQuit();
};

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", showWindow);
  app.on("activate", showWindow);
  app.on("before-quit", (event) => {
    if (quitting) return;
    event.preventDefault();
    hideToMenuBar();
  });

  void app.whenReady().then(() => {
    powerMonitor.on("shutdown", () => {
      quitting = true;
    });
    registerLoginItem();
    if (!app.isPackaged) app.dock?.setIcon(appIcon);
    tray = new Tray(trayIcon);
    tray.setToolTip("Agentic Leash");
    ({ revokeAll } = startRuntime({
      userData: app.getPath("userData"),
      openApproval,
      closeApproval,
      setPending: (count) => {
        pendingCount = count;
        refreshTray();
      },
      notify: (title, body) => new Notification({ title, body }).show(),
    }));
    const hidden = process.argv.includes("--hidden");
    win = createWindow(!hidden);
    win.on("close", (event) => {
      if (quitting) return;
      event.preventDefault();
      hideToMenuBar();
    });
    if (hidden) app.dock?.hide();
    Menu.setApplicationMenu(Menu.buildFromTemplate(appMenuTemplate({ hide: hideToMenuBar, dev: !app.isPackaged })));
    refreshTray();
  });
}
