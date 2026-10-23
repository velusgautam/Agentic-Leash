// `/` and `/Users` would grant every account on the Mac, and the home folder would grant ~/.ssh.
const floor = (parts: string[]) => (parts[0] === "Users" || parts[0] === "home" ? 3 : 1);

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
  if (root === "/" || root === "/Users" || root === "/home") return null;
  // A file right in the home folder is granted on its own.
  if (isHomeFolder(root)) return root === path ? null : path;
  return root;
}

/** Exactly `/Users/<name>` or `/home/<name>`. */
export const isHomeFolder = (path: string): boolean => /^\/(Users|home)\/[^/]+$/.test(path);

/** Parent folders shared by every path, nearest first. */
export function parentFolders(paths: string[]): string[] {
  const lists = paths.filter((path) => path.startsWith("/")).map(ancestors);
  const first = lists[0];
  if (!first || lists.some((list) => list.length === 0)) return [];
  return first.filter((dir) => lists.every((list) => list.includes(dir)));
}
