import { useEffect, useRef } from "react";
import { isPermissionGranted, requestPermission, sendNotification } from "@tauri-apps/plugin-notification";
import type { QuickTodoItem } from "../utils/quickTodoModel";

export function useQuickTodoReminderScheduler(items: QuickTodoItem[], onTriggered: (id: string) => Promise<void>) {
  const triggeredRef = useRef(new Set<string>());
  const onTriggeredRef = useRef(onTriggered);
  onTriggeredRef.current = onTriggered;

  useEffect(() => {
    let active = true;
    const check = async () => {
      let permitted = await isPermissionGranted();
      if (!permitted) permitted = (await requestPermission()) === "granted";
      if (!active) return;
      const now = Date.now();
      for (const item of items) {
        if (item.completed || !item.remindAt || triggeredRef.current.has(item.id)) continue;
        const due = Date.parse(item.remindAt);
        if (!Number.isFinite(due) || due > now) continue;
        triggeredRef.current.add(item.id);
        try {
          if (permitted) await sendNotification({ title: "Quick Todo 提醒", body: item.text });
        } catch {
          // 通知失败时仍然继续清除一次性提醒，避免倒计时永久停留在到期状态。
        }
        try {
          await onTriggeredRef.current(item.id);
        } catch {
          triggeredRef.current.delete(item.id);
        }
      }
    };
    void check();
    const timer = window.setInterval(() => void check(), 15_000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [items]);
}
