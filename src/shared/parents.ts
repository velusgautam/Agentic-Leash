// `/` and `/Users` would grant every account on the Mac.
const floor = (parts: string[]) => (parts[0] === "Users" || parts[0] === "home" ? 2 : 1);

function ancestors(file: string): string[] {
  const parts = file.split("/").filter(Boolean);
  if (parts.length < 2) return [];
  const min = floor(parts);
  const out: string[] = [];
  for (let count = parts.length - 1; count >= min; count -= 1) out.push(`/${parts.slice(0, count).join("/")}`);
  return out;
}

export function grantRoot(path: string, exact: boolean, isDir: (path: string) => boolean): string | null {
  const root = exact || isDir(path) ? path : path.slice(0, path.lastIndexOf("/")) || "/";
  return root === "/" || root === "/Users" ? null : root;
}

/** Parent folders shared by every path, nearest first. */
export function parentFolders(paths: string[]): string[] {
  const lists = paths.filter((path) => path.startsWith("/")).map(ancestors);
  const first = lists[0];
  if (!first || lists.some((list) => list.length === 0)) return [];
  return first.filter((dir) => lists.every((list) => list.includes(dir)));
}
