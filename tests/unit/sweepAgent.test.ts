import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { installSweepAgent, sweepAgentPath, sweepPlist, sweepServiceTarget } from "../../src/main/helperInstall";

describe("sweep LaunchAgent", () => {
  it("runs the hook every 60s", () => {
    const plist = sweepPlist("/Apps/A & B.app", "/tmp/leash-hook.js");
    expect(plist).toContain("<string>com.agenticleash.sweep</string>");
    expect(plist).toContain("<string>/Apps/A &amp; B.app</string>");
    expect(plist).toContain("<string>--sweep</string>");
    expect(plist).toContain("<key>StartInterval</key><integer>60</integer>");
    expect(sweepServiceTarget(501)).toBe("gui/501/com.agenticleash.sweep");
  });

  it("writes a plist launchd can parse", () => {
    const home = mkdtempSync(join(tmpdir(), "al-sweep-"));
    const path = installSweepAgent("/usr/bin/true", "/tmp/leash-hook.js", home);
    expect(path).toBe(sweepAgentPath(home));
    expect(readFileSync(path, "utf8")).toBe(sweepPlist("/usr/bin/true", "/tmp/leash-hook.js"));
    execFileSync("plutil", ["-lint", path]);
  });
});
