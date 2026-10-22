import { describe, expect, it } from "vitest";
import { validateRule } from "../../src/shared/rules";

const home = "/Users/v";

describe("validateRule", () => {
  it("rejects a bad kind before a blank value", () => {
    expect(validateRule({ kind: "nope", agent: "*", value: "  " }, home)).toEqual({ ok: false, error: "Pick a folder or a command." });
  });
  it("rejects an unknown agent", () => {
    expect(validateRule({ kind: "command", agent: "t3-code", value: "npm test" }, home)).toEqual({ ok: false, error: "Pick an agent." });
  });
  it("rejects a blank value", () => {
    expect(validateRule({ kind: "command", agent: "*", value: "  " }, home)).toEqual({ ok: false, error: "Enter a folder path or a command." });
  });
  it("stores a trimmed command and keeps internal spaces", () => {
    expect(validateRule({ kind: "command", agent: "cursor", value: "  npm  test  " }, home)).toEqual({ ok: true, kind: "command", agent: "cursor", value: "npm  test" });
  });
  it("rejects a relative folder and stores an absolute one", () => {
    expect(validateRule({ kind: "folder", agent: "*", value: "proj" }, home)).toEqual({ ok: false, error: "Folder path must be absolute." });
    expect(validateRule({ kind: "folder", agent: "*", value: "~/proj" }, home)).toEqual({ ok: true, kind: "folder", agent: "*", value: "/Users/v/proj" });
  });
  it("rejects / and /Users and accepts home", () => {
    expect(validateRule({ kind: "folder", agent: "*", value: "/" }, home)).toEqual({ ok: false, error: "That folder is too broad." });
    expect(validateRule({ kind: "folder", agent: "*", value: "/Users" }, home)).toEqual({ ok: false, error: "That folder is too broad." });
    expect(validateRule({ kind: "folder", agent: "*", value: "~" }, home)).toEqual({ ok: true, kind: "folder", agent: "*", value: "/Users/v" });
  });
});
