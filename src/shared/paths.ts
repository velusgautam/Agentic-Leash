import { homedir } from "node:os";
import { isAbsolute, normalize, resolve, sep } from "node:path";

export function expandHome(path: string, home = homedir()): string {
  if (path === "~" || path.startsWith("~/")) return home + path.slice(1);
  return path;
}

export function normalise(path: string, cwd = process.cwd(), home = homedir()): string {
  const expanded = expandHome(path, home);
  const abs = isAbsolute(expanded) ? expanded : resolve(cwd, expanded);
  const normalised = normalize(abs);
  return normalised.length > 1 && normalised.endsWith(sep) ? normalised.slice(0, -1) : normalised;
}

export function isUnder(path: string, root: string): boolean {
  const file = normalise(path);
  const base = normalise(root);
  return file === base || file.startsWith(base + sep);
}

export function isConcretePath(path: string): boolean {
  return (path.startsWith("/") || path.startsWith("~/") || path === "~") && !/[*?[\]]/.test(path);
}

function tokens(command: string): string[] {
  const out: string[] = [];
  const re = /"([^"]*)"|'([^']*)'|(\S+)/g;
  for (let match = re.exec(command); match; match = re.exec(command)) out.push(match[1] ?? match[2] ?? match[3] ?? "");
  return out;
}

export function extractShellPaths(command: string, cwd: string, home = homedir()): string[] {
  const found = [normalise(cwd, cwd, home)];
  for (const token of tokens(command)) {
    if (/^(?:\/|~\/|~$|\.\/|\.\.\/)/.test(token)) found.push(normalise(token, cwd, home));
  }
  return [...new Set(found)];
}

export function isSensitive(path: string, home = homedir()): boolean {
  const file = normalise(path, home, home);
  if (isUnder(file, joinHome(home, ".ssh")) || isUnder(file, joinHome(home, ".aws")) || isUnder(file, joinHome(home, "Library/Keychains"))) {
    return true;
  }
  const base = file.slice(file.lastIndexOf("/") + 1);
  return base === ".env" || base.startsWith(".env.");
}

function joinHome(home: string, rel: string): string {
  return normalise(`${home}/${rel}`, home, home);
}

export function skipRead(path: string, home = homedir(), extras: string[] = []): boolean {
  const file = normalise(path, home, home);
  const needles = ["node_modules", ".git/objects", ...extras];
  if (needles.some((part) => file.split("/").join("/").includes(`/${part}/`) || file.endsWith(`/${part}`))) return true;
  return isUnder(file, joinHome(home, "Library/Caches"));
}
