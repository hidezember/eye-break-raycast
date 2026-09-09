import { describe, expect, it } from "vitest";
import { FOCUS_SECONDS, REST_IDLE_SECONDS, TrackerState, updateTracker } from "./tracker";

const NOW = 2_000_000;

function state(activeSeconds: number, elapsedSeconds = 60): TrackerState {
  return { activeSeconds, lastCheckedAt: NOW - elapsedSeconds * 1000 };
}

describe("updateTracker", () => {
  it("starts a fresh session without counting an unknown interval", () => {
    expect(updateTracker(undefined, { now: NOW, idleSeconds: 0, isScreenLocked: false })).toEqual({
      state: { activeSeconds: 0, lastCheckedAt: NOW },
      shouldRemind: false,
    });
  });

  it("counts time when input happened within the last minute", () => {
    const result = updateTracker(state(120), { now: NOW, idleSeconds: 15, isScreenLocked: false });
    expect(result.state.activeSeconds).toBe(180);
  });

  it("pauses counting during a short idle period", () => {
    const result = updateTracker(state(120), { now: NOW, idleSeconds: 90, isScreenLocked: false });
    expect(result.state.activeSeconds).toBe(120);
  });

  it("resets after five minutes without input", () => {
    const result = updateTracker(state(900), {
      now: NOW,
      idleSeconds: REST_IDLE_SECONDS,
      isScreenLocked: false,
    });
    expect(result.state.activeSeconds).toBe(0);
  });

  it("resets when the screen is locked", () => {
    const result = updateTracker(state(900), { now: NOW, idleSeconds: 0, isScreenLocked: true });
    expect(result.state.activeSeconds).toBe(0);
  });

  it("treats a long scheduling gap as sleep or a break", () => {
    const result = updateTracker(state(900, REST_IDLE_SECONDS), {
      now: NOW,
      idleSeconds: 0,
      isScreenLocked: false,
    });
    expect(result.state.activeSeconds).toBe(0);
  });

  it("triggers at 30 active minutes and waits for the break to reset the counter", () => {
    const result = updateTracker(state(FOCUS_SECONDS - 60), {
      now: NOW,
      idleSeconds: 10,
      isScreenLocked: false,
    });
    expect(result).toEqual({
      state: { activeSeconds: FOCUS_SECONDS, lastCheckedAt: NOW },
      shouldRemind: true,
    });
  });

  it("does not interrupt an idle user when a reminder is already due", () => {
    const result = updateTracker(state(FOCUS_SECONDS), { now: NOW, idleSeconds: 120, isScreenLocked: false });
    expect(result.shouldRemind).toBe(false);
    expect(result.state.activeSeconds).toBe(FOCUS_SECONDS);
  });

  it("resets after a short sleep between two otherwise active samples", () => {
    const result = updateTracker(state(FOCUS_SECONDS - 60), {
      now: NOW,
      idleSeconds: 0,
      isScreenLocked: false,
      lastWakeAt: NOW - 10_000,
    });
    expect(result.shouldRemind).toBe(false);
    expect(result.state.activeSeconds).toBe(0);
  });

  it("discards accumulated time after the system clock moves backwards", () => {
    const result = updateTracker(state(FOCUS_SECONDS, -60), { now: NOW, idleSeconds: 0, isScreenLocked: false });
    expect(result.state.activeSeconds).toBe(0);
    expect(result.shouldRemind).toBe(false);
  });

  it("applies a completed break even if a background write happened after completion", () => {
    const previous = { ...state(FOCUS_SECONDS, 10), lastCompletedBreakAt: 0 };
    const result = updateTracker(previous, { now: NOW, idleSeconds: 0, isScreenLocked: false }, NOW - 20_000);
    expect(result.state.activeSeconds).toBe(0);
    expect(result.state.lastCompletedBreakAt).toBe(NOW - 20_000);
    expect(result.shouldRemind).toBe(false);
  });

  it("applies the same completed break only once", () => {
    const completedAt = NOW - 120_000;
    const previous = { ...state(60), lastCompletedBreakAt: completedAt };
    const result = updateTracker(previous, { now: NOW, idleSeconds: 0, isScreenLocked: false }, completedAt);
    expect(result.state.activeSeconds).toBe(120);
  });

  it("does not count duplicate checks twice", () => {
    const sample = { now: NOW, idleSeconds: 0, isScreenLocked: false };
    const first = updateTracker(state(60), sample);
    const second = updateTracker(first.state, sample);
    expect(second.state.activeSeconds).toBe(first.state.activeSeconds);
  });

  it("consumes a resume marker once, then accumulates on following samples", () => {
    const sample = { now: NOW, idleSeconds: 0, isScreenLocked: false };
    const first = updateTracker(state(1700), sample, undefined, NOW - 1000);
    expect(first.state.activeSeconds).toBe(0);
    const next = updateTracker(first.state, { ...sample, now: NOW + 60_000 }, undefined, NOW - 1000);
    expect(next.state.activeSeconds).toBe(60);
  });
});
