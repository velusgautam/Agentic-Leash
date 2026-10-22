import { spawnSync } from "node:child_process";
import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { helperOptimizeCommand, helperOptimizeScript, helperUninstallScript } from "../../src/main/helperInstall";

describe("helper uninstall", () => {
  it("asks for an administrator password and removes the daemon and its history", () => {
    const script = helperUninstallScript();
    expect(script).toContain("with administrator privileges");
    expect(script).toContain("/bin/launchctl bootout system");
    expect(script).toContain("/Library/LaunchDaemons/com.agenticleash.helper.plist");
    expect(script).toContain("/Library/Application Support/AgenticLeash");
    expect(script).toContain("/bin/rm -rf");
  });
});

describe("history optimization", () => {
  it("stops the helper, rebuilds history, and restarts even when rebuilding fails", () => {
    const script = helperOptimizeScript("/Applications/Agentic Leash.app/Contents/MacOS/Agentic Leash", "/app/leash-helper.js", "/Library/Application Support/AgenticLeash/history.db");
    expect(script).toContain("with administrator privileges");
    expect(script).toContain("launchctl' print system/com.agenticleash.helper");
    expect(script).toContain("launchctl' bootout system");
    expect(script).not.toContain("bootout system '/Library/LaunchDaemons/com.agenticleash.helper.plist' || true");
    expect(script).toContain("'--optimize'");
    expect(script).toContain("result=$?");
    expect(script).toContain("launchctl' bootstrap system");
    expect(script).toContain("exit $result");
    expect(script).toContain("exit $restart");
  });

  it("propagates stop, optimize, and restart failures without skipping restart after optimize", () => {
    const dir = mkdtempSync(join(tmpdir(), "al-optimize-script-"));
    const log = join(dir, "calls.log");
    const launchctl = join(dir, "launchctl");
    const optimizer = join(dir, "optimizer.sh");
    writeFileSync(launchctl, `#!/bin/sh
echo "launchctl $1" >> "$LOG"
case "$1" in
  print) exit "\${PRINT_STATUS:-0}" ;;
  bootout) exit "\${BOOTOUT_STATUS:-0}" ;;
  bootstrap) exit "\${BOOTSTRAP_STATUS:-0}" ;;
esac
`);
    writeFileSync(optimizer, `#!/bin/sh
echo "optimize $1 $2" >> "$LOG"
exit "\${OPTIMIZE_STATUS:-0}"
`);
    chmodSync(launchctl, 0o755);
    chmodSync(optimizer, 0o755);
    const command = helperOptimizeCommand("/bin/sh", optimizer, "/tmp/history db", { launchctl });
    const run = (env: Record<string, string>) => {
      writeFileSync(log, "");
      const result = spawnSync("/bin/sh", ["-c", command], { env: { ...process.env, LOG: log, ...env } });
      return { status: result.status, calls: readFileSync(log, "utf8") };
    };

    expect(run({ BOOTOUT_STATUS: "9" })).toEqual({ status: 9, calls: "launchctl print\nlaunchctl bootout\n" });
    expect(run({ OPTIMIZE_STATUS: "7" })).toEqual({ status: 7, calls: "launchctl print\nlaunchctl bootout\noptimize --optimize /tmp/history db\nlaunchctl bootstrap\n" });
    expect(run({ BOOTSTRAP_STATUS: "8" })).toEqual({ status: 8, calls: "launchctl print\nlaunchctl bootout\noptimize --optimize /tmp/history db\nlaunchctl bootstrap\n" });
  });
});
