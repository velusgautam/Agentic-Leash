import { describe, expect, it } from "vitest";
import { denyCountdown, pendingSecondsLeft } from "../../src/shared/pending";

describe("pending countdown", () => {
  it("counts down from the ask time and stops at zero", () => {
    expect(pendingSecondsLeft(1_000, 1_000, 120)).toBe(120);
    expect(pendingSecondsLeft(1_000, 31_000, 120)).toBe(90);
    expect(pendingSecondsLeft(1_000, 121_000, 120)).toBe(0);
    expect(pendingSecondsLeft(1_000, 200_000, 120)).toBe(0);
  });

  it("labels a deny countdown in minutes, then seconds", () => {
    expect(denyCountdown(120)).toBe("Denies in 2m 0s");
    expect(denyCountdown(90)).toBe("Denies in 1m 30s");
    expect(denyCountdown(12)).toBe("Denies in 12s");
    expect(denyCountdown(0)).toBe("Denies in 0s");
  });
});
