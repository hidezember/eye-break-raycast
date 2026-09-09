import { LocalStorage } from "@raycast/api";
import { FOCUS_SECONDS, type TrackerState } from "./tracker";

export const STATE_KEY = "eye-break-tracker-state-v1";
export const COMPLETED_BREAK_KEY = "eye-break-completed-at-v1";
export const CONTROL_KEY = "eye-break-controls-v1";

export interface ReminderControl {
  paused: boolean;
  startedAt: number;
}

export interface BreakStatistics {
  lastCompletedAt?: number;
  date: string;
  todayCount: number;
}

function isTimestamp(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

export function localDate(timestamp: number): string {
  const date = new Date(timestamp);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function todayBreakCount(statistics: BreakStatistics, now = Date.now()): number {
  return statistics.date === localDate(now) ? statistics.todayCount : 0;
}

export async function loadControl(): Promise<ReminderControl | undefined> {
  const value = await LocalStorage.getItem<string>(CONTROL_KEY);
  if (value === undefined) return undefined;
  try {
    const control = JSON.parse(value);
    if (control && typeof control.paused === "boolean" && isTimestamp(control.startedAt)) return control;
  } catch {
    // A damaged pause setting must not silently re-enable reminders.
  }
  throw new Error("无法读取暂停状态，请重新保存提醒设置");
}

export async function setReminderPaused(paused: boolean): Promise<void> {
  const previous = paused ? await loadControl() : undefined;
  const control: ReminderControl = { paused, startedAt: paused ? (previous?.startedAt ?? 0) : Date.now() };
  await LocalStorage.setItem(CONTROL_KEY, JSON.stringify(control));
}

export async function loadState(): Promise<TrackerState | undefined> {
  const value = await LocalStorage.getItem<string>(STATE_KEY);
  if (!value) return undefined;

  try {
    const state: unknown = JSON.parse(value);
    if (
      typeof state === "object" &&
      state !== null &&
      "activeSeconds" in state &&
      typeof state.activeSeconds === "number" &&
      Number.isFinite(state.activeSeconds) &&
      state.activeSeconds >= 0 &&
      state.activeSeconds <= FOCUS_SECONDS &&
      "lastCheckedAt" in state &&
      typeof state.lastCheckedAt === "number" &&
      Number.isFinite(state.lastCheckedAt) &&
      state.lastCheckedAt >= 0 &&
      (!("lastStartedAt" in state) || isTimestamp(state.lastStartedAt)) &&
      (!("lastCompletedBreakAt" in state) ||
        (typeof state.lastCompletedBreakAt === "number" &&
          Number.isFinite(state.lastCompletedBreakAt) &&
          state.lastCompletedBreakAt >= 0))
    ) {
      return state as TrackerState;
    }
  } catch {
    // A malformed stored value starts a fresh session; storage failures still propagate.
  }
  return undefined;
}

export async function loadCompletedBreak(): Promise<number | undefined> {
  return (await loadBreakStatistics()).lastCompletedAt;
}

export async function loadBreakStatistics(): Promise<BreakStatistics> {
  const value = await LocalStorage.getItem<number | string>(COMPLETED_BREAK_KEY);
  // Older versions recorded only the latest timestamp, not a count of completed breaks.
  if (isTimestamp(value)) return { lastCompletedAt: value, date: "", todayCount: 0 };
  if (typeof value === "string") {
    try {
      const statistics = JSON.parse(value);
      if (
        statistics &&
        isTimestamp(statistics.lastCompletedAt) &&
        typeof statistics.date === "string" &&
        /^\d{4}-\d{2}-\d{2}$/.test(statistics.date) &&
        Number.isSafeInteger(statistics.todayCount) &&
        statistics.todayCount >= 0
      )
        return statistics;
    } catch {
      // Malformed history is discarded without inventing missing records.
    }
  }
  return { date: "", todayCount: 0 };
}

export async function recordCompletedBreak(completedAt: number): Promise<void> {
  const previous = await loadBreakStatistics();
  if (previous.lastCompletedAt !== undefined && previous.lastCompletedAt >= completedAt) return;
  const statistics: BreakStatistics = {
    lastCompletedAt: completedAt,
    date: localDate(completedAt),
    todayCount: todayBreakCount(previous, completedAt) + 1,
  };
  // One write updates both the reset marker and statistics; retries reuse the same timestamp.
  await LocalStorage.setItem(COMPLETED_BREAK_KEY, JSON.stringify(statistics));
}
