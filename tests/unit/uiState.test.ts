import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { readUiState, writeUiState } from "../../src/main/uiState";

describe("uiState", () => {
  it("is empty when the file is missing, and round-trips", () => {
    const dir = mkdtempSync(join(tmpdir(), "al-ui-"));
    expect(readUiState(dir)).toEqual({});
    writeUiState(dir, { hideNoticeShown: true });
    expect(readUiState(dir)).toEqual({ hideNoticeShown: true });
  });
});
