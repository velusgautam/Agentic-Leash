import type { Grant } from "./types";

export type GrantSortKey = "approved" | "expires";
export type SortDir = "asc" | "desc";

const FOREVER = Number.POSITIVE_INFINITY;

export function viewGrants(grants: Grant[], options: { agent: string; sort: GrantSortKey; dir: SortDir }): Grant[] {
  const rows = options.agent === "all" ? grants : grants.filter((grant) => grant.agent === options.agent);
  const sign = options.dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    if (options.sort === "approved") return (a.createdAt - b.createdAt) * sign || a.id - b.id;
    const left = a.expiresAt ?? FOREVER;
    const right = b.expiresAt ?? FOREVER;
    return (left - right) * sign || b.createdAt - a.createdAt;
  });
}
