import { type CxOptions, cx } from "class-variance-authority";
import { extendTailwindMerge } from "tailwind-merge";

// index.css adds text-2xs…text-5xs; unregistered, tailwind-merge drops them next to text colours.
const twMerge = extendTailwindMerge({ extend: { theme: { text: ["2xs", "3xs", "4xs", "5xs"] } } });

export function cn(...inputs: CxOptions) {
  return twMerge(cx(inputs));
}

export function isMacPlatform(platform: string): boolean {
  return /mac|iphone|ipad|ipod/i.test(platform);
}

export function isWindowsPlatform(platform: string): boolean {
  return /^win(dows)?/i.test(platform);
}
