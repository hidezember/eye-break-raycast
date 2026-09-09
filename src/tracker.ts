export const FOCUS_SECONDS = 30 * 60;
export const ACTIVE_IDLE_SECONDS = 60;
export const REST_IDLE_SECONDS = 5 * 60;
export const MAX_COUNTED_SAMPLE_SECONDS = 2 * 60;

export interface TrackerState {
  activeSeconds: number;
  lastCheckedAt: number;
  lastCompletedBreakAt?: number;
  lastStartedAt?: number;
}

export interface ActivitySample {
  now: number;
  idleSeconds: number;
  isScreenLocked: boolean;
  lastWakeAt?: number;
}

export interface TrackerResult {
  state: TrackerState;
  shouldRemind: boolean;
}

export function updateTracker(
  previous: TrackerState | undefined,
  sample: ActivitySample,
  completedBreakAt?: number,
  startedAt?: number,
): TrackerResult {
  const completion = completedBreakAt ?? previous?.lastCompletedBreakAt;
  const nextState: TrackerState = {
    activeSeconds: 0,
    lastCheckedAt: sample.now,
    ...(completion === undefined ? {} : { lastCompletedBreakAt: completion }),
    ...(startedAt === undefined ? {} : { lastStartedAt: startedAt }),
  };

  if (
    !previous ||
    (completedBreakAt !== undefined && completedBreakAt !== previous.lastCompletedBreakAt) ||
    (startedAt !== undefined && startedAt !== previous.lastStartedAt)
  ) {
    return {
      state: nextState,
      shouldRemind: false,
    };
  }

  const elapsedSeconds = (sample.now - previous.lastCheckedAt) / 1000;
  const hasTakenABreak =
    sample.isScreenLocked ||
    sample.idleSeconds >= REST_IDLE_SECONDS ||
    elapsedSeconds >= REST_IDLE_SECONDS ||
    elapsedSeconds < 0 ||
    (sample.lastWakeAt !== undefined && sample.lastWakeAt > previous.lastCheckedAt);

  if (hasTakenABreak) {
    return {
      state: nextState,
      shouldRemind: false,
    };
  }

  const isActive = sample.idleSeconds < ACTIVE_IDLE_SECONDS;
  const activeSeconds = isActive
    ? previous.activeSeconds + Math.min(elapsedSeconds, MAX_COUNTED_SAMPLE_SECONDS)
    : previous.activeSeconds;

  return {
    state: { ...nextState, activeSeconds: Math.min(activeSeconds, FOCUS_SECONDS) },
    shouldRemind: isActive && activeSeconds >= FOCUS_SECONDS,
  };
}
