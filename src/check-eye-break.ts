import { environment, launchCommand, LaunchType, LocalStorage, updateCommandMetadata } from "@raycast/api";
import { getMacActivity } from "./mac-activity";
import { loadCompletedBreak, loadControl, loadState, STATE_KEY } from "./storage";
import { FOCUS_SECONDS, updateTracker } from "./tracker";

export default async function Command() {
  if (environment.launchType === LaunchType.UserInitiated) {
    // A user launch activates Raycast's background scheduling and opens the new UI.
    await launchCommand({ name: "eye-break-dashboard", type: LaunchType.UserInitiated });
    return;
  }

  if ((await loadControl())?.paused) {
    await updateCommandMetadata({ subtitle: "已暂停 · 在护眼面板中开启" });
    return;
  }

  const [activity, previous, completedAt] = await Promise.all([getMacActivity(), loadState(), loadCompletedBreak()]);
  // Re-read after system calls so a pause clicked during sampling wins.
  const control = await loadControl();
  if (control?.paused) return;
  const result = updateTracker(previous, { now: Date.now(), ...activity }, completedAt, control?.startedAt);

  await LocalStorage.setItem(STATE_KEY, JSON.stringify(result.state));
  await updateCommandMetadata({
    subtitle: `累计 ${Math.floor(result.state.activeSeconds / 60)} / ${FOCUS_SECONDS / 60} 分钟`,
  });

  if (result.shouldRemind) {
    const latestControl = await loadControl();
    if (latestControl?.paused || latestControl?.startedAt !== control?.startedAt) return;
    await launchCommand({ name: "take-eye-break", type: LaunchType.UserInitiated });
  }
}
