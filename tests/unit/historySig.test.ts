import { describe, expect, it } from "vitest";
import { historySig } from "../../src/shared/historySig";
import type { HistoryRow } from "../../src/shared/types";

const row = (id: number) => ({ id }) as HistoryRow;

describe("historySig", () => {
  it("is stable for identical lists and changes on add, remove or reorder of the ends", () => {
    expect(historySig([row(3), row(2)])).toBe(historySig([row(3), row(2)]));
    expect(historySig([])).toBe("0:0:0");
    expect(historySig([row(4), row(3), row(2)])).not.toBe(historySig([row(3), row(2)]));
    expect(historySig([row(3)])).not.toBe(historySig([row(3), row(2)]));
    expect(historySig([row(3), row(1)])).not.toBe(historySig([row(3), row(2)]));
  });
});
