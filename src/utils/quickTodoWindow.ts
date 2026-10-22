export type QuickTodoWindowInvoke = (
  command: string,
  args?: Record<string, unknown>,
) => Promise<unknown>;

export function createQuickTodoWindowActions(invoke: QuickTodoWindowInvoke) {
  return {
    open: (todoId = "default") => invoke("open_quick_todo_window", { todoId }),
    openReminder: (todoId: string, itemId: string) => invoke("open_quick_todo_reminder_window", { todoId, itemId }),
    hideReminder: (todoId = "default") => invoke("hide_quick_todo_reminder_window", { todoId }),
    hide: (todoId = "default") => invoke("hide_quick_todo_window", { todoId }),
    setPinned: (todoId: string, enabled: boolean) =>
      invoke("set_quick_todo_always_on_top", { todoId, enabled }),
    setLocked: (todoId: string, enabled: boolean) =>
      invoke("set_quick_todo_locked", { todoId, enabled }),
  };
}
