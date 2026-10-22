import { useEffect, useState } from "react";
import { resolveEffectiveThemeMode } from "../constants/themeAccents";
import { useQuickTodoController } from "../hooks/useQuickTodoController";
import { configService } from "../services/configService";
import { appBridge } from "../services/appBridge";
import { windowService } from "../services/windowService";
import type { AppConfig, ThemeMode } from "../types";
import { fromQuickTodoDateTimeInput, toQuickTodoDateTimeInput } from "../utils/quickTodoReminder";
import { CloseButton } from "./CloseButton";
import { Icon } from "./Icon";
import "../App.css";
import "./QuickTodoReminderShell.css";

function applyTheme(config: AppConfig) {
    const mode = (config.theme_mode ?? "system") as ThemeMode;
  document.documentElement.setAttribute("data-theme-mode", mode);
  document.documentElement.setAttribute("data-theme", resolveEffectiveThemeMode(mode));
  document.documentElement.setAttribute("data-light-theme", config.light_theme ?? "mknote");
  document.documentElement.setAttribute("data-dark-theme", config.dark_theme ?? "mknote");
  document.documentElement.setAttribute("data-accent-skin", config.accent_skin ?? "mknote");
}

function initialReminderTarget() {
  const params = new URLSearchParams(window.location.search);
  return { todoId: params.get("todoId") ?? "default", itemId: params.get("itemId") ?? "" };
}

function nextMinuteInput() {
  const nextMinute = new Date(Date.now() + 60_000);
  nextMinute.setSeconds(0, 0);
  return toQuickTodoDateTimeInput(nextMinute.toISOString());
}

export function QuickTodoReminderShell() {
  const [target, setTarget] = useState(initialReminderTarget);
  const controller = useQuickTodoController(target.todoId);
  const [reminderInput, setReminderInput] = useState("");
  const [status, setStatus] = useState<"idle" | "saving" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const item = controller.items.find((candidate) => candidate.id === target.itemId);

  useEffect(() => {
    void configService.getConfig().then(applyTheme);
  }, []);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    void appBridge.listen<{ todoId: string; itemId: string }>("mknote:quick-todo-reminder-open", (event) => {
      setTarget(event.payload);
      setStatus("idle");
      setError(null);
    }).then((stop) => {
      unlisten = stop;
    });
    return () => unlisten?.();
  }, []);

  useEffect(() => {
    if (!item) return;
    setReminderInput(toQuickTodoDateTimeInput(item.remindAt) ?? nextMinuteInput());
  }, [item?.id]);

  const close = () => {
    void windowService.hideQuickTodoReminder(target.todoId);
  };
  const save = async () => {
    if (!item || !reminderInput || status === "saving") return;
    setStatus("saving");
    setError(null);
    try {
      await controller.setReminder(item.id, fromQuickTodoDateTimeInput(reminderInput));
      close();
    } catch (saveError) {
      setStatus("error");
      setError(saveError instanceof Error ? saveError.message : "保存提醒失败");
    }
  };
  const clear = async () => {
    if (!item || status === "saving") return;
    setStatus("saving");
    setError(null);
    try {
      await controller.setReminder(item.id, null);
      close();
    } catch (clearError) {
      setStatus("error");
      setError(clearError instanceof Error ? clearError.message : "清除提醒失败");
    }
  };

  return <main className="quick-todo-reminder-shell" aria-label="设置提醒">
    <section className="quick-todo-reminder-card">
      <header className="quick-todo-reminder-header">
        <span><Icon name="alarm_clock" size={16} />设置提醒</span>
        <CloseButton aria-label="关闭提醒设置" title="关闭" onClick={close} />
      </header>
      {item ? <>
        <p className="quick-todo-reminder-item" title={item.text}>{item.text}</p>
        <label><span>日期</span><input type="date" disabled={status === "saving"} value={reminderInput.slice(0, 10)} min={toQuickTodoDateTimeInput(new Date().toISOString()).slice(0, 10)} onChange={(event) => setReminderInput(`${event.target.value}T${reminderInput.slice(11, 16) || "09:00"}`)} /></label>
        <label><span>时间</span><input type="time" disabled={status === "saving"} value={reminderInput.slice(11, 16)} onChange={(event) => setReminderInput(`${reminderInput.slice(0, 10)}T${event.target.value}`)} /></label>
        {error && <p className="quick-todo-reminder-error" role="alert">{error}</p>}
        <footer className="quick-todo-reminder-actions">
          <button type="button" disabled={status === "saving"} onClick={() => void clear()}>清除提醒</button>
          <button type="button" className="mk-save-button" disabled={!reminderInput || status === "saving"} onClick={() => void save()}><span>Save</span></button>
        </footer>
      </> : <p className="quick-todo-reminder-empty">此待办已不存在。</p>}
    </section>
  </main>;
}
