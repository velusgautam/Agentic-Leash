import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: { include: ["tests/unit/**/*.test.ts"], environment: "node", passWithNoTests: true, env: { AGENTIC_LEASH_HOME: mkdtempSync(join(tmpdir(), "al-vitest-home-")) } },
});
