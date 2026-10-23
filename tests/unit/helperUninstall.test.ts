import { spawnSync } from "node:child_process";
import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { helperMaintenanceCommand, helperMaintenanceScript, helperUninstallScript } from "../../src/main/helperInstall";

describe("helper uninstall", () => {
  it("asks for an administrator password and removes the daemon and its history", () => {
    const script = helperUninstallScript();
    expect(script).toContain("with administrator privileges");
    expect(script).toContain("/bin/launchctl bootout system");
    expect(script).toContain("/Library/LaunchDaemons/com.agenticleash.helper.plist");
    expect(script).toContain("/Library/Application Support/AgenticLeash");
    expect(script).toContain("/bin/rm -rf");
  });

  it("stops the daemon before deleting its history and logs", () => {
    const script = helperUninstallScript();
    expect(script.indexOf("/bin/launchctl bootout system")).toBeLessThan(script.indexOf("/bin/rm -rf '/Library/Application Support/AgenticLeash'"));
  });
});

describe("history optimization", () => {
  it("stops the helper, rebuilds history, and restarts even when rebuilding fails", () => {
    const script = helperMaintenanceScript("/Applications/Agentic Leash.app/Contents/MacOS/Agentic Leash", "/app/leash-helper.js", ["--optimize", "/Library/Application Support/AgenticLeash/history.db"]);
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
    const command = helperMaintenanceCommand("/bin/sh", optimizer, ["--optimize", "/tmp/history db"], { launchctl });
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

describe("history purge", () => {
  it("quotes every purge argument and restarts the helper even when the purge fails", () => {
    const script = helperMaintenanceScript("/Applications/Agentic Leash.app/Contents/MacOS/Agentic Leash", "/app/leash-helper.js", ["--purge", "older", "/Library/Application Support/AgenticLeash/history.db", "30"]);
    expect(script).toContain("with administrator privileges");
    expect(script).toContain("'--purge' 'older' '/Library/Application Support/AgenticLeash/history.db' '30'");
    const dir = mkdtempSync(join(tmpdir(), "al-purge-script-"));
    const log = join(dir, "calls.log");
    const launchctl = join(dir, "launchctl");
    const purger = join(dir, "purger.sh");
    writeFileSync(launchctl, `#!/bin/sh
echo "launchctl $1" >> "$LOG"
`);
    writeFileSync(purger, `#!/bin/sh
echo "purge $1|$2|$3|$4" >> "$LOG"
exit 5
`);
    chmodSync(launchctl, 0o755);
    chmodSync(purger, 0o755);
    const command = helperMaintenanceCommand("/bin/sh", purger, ["--purge", "older", "/tmp/it's history", "30"], { launchctl });
    writeFileSync(log, "");
    const result = spawnSync("/bin/sh", ["-c", command], { env: { ...process.env, LOG: log } });
    expect(result.status).toBe(5);
    expect(readFileSync(log, "utf8")).toBe("launchctl print\nlaunchctl bootout\npurge --purge|older|/tmp/it's history|30\nlaunchctl bootstrap\n");
  });
});
