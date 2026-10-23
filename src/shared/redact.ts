import { createHash } from "node:crypto";

const MASK = "••••";

// A short tag per value, so a diff still shows which line changed. Four hex digits can't be reversed.
function tag(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 4);
}

/**
 * Hides the values in a secret file but keeps its shape: `KEY=value` keeps the key,
 * private key blocks collapse to one line, and other lines are masked.
 */
export function redactSecretText(text: string): string {
  const out: string[] = [];
  let inKey = false;
  for (const line of text.split("\n")) {
    if (/-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(line)) {
      inKey = true;
      out.push(`[private key ${MASK}]`);
      continue;
    }
    if (inKey) {
      if (/-----END [A-Z ]*PRIVATE KEY-----/.test(line)) inKey = false;
      continue;
    }
    if (!line.trim() || /^\s*[#;]/.test(line) || /^\s*\[[^\]]*\]\s*$/.test(line)) {
      out.push(line);
      continue;
    }
    const pair = /^(\s*(?:export\s+)?[\w.\-"']+\s*[=:]\s*)(.*)$/.exec(line);
    if (pair) out.push(pair[2] ? `${pair[1]}${MASK} ${tag(pair[2])}` : line);
    else out.push(`${MASK} ${tag(line)}`);
  }
  return out.join("\n");
}
