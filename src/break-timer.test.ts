import { expect, it } from "vitest";
import { secondsRemaining } from "./break-timer";

it("uses elapsed time even when UI timer callbacks are delayed", () => {
  const deadline = 120_000;
  expect(secondsRemaining(deadline, 100_000)).toBe(20);
  expect(secondsRemaining(deadline, 105_800)).toBe(15);
  expect(secondsRemaining(deadline, 119_999)).toBe(1);
  expect(secondsRemaining(deadline, 120_000)).toBe(0);
  expect(secondsRemaining(deadline, 130_000)).toBe(0);
});
