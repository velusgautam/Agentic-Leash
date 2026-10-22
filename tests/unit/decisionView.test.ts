import { describe, expect, it } from "vitest";
import { decisionTarget } from "../../src/shared/decisionView";

const base = { paths: "[]", command: null, url: null };

describe("decisionTarget", () => {
  it("prefers command, then url, then paths", () => {
    expect(decisionTarget({ paths: '["/a"]', command: "npm test", url: "https://x.dev" })).toBe("npm test");
    expect(decisionTarget({ paths: '["/a"]', command: null, url: "https://x.dev" })).toBe("https://x.dev");
    expect(decisionTarget({ ...base, paths: '["/a","/b"]' })).toBe("/a, /b");
  });

  it("is safe on bad json and empty paths", () => {
    expect(decisionTarget({ ...base, paths: "not json" })).toBe("not json");
    expect(decisionTarget(base)).toBe("");
  });
});
