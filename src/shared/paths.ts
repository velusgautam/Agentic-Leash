import { homedir } from "node:os";
import { isAbsolute, normalize, resolve, sep } from "node:path";
import { isSecretName, secretKind } from "./sensitive";

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

export interface ShellWord {
  text: string;
  op: boolean;
}

const OPERATORS = ["2>&1", "2>>", "2>", "&>", "&&", "||", ">>", ";", "|", "&", ">", "<", "(", ")", "\n", "`", "$("];

/** Splits a shell line into words and operators. Quotes are dropped from word text. */
export function shellWords(command: string): ShellWord[] {
  const out: ShellWord[] = [];
  let word = "";
  let open = false;
  const flush = () => {
    if (open) out.push({ text: word, op: false });
    word = "";
    open = false;
  };
  for (let index = 0; index < command.length; ) {
    const char = command[index]!;
    if (char === "'" || char === '"') {
      const end = command.indexOf(char, index + 1);
      const stop = end < 0 ? command.length : end;
      word += command.slice(index + 1, stop);
      open = true;
      index = stop + 1;
      continue;
    }
    if (char === "\\" && index + 1 < command.length) {
      word += command[index + 1];
      open = true;
      index += 2;
      continue;
    }
    // `2>` is a redirect only at the start of a word; `a2>b` is not.
    const op = OPERATORS.find((item) => command.startsWith(item, index) && (!open || item[0] !== "2"));
    if (op) {
      flush();
      out.push({ text: op, op: true });
      index += op.length;
      continue;
    }
    if (/\s/.test(char)) {
      flush();
      index += 1;
      continue;
    }
    word += char;
    open = true;
    index += 1;
  }
  flush();
  return out;
}

function expandVars(word: string, home: string): string {
  return word.replace(/^(?:\$HOME|\$\{HOME\})(?=\/|$)/, home);
}

/** Drops sentence and code punctuation stuck to the end of a path. A lone `.`, `..`, and `../..` stay. */
function trimTail(word: string): string {
  let end = word.length;
  while (end > 1) {
    const last = word[end - 1]!;
    const prev = word[end - 2]!;
    if (!(/[,;:)\]}'"`]/.test(last) || (last === "." && prev !== "/" && prev !== "."))) break;
    end -= 1;
  }
  const out = word.slice(0, end);
  return out === "/" ? word : out;
}

/** A `$` left in a path is a variable this tool cannot resolve, so no grant can safely name it. */
export const hasUnresolved = (paths: string[]): boolean => paths.some((path) => path.includes("$"));

// Paths inside a larger word, like `--file=/etc/x` or `open('/Users/me/.ssh/id_rsa')`.
const EMBEDDED = /(?:^|[=:,(\s'"`])((?:~|\$HOME|\$\{HOME\})?\/[^\s'"`;|&()<>,]+)/g;

/**
 * The working directory plus every path a shell line names. It follows `cd`, `$HOME`,
 * bare relative names like `.env`, and paths embedded in quoted code. Variables and
 * decoded strings are out of reach, so this narrows what a shell can do; it is not a sandbox.
 */
export function extractShellPaths(command: string, cwd: string, home = homedir()): string[] {
  const found = [normalise(cwd, cwd, home)];
  let here = normalise(cwd, cwd, home);
  let first = true;
  let afterCd = false;
  for (const { text, op } of shellWords(command)) {
    if (op) {
      first = true;
      afterCd = false;
      continue;
    }
    const word = trimTail(expandVars(text, home));
    let path: string | null = null;
    if (/^(?:\/|~\/|~$|\.\/|\.\.\/|\.\.$)/.test(word)) path = normalise(word, here, home);
    else if (!first && /^[^-'"`()=$<>|&;\s][^'"`()=$<>|&;\s]*$/.test(word) && !word.includes("://") && (word.startsWith(".") || word.includes("/") || isSecretName(word))) {
      path = normalise(word, here, home);
    } else {
      for (const match of word.matchAll(EMBEDDED)) {
        const hit = trimTail(expandVars(match[1]!, home));
        if (!hit.startsWith("//")) found.push(normalise(hit, here, home));
      }
    }
    if (afterCd && !path && !word.startsWith("-") && !word.includes("$")) path = normalise(word, here, home);
    if (path) found.push(path);
    if (afterCd && path) here = path;
    afterCd = first && word === "cd";
    first = false;
  }
  return [...new Set(found)].filter((path) => path !== "/dev/null");
}

export function isSensitive(path: string, home = homedir()): boolean {
  return secretKind(normalise(path, home, home), home) !== null;
}

/** Why a path counts as secret, for the popup and History. */
export function secretLabel(path: string, home = homedir()): string | null {
  return secretKind(normalise(path, home, home), home);
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
