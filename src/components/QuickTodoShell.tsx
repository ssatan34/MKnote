import { useEffect, useRef, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useQuickTodoController } from "../hooks/useQuickTodoController";
import { useQuickTodoNoteTargets } from "../hooks/useQuickTodoNoteTargets";
import { resolveEffectiveThemeMode } from "../constants/themeAccents";
import { configService } from "../services/configService";
import { appBridge } from "../services/appBridge";
import { windowService } from "../services/windowService";
import { openQuickTodoLinkedNote } from "../utils/quickTodoNoteLink";
import type { AppConfig, QuickTodoWindowState, ThemeMode } from "../types";
import { DEFAULT_QUICK_TODO_ID } from "../utils/quickTodoRegistry";
import { Icon } from "./Icon";
import { WindowPinButton } from "./WindowPinButton";
import { LockToggleButton } from "./LockToggleButton";
import { QuickTodoPanel, type QuickTodoPanelHandle } from "./QuickTodoPanel";
import "./QuickTodoShell.css";

function applyTheme(config: AppConfig) {
    const mode = (config.theme_mode ?? "system") as ThemeMode;
  document.documentElement.setAttribute("data-theme-mode", mode);
  document.documentElement.setAttribute("data-theme", resolveEffectiveThemeMode(mode));
  document.documentElement.setAttribute("data-light-theme", config.light_theme ?? "mknote");
  document.documentElement.setAttribute("data-dark-theme", config.dark_theme ?? "mknote");
  document.documentElement.setAttribute("data-accent-skin", config.accent_skin ?? "mknote");
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function QuickTodoShell() {
  const todoId = getCurrentWindow().label.replace(/^quick-todo-/, "");
  const [pinned, setPinned] = useState(false);
  const [locked, setLocked] = useState(false);
  const [viewMode, setViewMode] = useState<"active" | "completed">("active");
  const [clearConfirmation, setClearConfirmation] = useState(false);
  const [windowError, setWindowError] = useState<string | null>(null);
  const [todoName, setTodoName] = useState("Quick Todo");
  const controller = useQuickTodoController(todoId);
  const noteTargets = useQuickTodoNoteTargets();
  const panelRef = useRef<QuickTodoPanelHandle>(null);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([
      configService.getConfig(),
      appBridge.invoke<QuickTodoWindowState>("get_quick_todo_window_state", { todoId }),
    ]).then(([config, state]) => {
      if (cancelled) return;
      applyTheme(config);
      setPinned(state.alwaysOnTop);
      setLocked(state.locked);
      setTodoName(todoId === DEFAULT_QUICK_TODO_ID ? "Quick Todo" : config.quick_todos?.find((todo) => todo.id === todoId)?.name ?? todoId);
    }).catch((error) => {
      if (!cancelled) setWindowError("读取 Quick Todo 窗口配置失败：" + errorMessage(error));
    });
    return () => {
      cancelled = true;
    };
  }, [todoId]);

  useEffect(() => {
    setClearConfirmation(false);
  }, [controller.items, viewMode]);

  const togglePinned = async () => {
    const next = !pinned;
    try {
      await windowService.setQuickTodoPinned(todoId, next);
      setPinned(next);
      setWindowError(null);
    } catch (error) {
      setWindowError("设置 Quick Todo 置顶失败：" + errorMessage(error));
    }
  };

  const hideWindow = () => {
    void windowService.hideQuickTodo(todoId).catch((error) => {
      setWindowError("关闭 Quick Todo 失败：" + errorMessage(error));
    });
  };

  useEffect(() => {
    const resetToActiveView = () => {
      setViewMode("active");
      setClearConfirmation(false);
    };
    window.addEventListener("focus", resetToActiveView);
    return () => window.removeEventListener("focus", resetToActiveView);
  }, []);

  const toggleLocked = async () => {
    const next = !locked;
    try {
      await windowService.setQuickTodoLocked(todoId, next);
      setLocked(next);
      setWindowError(null);
    } catch (error) {
      setWindowError("设置 Quick Todo 窗口锁定失败：" + errorMessage(error));
    }
  };

  const toggleCompletedView = () => {
    setViewMode((current) => current === "active" ? "completed" : "active");
  };

  const clearCompleted = async () => {
    if (!clearConfirmation) {
      setClearConfirmation(true);
      return;
    }
    try {
      await controller.clearCompleted();
      setClearConfirmation(false);
      setWindowError(null);
    } catch (error) {
      setClearConfirmation(false);
      setWindowError("清空已完成 Quick Todo 失败：" + errorMessage(error));
    }
  };

  const completedCount = controller.items.filter((item) => item.completed).length;

  const close = async () => { await panelRef.current?.flushEditing(); hideWindow(); };
  const startWindowDrag = () => {
    void appBridge.window.startDragging().catch((error) => {
      setWindowError("拖动 Quick Todo 窗口失败：" + errorMessage(error));
    });
  };
  return (
    <main className="quick-todo-shell" aria-label="Quick Todo window">
      <QuickTodoPanel
        ref={panelRef}
        todoName={todoName}
        todoId={todoId}
        items={controller.items}
        loading={controller.loading}
        error={windowError ?? controller.error}
        onAdd={async (text, tag, parentId) => {
          await controller.add(text, tag, parentId);
        }}
        onEdit={async (id, text) => {
          await controller.edit(id, text);
        }}
        onSetTag={async (id, tag) => {
          await controller.setTag(id, tag);
        }}
        onOpenReminder={(itemId) => {
          void windowService.openQuickTodoReminder(todoId, itemId).catch((error) => {
            setWindowError("打开提醒设置窗口失败：" + errorMessage(error));
          });
        }}
        noteTargets={noteTargets.targets}
        noteTargetsLoading={noteTargets.loading}
        onRefreshNoteTargets={noteTargets.refresh}
        onSetLink={async (id, link) => {
          await controller.setLink(id, link);
        }}
        onOpenLinkedNote={async (link) => {
          try {
            await openQuickTodoLinkedNote(link, noteTargets.targets);
            setWindowError(null);
          } catch (error) {
            setWindowError("打开关联便签失败：" + errorMessage(error));
            throw error;
          }
        }}
        onToggle={async (id) => {
          await controller.toggle(id);
        }}
        onDelete={async (id) => {
          await controller.remove(id);
        }}
        onReorder={(ids) => controller.reorder(ids)}
        onClose={() => void close()}
        onWindowDragStart={startWindowDrag}
        windowDragRegion={!locked}
        viewMode={viewMode}
        headerActions={
          <span className="quick-todo-shell-actions">
            <WindowPinButton className="quick-todo-shell-button" pinned={pinned} onClick={() => void togglePinned()} />
            <LockToggleButton
              className="quick-todo-shell-button"
              locked={locked}
              title={locked ? "解除窗口锁定" : "锁定窗口"}
              onClick={() => void toggleLocked()}
            />
            <button
              type="button"
              className={"quick-todo-shell-button quick-todo-completed-toggle" + (viewMode === "completed" ? " active" : "")}
              title={viewMode === "completed" ? "返回未完成" : "查看已完成"}
              aria-label={viewMode === "completed" ? "返回未完成" : "查看已完成"}
              aria-pressed={viewMode === "completed"}
              data-no-drag
              onClick={toggleCompletedView}
            >
              <span className="quick-todo-completed-toggle__box" aria-hidden="true" />
            </button>
          </span>
        }
        footerActions={viewMode === "completed" && completedCount > 0 && <button
          type="button"
          className={"quick-todo-shell-button" + (clearConfirmation ? " active" : "")}
          title={clearConfirmation ? "确认清空已完成" : "清空已完成"}
          aria-label={clearConfirmation ? "确认清空已完成" : "清空已完成"}
          data-no-drag
          onClick={() => void clearCompleted()}
        >
          <Icon name={clearConfirmation ? "task_done2" : "clear"} size={16} />
        </button>}
      />
    </main>
  );
}
