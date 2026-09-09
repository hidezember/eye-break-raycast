import { beforeEach, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
  environment: { launchType: "background" },
  launchCommand: vi.fn(),
  showHUD: vi.fn(),
  updateCommandMetadata: vi.fn(),
  LocalStorage: { getItem: vi.fn(), setItem: vi.fn() },
}));
const { getMacActivity } = vi.hoisted(() => ({ getMacActivity: vi.fn() }));
vi.mock("@raycast/api", () => ({ ...api, LaunchType: { UserInitiated: "user", Background: "background" } }));
vi.mock("./mac-activity", () => ({ getMacActivity }));

import Command from "./check-eye-break";
import { COMPLETED_BREAK_KEY, CONTROL_KEY, STATE_KEY } from "./storage";

beforeEach(() => {
  vi.resetAllMocks();
  api.environment.launchType = "background";
  getMacActivity.mockResolvedValue({ idleSeconds: 0, isScreenLocked: false, lastWakeAt: 0 });
});

it("persists the due counter before opening the break command", async () => {
  api.LocalStorage.getItem.mockImplementation(async (key) =>
    key === STATE_KEY ? JSON.stringify({ activeSeconds: 1740, lastCheckedAt: Date.now() - 60_000 }) : undefined,
  );
  await Command();
  expect(api.launchCommand).toHaveBeenCalledWith({ name: "take-eye-break", type: "user" });
  expect(JSON.parse(api.LocalStorage.setItem.mock.calls[0][1]).activeSeconds).toBe(1800);
  expect(api.LocalStorage.setItem.mock.invocationCallOrder[0]).toBeLessThan(
    api.launchCommand.mock.invocationCallOrder[0],
  );
  expect(api.showHUD).not.toHaveBeenCalled();
});

it("a completed break prevents a stale due counter from relaunching the reminder", async () => {
  api.LocalStorage.getItem.mockImplementation(async (key) => {
    if (key === STATE_KEY) return JSON.stringify({ activeSeconds: 1800, lastCheckedAt: Date.now() - 1000 });
    if (key === COMPLETED_BREAK_KEY) return Date.now() - 5000;
  });
  await Command();
  expect(api.launchCommand).not.toHaveBeenCalled();
  expect(JSON.parse(api.LocalStorage.setItem.mock.calls[0][1]).activeSeconds).toBe(0);
});

it("surfaces background detection failures to Raycast diagnostics", async () => {
  getMacActivity.mockRejectedValue(new Error("HID unavailable"));
  await expect(Command()).rejects.toThrow("HID unavailable");
  expect(api.LocalStorage.setItem).not.toHaveBeenCalled();
  expect(api.launchCommand).not.toHaveBeenCalled();
});

it("does not launch a reminder if saving state fails", async () => {
  api.LocalStorage.setItem.mockRejectedValue(new Error("Storage unavailable"));
  await expect(Command()).rejects.toThrow("Storage unavailable");
  expect(api.launchCommand).not.toHaveBeenCalled();
});

it("keeps the counter due when launching the reminder fails, so the next check can retry", async () => {
  api.LocalStorage.getItem.mockImplementation(async (key) =>
    key === STATE_KEY ? JSON.stringify({ activeSeconds: 1800, lastCheckedAt: Date.now() - 60_000 }) : undefined,
  );
  api.launchCommand.mockRejectedValue(new Error("Command disabled"));
  await expect(Command()).rejects.toThrow("Command disabled");
  expect(JSON.parse(api.LocalStorage.setItem.mock.calls[0][1]).activeSeconds).toBe(1800);
});

it("opens the dashboard when the old command is run manually", async () => {
  api.environment.launchType = "user";
  await Command();
  expect(api.launchCommand).toHaveBeenCalledWith({ name: "eye-break-dashboard", type: "user" });
  expect(api.showHUD).not.toHaveBeenCalled();
  expect(getMacActivity).not.toHaveBeenCalled();
});

it("does not read Mac activity, change the counter, or launch a reminder while paused", async () => {
  api.LocalStorage.getItem.mockImplementation(async (key) =>
    key === CONTROL_KEY ? JSON.stringify({ paused: true, startedAt: 123 }) : undefined,
  );
  await Command();
  expect(getMacActivity).not.toHaveBeenCalled();
  expect(api.LocalStorage.setItem).not.toHaveBeenCalled();
  expect(api.launchCommand).not.toHaveBeenCalled();
});

it("honors a pause clicked while Mac activity is being collected", async () => {
  let paused = false;
  api.LocalStorage.getItem.mockImplementation(async (key) => {
    if (key === CONTROL_KEY) return JSON.stringify({ paused, startedAt: 123 });
    if (key === STATE_KEY)
      return JSON.stringify({ activeSeconds: 1800, lastCheckedAt: Date.now() - 60_000, lastStartedAt: 123 });
  });
  getMacActivity.mockImplementation(async () => {
    paused = true;
    return { idleSeconds: 0, isScreenLocked: false, lastWakeAt: 0 };
  });
  await Command();
  expect(api.LocalStorage.setItem).not.toHaveBeenCalled();
  expect(api.launchCommand).not.toHaveBeenCalled();
});

it("starts a fresh cycle after resuming, even if the old cycle was already due", async () => {
  api.LocalStorage.getItem.mockImplementation(async (key) => {
    if (key === CONTROL_KEY) return JSON.stringify({ paused: false, startedAt: Date.now() - 1000 });
    if (key === STATE_KEY) return JSON.stringify({ activeSeconds: 1800, lastCheckedAt: Date.now() - 60_000 });
  });
  await Command();
  expect(JSON.parse(api.LocalStorage.setItem.mock.calls[0][1]).activeSeconds).toBe(0);
  expect(api.launchCommand).not.toHaveBeenCalled();
});
