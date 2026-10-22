import { describe, expect, it } from "vitest";
import { grantRoot, isHomeFolder, parentFolders } from "../../src/shared/parents";

describe("grantRoot", () => {
  const dirs = new Set(["/Users/velu.gautam", "/Users/velu.gautam/.cursor", "/Users/me/proj"]);
  const isDir = (path: string) => dirs.has(path);

  it("grants a dotted folder itself, not its parent", () => {
    expect(grantRoot("/Users/velu.gautam", false, isDir)).toBe("/Users/velu.gautam");
    expect(grantRoot("/Users/velu.gautam/.cursor", false, isDir)).toBe("/Users/velu.gautam/.cursor");
  });

  it("grants the folder holding a file", () => {
    expect(grantRoot("/Users/me/proj/README.md", false, isDir)).toBe("/Users/me/proj");
    expect(grantRoot("/Users/me/proj", false, isDir)).toBe("/Users/me/proj");
  });

  it("refuses / and /Users", () => {
    expect(grantRoot("/", true, isDir)).toBe(null);
    expect(grantRoot("/Users", true, isDir)).toBe(null);
    expect(grantRoot("/Users/me.txt", false, isDir)).toBe(null);
  });
});

describe("isHomeFolder", () => {
  it("is true only for the home folder itself", () => {
    expect(isHomeFolder("/Users/me")).toBe(true);
    expect(isHomeFolder("/home/me")).toBe(true);
    expect(isHomeFolder("/Users/me/proj")).toBe(false);
    expect(isHomeFolder("/Users")).toBe(false);
    expect(isHomeFolder("/tmp")).toBe(false);
  });
});

describe("parentFolders", () => {
  it("lists parents up to the home folder, nearest first", () => {
    expect(parentFolders(["/Users/me/proj/src/index.ts"])).toEqual(["/Users/me/proj/src", "/Users/me/proj", "/Users/me"]);
  });

  it("keeps only folders that cover every path", () => {
    expect(parentFolders(["/Users/me/proj/a.ts", "/Users/me/proj/src/b.ts"])).toEqual(["/Users/me/proj", "/Users/me"]);
  });

  it("offers /tmp for a file there, and nothing when the paths share no folder", () => {
    expect(parentFolders(["/tmp/foo.txt"])).toEqual(["/tmp"]);
    expect(parentFolders(["/tmp/foo.txt", "/Users/me/a.ts"])).toEqual([]);
  });
});
