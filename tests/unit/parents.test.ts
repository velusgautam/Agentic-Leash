import { describe, expect, it } from "vitest";
import { parentFolders } from "../../src/shared/parents";

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
