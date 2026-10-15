import { join, resolve } from "node:path";
import { app, BrowserWindow, ipcMain, Menu, Notification, nativeTheme, shell, Tray } from "electron";
import trayIcon from "../../resources/trayTemplate.png?asset";
import type { OpenAtLoginState } from "../shared/bridge";
import { isOpenAtLogin, setOpenAtLogin } from "./loginItem";
import { appMenuTemplate, trayMenuTemplate } from "./menus";
import { readUiState, writeUiState } from "./uiState";

if (process.env.AGENTIC_LEASH_USER_DATA) app.setPath("userData", process.env.AGENTIC_LEASH_USER_DATA);

let win: BrowserWindow | null = null;
// Module scope on purpose: a garbage-collected Tray vanishes from the menu bar.
let tray: Tray | null = null;
let quitting = false;

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
  if (!app.isPackaged && process.env.ELECTRON_RENDERER_URL) void window.loadURL(process.env.ELECTRON_RENDERER_URL);
  else void window.loadFile(join(__dirname, "../renderer/index.html"));
  return window;
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

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", showWindow);
  app.on("activate", showWindow);
  // Also fires for tray Quit, Dock > Quit, logout and shutdown; those must really quit.
  app.on("before-quit", () => {
    quitting = true;
  });

  void app.whenReady().then(() => {
    registerLoginItem();
    const hidden = process.argv.includes("--hidden");
    win = createWindow(!hidden);
    win.on("close", (event) => {
      if (quitting) return;
      event.preventDefault();
      hideToMenuBar();
    });
    if (hidden) app.dock?.hide();
    Menu.setApplicationMenu(Menu.buildFromTemplate(appMenuTemplate({ hide: hideToMenuBar, dev: !app.isPackaged })));
    tray = new Tray(trayIcon);
    tray.setToolTip("Agentic Leash");
    tray.setContextMenu(Menu.buildFromTemplate(trayMenuTemplate({ open: showWindow, quit: () => app.quit() })));
  });
}
