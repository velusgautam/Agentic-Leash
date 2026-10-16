import { createTwoFilesPatch } from "diff";

export function unifiedPatch(path: string, before: string, after: string): string {
  const name = path.split("/").pop() || "file";
  return createTwoFilesPatch(name, name, before, after);
}
