import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export function parseIdleSeconds(stdout: string): number {
  const match = stdout.match(/"HIDIdleTime"\s*=\s*(\d+)/);

  if (!match) {
    throw new Error("HIDIdleTime was not present in ioreg output");
  }

  const idleSeconds = Number(match[1]) / 1_000_000_000;
  if (!Number.isFinite(idleSeconds)) throw new Error("Invalid HIDIdleTime");
  return idleSeconds;
}

export function parseScreenLocked(stdout: string, uid: number): boolean {
  const users = stdout.match(/"IOConsoleUsers"\s*=\s*\(([^\n]*)\)/)?.[1];
  if (users === undefined) throw new Error("IOConsoleUsers was not present in ioreg output");
  const session = users.match(/\{[^{}]*\}/g)?.find((entry) => {
    const sessionUID = entry.match(/"kCGSSessionUserIDKey"\s*=\s*(\d+)/)?.[1];
    return Number(sessionUID) === uid && /"kCGSSessionOnConsoleKey"\s*=\s*Yes/.test(entry);
  });
  return !session || /"CGSSessionScreenIsLocked"\s*=\s*Yes/.test(session);
}

export function parseWakeTime(stdout: string): number {
  const match = stdout.match(/\bsec\s*=\s*(\d+),\s*usec\s*=\s*(\d+)/);
  if (!match) throw new Error("Could not read kern.waketime");
  const timestamp = Number(match[1]) * 1000 + Number(match[2]) / 1000;
  if (!Number.isFinite(timestamp)) throw new Error("Invalid kern.waketime");
  return timestamp;
}

export async function getMacActivity(): Promise<{
  idleSeconds: number;
  isScreenLocked: boolean;
  lastWakeAt: number;
}> {
  const options = { encoding: "utf8" as const, timeout: 5000 };
  const [hid, root, wake] = await Promise.all([
    execFileAsync("/usr/sbin/ioreg", ["-r", "-c", "IOHIDSystem", "-d", "1"], options),
    execFileAsync("/usr/sbin/ioreg", ["-n", "Root", "-d", "1"], options),
    execFileAsync("/usr/sbin/sysctl", ["-n", "kern.waketime"], options),
  ]);
  return {
    idleSeconds: parseIdleSeconds(hid.stdout),
    isScreenLocked: parseScreenLocked(root.stdout, process.getuid!()),
    lastWakeAt: parseWakeTime(wake.stdout),
  };
}
