import { describe, expect, it } from "vitest";
import type { ApprovalRow } from "../../src/shared/db";
import { suggestRules } from "../../src/shared/suggestions";
import type { Grant } from "../../src/shared/types";

const NOW = 100 * 86_400_000;
const DAY = 86_400_000;
const ap = (over: Partial<ApprovalRow> = {}): ApprovalRow => ({ ts: NOW - 1000, agent: "cursor", path: "/p", command: null, access: "write", ttlSeconds: 900, ...over });
const many = (n: number, over: Partial<ApprovalRow> = {}) => Array.from({ length: n }, (_, i) => ap({ ts: NOW - 1000 * (i + 1), ...over }));
const grant = (over: Partial<Grant> = {}): Grant => ({ id: 1, agent: "cursor", path: "/p", access: "write", source: "leash", createdAt: 0, expiresAt: null, command: null, ...over });

describe("suggestRules", () => {
  it("suggests after three approvals", () => {
    const [item] = suggestRules(many(3), [], [], NOW);
    expect(item).toMatchObject({ key: "cursor|write|/p|", agent: "cursor", path: "/p", command: null, access: "write", count: 3, lastAt: NOW - 1000 });
    expect(suggestRules(many(2), [], [], NOW)).toEqual([]);
  });
  it("ignores forever approvals and old ones", () => {
    expect(suggestRules(many(3, { ttlSeconds: null }), [], [], NOW)).toEqual([]);
    expect(suggestRules(many(3, { ts: NOW - 15 * DAY }), [], [], NOW)).toEqual([]);
  });
  it("separates by agent, access and path", () => {
    const rows = [...many(2), ...many(2, { agent: "codex" }), ...many(2, { access: "read" }), ...many(2, { path: "/q" })];
    expect(suggestRules(rows, [], [], NOW)).toEqual([]);
  });
  it("groups commands", () => {
    const [item] = suggestRules(many(3, { path: null, command: "make build" }), [], [], NOW);
    expect(item).toMatchObject({ key: "cursor|write||make build", command: "make build", path: null });
  });
  it("skips groups covered by a forever grant", () => {
    expect(suggestRules(many(3), [grant()], [], NOW)).toEqual([]);
    expect(suggestRules(many(3), [grant({ agent: "*" })], [], NOW)).toEqual([]);
    expect(suggestRules(many(3, { access: "read" }), [grant()], [], NOW)).toEqual([]);
    expect(suggestRules(many(3, { path: null, command: "x" }), [grant({ path: "", command: "x" })], [], NOW)).toEqual([]);
  });
  it("keeps groups with only partial cover", () => {
    expect(suggestRules(many(3), [grant({ expiresAt: NOW + 1000 })], [], NOW)).toHaveLength(1);
    expect(suggestRules(many(3), [grant({ agent: "codex" })], [], NOW)).toHaveLength(1);
    expect(suggestRules(many(3), [grant({ path: "/other" })], [], NOW)).toHaveLength(1);
    expect(suggestRules(many(3, { access: "write" }), [grant({ access: "read" })], [], NOW)).toHaveLength(1);
    expect(suggestRules(many(3, { path: null, command: "x" }), [grant({ path: "/x" })], [], NOW)).toHaveLength(1);
  });
  it("honours dismissed keys", () => {
    expect(suggestRules(many(3), [], ["cursor|write|/p|"], NOW)).toEqual([]);
  });
  it("sorts by count then recency and caps at five", () => {
    const rows = [...many(3, { path: "/a" }), ...many(4, { path: "/b", ts: NOW - 5 * DAY }), ...many(3, { path: "/c", ts: NOW - 2 * DAY })];
    expect(suggestRules(rows, [], [], NOW).map((item) => item.path)).toEqual(["/b", "/a", "/c"]);
    const lots = Array.from({ length: 7 }, (_, i) => many(3, { path: `/d${i}` })).flat();
    expect(suggestRules(lots, [], [], NOW)).toHaveLength(5);
  });
});
