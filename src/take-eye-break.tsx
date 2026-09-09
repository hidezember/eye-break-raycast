import { Action, ActionPanel, Color, Detail, Icon, launchCommand, LaunchType, showHUD } from "@raycast/api";
import { useCallback, useEffect, useRef, useState } from "react";
import { BREAK_SECONDS, secondsRemaining } from "./break-timer";
import { recordCompletedBreak, setReminderPaused } from "./storage";

export default function Command() {
  const [secondsLeft, setSecondsLeft] = useState(BREAK_SECONDS);
  const [saveError, setSaveError] = useState(false);
  const [pausing, setPausing] = useState(false);
  const [pauseError, setPauseError] = useState(false);
  const [deadline] = useState(() => Date.now() + BREAK_SECONDS * 1000);
  const mounted = useRef(false);
  const completedAt = useRef<number | undefined>(undefined);
  const pauseRequested = useRef(false);

  useEffect(() => {
    mounted.current = true;
    const timer = setInterval(() => setSecondsLeft(secondsRemaining(deadline, Date.now())), 1000);
    return () => {
      mounted.current = false;
      clearInterval(timer);
    };
  }, [deadline]);

  const finishBreak = useCallback(async () => {
    setSaveError(false);
    try {
      completedAt.current ??= Date.now();
      await recordCompletedBreak(completedAt.current);
      if (mounted.current && !pauseRequested.current) await showHUD("休息完成 · 记得经常完整眨眼 ✨");
    } catch {
      if (mounted.current) setSaveError(true);
    }
  }, []);

  useEffect(() => {
    if (secondsLeft === 0 && !pausing) void finishBreak();
  }, [secondsLeft, pausing, finishBreak]);

  async function pauseReminder() {
    if (pauseRequested.current) return;
    pauseRequested.current = true;
    setPausing(true);
    setPauseError(false);
    try {
      await setReminderPaused(true);
      await launchCommand({ name: "eye-break-dashboard", type: LaunchType.UserInitiated });
    } catch {
      pauseRequested.current = false;
      if (mounted.current) {
        setPausing(false);
        setPauseError(true);
      }
    }
  }

  const progress = "●".repeat(BREAK_SECONDS - secondsLeft) + "○".repeat(secondsLeft);
  const markdown = `
# 👀 看向至少 6 米外

## ${secondsLeft} 秒

${progress}

放松眼睛，完整、缓慢地眨眼 **5 次**。

${saveError ? "休息已完成，但保存失败。请按回车重试。" : ""}

${pauseError ? "暂停操作未完成，请重试。" : "开会中？点击右侧「暂停提醒」，稍后在护眼面板中重新开启。"}
`;

  return (
    <Detail
      navigationTitle="休息一下 · 20 秒"
      markdown={markdown}
      metadata={
        <Detail.Metadata>
          <Detail.Metadata.TagList title="临时不方便休息">
            <Detail.Metadata.TagList.Item
              text={pausing ? "正在暂停…" : "暂停提醒"}
              icon={Icon.Pause}
              color={Color.Orange}
              onAction={() => void pauseReminder()}
            />
          </Detail.Metadata.TagList>
          <Detail.Metadata.Label title="恢复方式" text="在护眼面板中点击开启" />
        </Detail.Metadata>
      }
      actions={
        <ActionPanel>
          {saveError && <Action title="Retry Saving Break" onAction={finishBreak} />}
          <Action title="暂停提醒" icon={Icon.Pause} onAction={pauseReminder} />
        </ActionPanel>
      }
    />
  );
}
