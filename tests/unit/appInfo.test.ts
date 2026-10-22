import { describe, expect, it } from "vitest";
import { buildKind } from "../../src/shared/appInfo";

describe("buildKind", () => {
  it("classifies dev, local and release builds", () => {
    expect(buildKind(false, "http://localhost:5173")).toBe("dev");
    expect(buildKind(false, undefined)).toBe("local");
    expect(buildKind(false, "")).toBe("local");
    expect(buildKind(true, undefined)).toBe("release");
    expect(buildKind(true, "http://localhost:5173")).toBe("release");
  });
});
