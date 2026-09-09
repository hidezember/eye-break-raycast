import { beforeEach, describe, expect, it, vi } from "vitest";

const { getItem, setItem } = vi.hoisted(() => ({ getItem: vi.fn(), setItem: vi.fn() }));
vi.mock("@raycast/api", () => ({ LocalStorage: { getItem, setItem } }));

import {
  COMPLETED_BREAK_KEY,
  CONTROL_KEY,
  loadBreakStatistics,
  loadCompletedBreak,
  loadControl,
  loadState,
  localDate,
  recordCompletedBreak,
  setReminderPaused,
  todayBreakCount,
} from "./storage";

beforeEach(() => vi.resetAllMocks());

describe("stored tracking data", () => {
  it("keeps a valid existing v1 session", async () => {
    const state = { activeSeconds: 600, lastCheckedAt: 2000 };
    getItem.mockResolvedValue(JSON.stringify(state));
    expect(await loadState()).toEqual(state);
  });

  it.each([
    undefined,
    "{",
    "null",
    "[]",
    '{"activeSeconds":-1,"lastCheckedAt":2000}',
    '{"activeSeconds":1801,"lastCheckedAt":2000}',
    '{"activeSeconds":1e999,"lastCheckedAt":2000}',
    '{"activeSeconds":60,"lastCheckedAt":"2000"}',
    '{"activeSeconds":60,"lastCheckedAt":-1}',
    '{"activeSeconds":60,"lastCheckedAt":2000,"lastCompletedBreakAt":"oops"}',
  ])("starts fresh for invalid state: %s", async (value) => {
    getItem.mockResolvedValue(value);
    expect(await loadState()).toBeUndefined();
  });

  it("surfaces a storage access failure instead of replacing data", async () => {
    getItem.mockRejectedValue(new Error("Storage unavailable"));
    await expect(loadState()).rejects.toThrow("Storage unavailable");
  });

  it.each([undefined, "123", -1, Infinity, NaN])("ignores an invalid completion marker: %s", async (value) => {
    getItem.mockResolvedValue(value);
    expect(await loadCompletedBreak()).toBeUndefined();
  });
});

describe("pause settings", () => {
  it("preserves the legacy enabled state when settings have not been created", async () => {
    expect(await loadControl()).toBeUndefined();
  });

  it("persists pause without overwriting the background counter", async () => {
    getItem.mockResolvedValue(JSON.stringify({ paused: false, startedAt: 123 }));
    await setReminderPaused(true);
    expect(setItem).toHaveBeenCalledExactlyOnceWith(CONTROL_KEY, JSON.stringify({ paused: true, startedAt: 123 }));
  });

  it("resumes with a new start marker so short meetings also reset the cycle", async () => {
    const before = Date.now();
    await setReminderPaused(false);
    const control = JSON.parse(setItem.mock.calls[0][1]);
    expect(control.paused).toBe(false);
    expect(control.startedAt).toBeGreaterThanOrEqual(before);
    expect(control.startedAt).toBeLessThanOrEqual(Date.now());
  });

  it.each(["null", "{", '{"paused":"yes","startedAt":123}', '{"paused":true,"startedAt":-1}'])(
    "does not silently resume after damaged pause data: %s",
    async (value) => {
      getItem.mockResolvedValue(value);
      await expect(loadControl()).rejects.toThrow();
    },
  );
});

describe("completed break statistics", () => {
  beforeEach(() => {
    const store = new Map<string, unknown>();
    getItem.mockImplementation(async (key) => store.get(key));
    setItem.mockImplementation(async (key, value) => {
      store.set(key, value);
    });
  });

  it("migrates the legacy timestamp without inventing past counts", async () => {
    const oldCompletion = new Date(2026, 8, 8, 12).getTime();
    await setItem(COMPLETED_BREAK_KEY, oldCompletion);
    expect(await loadCompletedBreak()).toBe(oldCompletion);
    expect(todayBreakCount(await loadBreakStatistics(), oldCompletion)).toBe(0);
    await recordCompletedBreak(oldCompletion + 60_000);
    expect(todayBreakCount(await loadBreakStatistics(), oldCompletion)).toBe(1);
  });

  it("records two completed breaks but does not double-count a retried save", async () => {
    const completed = new Date(2026, 8, 8, 12).getTime();
    await recordCompletedBreak(completed);
    await recordCompletedBreak(completed);
    await recordCompletedBreak(completed + 30 * 60_000);
    const statistics = await loadBreakStatistics();
    expect(todayBreakCount(statistics, completed)).toBe(2);
    expect(await loadCompletedBreak()).toBe(completed + 30 * 60_000);
    expect(setItem).toHaveBeenCalledTimes(2);
  });

  it("starts the count over on a new local day while keeping the last break", async () => {
    const yesterday = new Date(2026, 8, 8, 23, 59).getTime();
    const today = new Date(2026, 8, 9, 0, 1).getTime();
    await recordCompletedBreak(yesterday);
    expect(todayBreakCount(await loadBreakStatistics(), today)).toBe(0);
    expect(await loadCompletedBreak()).toBe(yesterday);
    await recordCompletedBreak(today);
    expect(todayBreakCount(await loadBreakStatistics(), today)).toBe(1);
    expect((await loadBreakStatistics()).date).toBe(localDate(today));
  });

  it("surfaces save failures without increasing the count", async () => {
    setItem.mockRejectedValueOnce(new Error("Disk unavailable"));
    await expect(recordCompletedBreak(Date.now())).rejects.toThrow("Disk unavailable");
    expect(todayBreakCount(await loadBreakStatistics())).toBe(0);
  });
});
