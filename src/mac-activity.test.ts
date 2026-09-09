import { describe, expect, it } from "vitest";
import { parseIdleSeconds, parseScreenLocked, parseWakeTime } from "./mac-activity";

describe("macOS activity parsing", () => {
  it("converts HID nanoseconds to seconds", () => {
    expect(parseIdleSeconds('"HIDIdleTime" = 1050738291')).toBeCloseTo(1.050738291);
  });

  it.each(["", '"HIDIdleTime" = invalid', '"HIDIdleTime" = -1'])("rejects missing or invalid HID data: %s", (data) => {
    expect(() => parseIdleSeconds(data)).toThrow();
  });

  it("detects a locked active session", () => {
    expect(
      parseScreenLocked(
        '"IOConsoleUsers" = ({"kCGSSessionUserIDKey"=501,"kCGSSessionOnConsoleKey"=Yes,"CGSSessionScreenIsLocked"=Yes})',
        501,
      ),
    ).toBe(true);
  });

  it("ignores another user's locked session", () => {
    const data =
      '"IOConsoleUsers" = ({"kCGSSessionUserIDKey"=502,"CGSSessionScreenIsLocked"=Yes},' +
      '{"kCGSSessionUserIDKey"=501,"kCGSSessionOnConsoleKey"=Yes})';
    expect(parseScreenLocked(data, 501)).toBe(false);
  });

  it("does not count a user switched out of the console", () => {
    expect(
      parseScreenLocked('"IOConsoleUsers" = ({"kCGSSessionUserIDKey"=501,"kCGSSessionOnConsoleKey"=No})', 501),
    ).toBe(true);
    expect(parseScreenLocked('"IOConsoleUsers" = ()', 501)).toBe(true);
  });

  it("does not silently report unlocked on unreadable session output", () => {
    expect(() => parseScreenLocked("", 501)).toThrow();
  });

  it("reads a wake timestamp without depending on the formatted date", () => {
    expect(parseWakeTime("{ sec = 1788428618, usec = 922543 } Thu Sep 3 17:43:38 2026")).toBeCloseTo(1788428618922.543);
    expect(parseWakeTime("{ sec = 0, usec = 0 }")).toBe(0);
    expect(() => parseWakeTime("kern.waketime: unavailable")).toThrow();
  });
});
