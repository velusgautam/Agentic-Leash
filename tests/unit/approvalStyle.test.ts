import { describe, expect, it } from "vitest";
import { parseApprovalStyle } from "../../src/shared/approvalStyle";

describe("parseApprovalStyle", () => {
  it("defaults to popup", () => {
    expect(parseApprovalStyle("")).toBe("popup");
    expect(parseApprovalStyle("nope")).toBe("popup");
    expect(parseApprovalStyle("notification")).toBe("notification");
  });
});
