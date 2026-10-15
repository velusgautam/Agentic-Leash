import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { isOpenAtLogin, loginAgentPath, loginAgentPlist, setOpenAtLogin } from "../../src/main/loginItem";

const APP = "/Applications/Agentic Leash.app";

describe("loginAgentPlist", () => {
  it("opens the app hidden in the background", () => {
    const plist = loginAgentPlist(APP);
    expect(plist).toContain("<string>com.agenticleash.app</string>");
    expect(plist).toContain(`<string>${APP}</string>`);
    expect(plist).toMatch(/<string>-g<\/string>[\s\S]*<string>--args<\/string>\s*<string>--hidden<\/string>/);
    expect(plist).toContain("<key>RunAtLoad</key><true/>");
  });

  it("escapes XML in the app path", () => {
    expect(loginAgentPlist("/Apps/A & B.app")).toContain("<string>/Apps/A &amp; B.app</string>");
  });
});

describe("setOpenAtLogin", () => {
  it("writes a valid plist, then removes it", () => {
    const home = mkdtempSync(join(tmpdir(), "al-home-"));
    expect(isOpenAtLogin(home)).toBe(false);
    setOpenAtLogin(true, APP, home);
    const path = loginAgentPath(home);
    expect(path).toBe(join(home, "Library/LaunchAgents/com.agenticleash.app.plist"));
    expect(readFileSync(path, "utf8")).toBe(loginAgentPlist(APP));
    execFileSync("plutil", ["-lint", path]);
    expect(isOpenAtLogin(home)).toBe(true);
    setOpenAtLogin(false, APP, home);
    expect(existsSync(path)).toBe(false);
  });
});
