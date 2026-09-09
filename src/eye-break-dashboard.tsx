import { Action, ActionPanel, Color, Detail, Icon, Keyboard, launchCommand, LaunchType } from "@raycast/api";
import { useCallback, useEffect, useRef, useState } from "react";
import { BREAK_SECONDS } from "./break-timer";
import {
  loadBreakStatistics,
  loadControl,
  loadState,
  setReminderPaused,
  todayBreakCount,
  type BreakStatistics,
  type ReminderControl,
} from "./storage";
import { FOCUS_SECONDS, type TrackerState } from "./tracker";

interface Snapshot {
  tracker?: TrackerState;
  control?: ReminderControl;
  statistics: BreakStatistics;
  now: number;
}

function duration(seconds: number): string {
  return `${Math.floor(seconds / 60)} 分 ${Math.floor(seconds % 60)} 秒`;
}

function timestamp(value: number | undefined): string {
  return value === undefined ? "暂无记录" : new Date(value).toLocaleString("zh-CN", { hour12: false });
}

export default function Command() {
  const [snapshot, setSnapshot] = useState<Snapshot>();
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const acting = useRef(false);
  const mounted = useRef(false);
  const refreshId = useRef(0);

  const refresh = useCallback(async () => {
    const id = ++refreshId.current;
    try {
      const [tracker, control, statistics] = await Promise.all([loadState(), loadControl(), loadBreakStatistics()]);
      if (mounted.current && id === refreshId.current) {
        setSnapshot({ tracker, control, statistics, now: Date.now() });
      }
    } catch {
      if (mounted.current && id === refreshId.current) setError("无法读取提醒状态，请点击刷新重试。");
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    void refresh();
    const timer = setInterval(() => void refresh(), 5000);
    return () => {
      mounted.current = false;
      clearInterval(timer);
    };
  }, [refresh]);

  async function perform(action: () => Promise<void>) {
    if (acting.current) return;
    acting.current = true;
    setBusy(true);
    setError(undefined);
    try {
      await action();
    } catch {
      if (mounted.current)
        setError("操作未完成，请重试。如果无法开启，请确认 Eye Break Background Check 命令没有被禁用。");
    } finally {
      await refresh();
      acting.current = false;
      if (mounted.current) setBusy(false);
    }
  }

  const { tracker, control, statistics, now } = snapshot ?? {
    statistics: { date: "", todayCount: 0 },
    now: Date.now(),
  };
  const paused = control?.paused ?? !tracker;
  const neverStarted = !control && !tracker;
  const pendingReset =
    (!paused && control !== undefined && control.startedAt !== tracker?.lastStartedAt) ||
    (statistics.lastCompletedAt !== undefined && statistics.lastCompletedAt !== tracker?.lastCompletedBreakAt);
  const activeSeconds = pendingReset ? 0 : (tracker?.activeSeconds ?? 0);
  const waiting = !paused && (!tracker || now - tracker.lastCheckedAt >= 5 * 60_000 || pendingReset);
  const status = neverStarted ? "尚未开启" : paused ? "已暂停" : waiting ? "等待后台检查" : "提醒已开启";
  const toggleTitle = paused ? "开启提醒" : "暂停提醒";
  const toggleIcon = paused ? Icon.Play : Icon.Pause;
  const todayCount = todayBreakCount(statistics, now);
  const filled = Math.floor((activeSeconds / FOCUS_SECONDS) * 20);
  const progress = "━".repeat(filled) + "─".repeat(20 - filled);

  const toggle = () =>
    perform(async () => {
      await setReminderPaused(!paused);
      if (paused) {
        // Launch as a user action so Raycast can activate the scheduled command on first use.
        await launchCommand({ name: "check-eye-break", type: LaunchType.UserInitiated });
      }
    });
  const takeBreak = () => perform(() => launchCommand({ name: "take-eye-break", type: LaunchType.UserInitiated }));

  const markdown = snapshot
    ? `
# 👀 护眼提醒

## ${status}

${paused ? "开会或暂时不需要提醒时，可以保持暂停。点击右侧「开启提醒」后，从零开始新一轮计时。" : "继续安心工作，累计约 30 分钟活跃使用后会提醒你休息。开会前点击右侧「暂停提醒」即可。"}

### 本轮累计 ${duration(activeSeconds)}

${progress}

距离下次提醒还需 **${duration(FOCUS_SECONDS - activeSeconds)}** 活跃使用。

---

### 今日完成休息：${todayCount} 次

已完成的引导休息时长：**${duration(todayCount * BREAK_SECONDS)}**

最近完成休息：${timestamp(statistics.lastCompletedAt)}

${waiting ? "后台尚未确认新一轮计时。正常情况下约一分钟更新；若长时间不更新，可在下方操作中重新连接后台。" : "数据按后台采样更新；今日完成次数从新版开始记录，仅统计走完 20 秒的休息。"}
`
    : "# 👀 护眼提醒\n\n正在读取状态…";

  return (
    <Detail
      navigationTitle="护眼提醒 · 状态与统计"
      isLoading={busy || (!snapshot && !error)}
      markdown={`${markdown}${error ? `\n\n**${error}**` : ""}`}
      metadata={
        snapshot ? (
          <Detail.Metadata>
            <Detail.Metadata.TagList title="提醒控制">
              <Detail.Metadata.TagList.Item
                text={busy ? "处理中…" : toggleTitle}
                icon={toggleIcon}
                color={paused ? Color.Green : Color.Orange}
                onAction={() => void toggle()}
              />
            </Detail.Metadata.TagList>
            <Detail.Metadata.TagList title="主动休息">
              <Detail.Metadata.TagList.Item
                text="现在休息 20 秒"
                icon={Icon.Eye}
                color={Color.Blue}
                onAction={() => void takeBreak()}
              />
            </Detail.Metadata.TagList>
            <Detail.Metadata.Separator />
            <Detail.Metadata.Label title="当前状态" text={status} />
            <Detail.Metadata.Label title="本轮累计" text={duration(activeSeconds)} />
            <Detail.Metadata.Label title="提醒间隔" text="30 分钟活跃使用" />
            <Detail.Metadata.Label title="今日完成" text={`${todayCount} 次`} />
            <Detail.Metadata.Separator />
            <Detail.Metadata.Label title="上次后台检查" text={timestamp(tracker?.lastCheckedAt)} />
          </Detail.Metadata>
        ) : undefined
      }
      actions={
        <ActionPanel>
          {snapshot && <Action title={toggleTitle} icon={toggleIcon} onAction={toggle} />}
          {snapshot && <Action title="现在休息 20 秒" icon={Icon.Eye} onAction={takeBreak} />}
          <Action
            title="刷新统计"
            icon={Icon.ArrowClockwise}
            onAction={() => perform(refresh)}
            shortcut={Keyboard.Shortcut.Common.Refresh}
          />
          {waiting && (
            <Action
              title="重新连接后台检查"
              onAction={() => perform(() => launchCommand({ name: "check-eye-break", type: LaunchType.UserInitiated }))}
            />
          )}
        </ActionPanel>
      }
    />
  );
}
