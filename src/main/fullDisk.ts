import { closeSync, openSync, readSync } from "node:fs";

// macOS 13+ pane id. There is no API that asks for Full Disk Access.
export const FULL_DISK_URL = "x-apple.systempreferences:com.apple.settings.PrivacySecurity.extension?Privacy_AllFiles";

export function hasFullDiskAccess(dbPath: string): boolean {
  let fd: number | undefined;
  try {
    fd = openSync(dbPath, "r");
    readSync(fd, Buffer.alloc(1), 0, 1, 0);
    return true;
  } catch {
    return false;
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
}
