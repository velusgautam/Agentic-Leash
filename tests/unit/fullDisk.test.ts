import { chmodSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { hasFullDiskAccess } from "../../src/main/fullDisk";

describe("hasFullDiskAccess", () => {
  it("is granted when the protected file can be read", () => {
    const dir = mkdtempSync(join(tmpdir(), "fda-"));
    const file = join(dir, "TCC.db");
    writeFileSync(file, "x");
    expect(hasFullDiskAccess(file)).toBe(true);
  });

  it("is missing when the protected file cannot be read", () => {
    const dir = mkdtempSync(join(tmpdir(), "fda-"));
    const file = join(dir, "TCC.db");
    writeFileSync(file, "x");
    chmodSync(file, 0);
    expect(hasFullDiskAccess(file)).toBe(false);
    chmodSync(file, 0o644);
  });
});
