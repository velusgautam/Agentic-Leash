import { writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export function helperPlist(execPath: string, scriptPath: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>com.agenticleash.helper</string>
  <key>ProgramArguments</key><array>
    <string>${execPath}</string>
    <string>${scriptPath}</string>
  </array>
  <key>EnvironmentVariables</key><dict><key>ELECTRON_RUN_AS_NODE</key><string>1</string></dict>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
</dict></plist>
`;
}

export function sweepPlist(execPath: string, scriptPath: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>com.agenticleash.sweep</string>
  <key>ProgramArguments</key><array>
    <string>${execPath}</string>
    <string>${scriptPath}</string>
    <string>--sweep</string>
  </array>
  <key>EnvironmentVariables</key><dict><key>ELECTRON_RUN_AS_NODE</key><string>1</string></dict>
  <key>StartInterval</key><integer>60</integer>
  <key>RunAtLoad</key><true/>
</dict></plist>
`;
}

export function helperInstallScript(execPath: string, scriptPath: string): string {
  const plist = "/Library/LaunchDaemons/com.agenticleash.helper.plist";
  const body = helperPlist(execPath, scriptPath).replaceAll('"', '\\"');
  return `do shell script "mkdir -p '/Library/Application Support/AgenticLeash' && printf '%s' \\"${body}\\" > '${plist}' && launchctl bootstrap system '${plist}'" with administrator privileges`;
}

export function installSweepAgent(execPath: string, scriptPath: string): void {
  const path = join(homedir(), "Library/LaunchAgents/com.agenticleash.sweep.plist");
  writeFileSync(path, sweepPlist(execPath, scriptPath));
}
