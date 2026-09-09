export const BREAK_SECONDS = 20;

export function secondsRemaining(deadline: number, now: number): number {
  return Math.max(0, Math.min(BREAK_SECONDS, Math.ceil((deadline - now) / 1000)));
}
