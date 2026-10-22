import { describe, expect, it } from "vitest";
import { viewGrants } from "../../src/shared/grantView";
import type { Grant } from "../../src/shared/types";

const grant = (id: number, agent: Grant["agent"], createdAt: number, expiresAt: number | null): Grant => ({
  id,
  agent,
  path: `/p/${id}`,
  access: "read",
  source: "leash",
  command: null,
  createdAt,
  expiresAt,
});

const rows = [grant(1, "cursor", 100, 500), grant(2, "claude-code", 300, null), grant(3, "cursor", 200, 400)];

describe("viewGrants", () => {
  it("defaults to the latest approval first", () => {
    expect(viewGrants(rows, { agent: "all", sort: "approved", dir: "desc" }).map((row) => row.id)).toEqual([2, 3, 1]);
  });

  it("sorts expiry with forever last when soonest is first", () => {
    expect(viewGrants(rows, { agent: "all", sort: "expires", dir: "asc" }).map((row) => row.id)).toEqual([3, 1, 2]);
  });

  it("sorts expiry with forever first when latest is first", () => {
    expect(viewGrants(rows, { agent: "all", sort: "expires", dir: "desc" }).map((row) => row.id)).toEqual([2, 1, 3]);
  });

  it("filters to one agent", () => {
    expect(viewGrants(rows, { agent: "cursor", sort: "approved", dir: "desc" }).map((row) => row.id)).toEqual([3, 1]);
  });
});
