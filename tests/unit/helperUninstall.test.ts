import { describe, expect, it } from "vitest";
import { helperUninstallScript } from "../../src/main/helperInstall";

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
