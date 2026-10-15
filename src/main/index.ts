import { join } from "node:path";
import { app, BrowserWindow, nativeTheme, shell } from "electron";

if (process.env.AGENTIC_LEASH_USER_DATA) app.setPath("userData", process.env.AGENTIC_LEASH_USER_DATA);

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
    webPreferences: { preload: join(__dirname, "../preload/index.js"), sandbox: true },
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

void app.whenReady().then(() => createWindow(true));
