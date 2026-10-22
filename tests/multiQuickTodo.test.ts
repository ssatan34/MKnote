import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { createQuickTodoService } from "../src/utils/quickTodoService.ts";
import { createQuickTodoWindowActions } from "../src/utils/quickTodoWindow.ts";

test("多 Quick Todo 注册表始终保留不可删除的默认 Todo", async () => {
  const registry = await import("../src/utils/quickTodoRegistry.ts");
  assert.deepEqual(registry.mergeQuickTodoDefinitions([
    { id: "todo_work", name: "工作" },
    { id: "default", name: "错误名称" },
    { id: "todo_work", name: "重复" },
  ]), [
    { id: "default", name: "Quick Todo" },
    { id: "todo_work", name: "工作" },
  ]);
});

test("Quick Todo 名称不能为空且最多六个字符", async () => {
  const registry = await import("../src/utils/quickTodoRegistry.ts");
  assert.equal(registry.isValidQuickTodoName("工作"), true);
  assert.equal(registry.isValidQuickTodoName("  "), false);
  assert.equal(registry.isValidQuickTodoName("一二三四五六七"), false);
});

test("Quick Todo service 为每个读写命令传递 todoId 并隔离变化事件", async () => {
  const calls: Array<[string, Record<string, unknown> | undefined]> = [];
  const events: string[] = [];
  const service = createQuickTodoService(
    async <T>(command: string, args?: Record<string, unknown>) => {
      calls.push([command, args]);
      return [] as T;
    },
    async (event: string) => {
      events.push(event);
      return () => undefined;
    },
  );

  await service.list("todo_work");
  await service.add("写周报", "important", null, "todo_work");
  await service.setReminder("qt_1", "2026-08-07T09:00:00.000Z", "todo_work");
  await service.clearCompleted("todo_work");
  await service.onChanged(() => undefined, "todo_work");

  assert.deepEqual(calls, [
    ["quick_todo_list", { todoId: "todo_work" }],
    ["quick_todo_add", { text: "写周报", tag: "important", parentId: null, todoId: "todo_work" }],
    ["quick_todo_set_reminder", { id: "qt_1", remindAt: "2026-08-07T09:00:00.000Z", todoId: "todo_work" }],
    ["quick_todo_clear_completed", { todoId: "todo_work" }],
  ]);
  assert.deepEqual(events, ["mknote:quick-todo-changed:todo_work"]);
});

test("Quick Todo 窗口与提醒窗口都按 todoId 隔离", async () => {
  const calls: Array<[string, Record<string, unknown> | undefined]> = [];
  const actions = createQuickTodoWindowActions(async (command, args) => {
    calls.push([command, args]);
  });

  await actions.open("todo_work");
  await actions.openReminder("todo_work", "qt_1");
  await actions.setPinned("todo_work", true);
  await actions.setLocked("todo_work", true);
  await actions.hide("todo_work");

  assert.deepEqual(calls, [
    ["open_quick_todo_window", { todoId: "todo_work" }],
    ["open_quick_todo_reminder_window", { todoId: "todo_work", itemId: "qt_1" }],
    ["set_quick_todo_always_on_top", { todoId: "todo_work", enabled: true }],
    ["set_quick_todo_locked", { todoId: "todo_work", enabled: true }],
    ["hide_quick_todo_window", { todoId: "todo_work" }],
  ]);
});

test("多 Quick Todo UI 复用选择器与设置管理入口", () => {
  const entry = readFileSync(new URL("../src/components/QuickTodoEntry.tsx", import.meta.url), "utf8");
  const settings = readFileSync(new URL("../src/components/QuickTodoSettingsPanel.tsx", import.meta.url), "utf8");
  const picker = readFileSync(new URL("../src/components/QuickTodoPicker.tsx", import.meta.url), "utf8");
  assert.match(entry, /QuickTodoPicker/);
  assert.match(settings, /quickTodoService\.createTodo/);
  assert.match(settings, /quickTodoService\.renameTodo/);
  assert.match(settings, /quickTodoService\.deleteTodo/);
  assert.match(picker, /选择 Todo/);
});

test("多 Quick Todo 后端保留默认文件并为新增 Todo 使用独立 Markdown", () => {
  const backend = readFileSync(new URL("../src-tauri/src/quick_todo.rs", import.meta.url), "utf8");
  assert.match(backend, /DEFAULT_QUICK_TODO_ID/);
  assert.match(backend, /quick_data::directories/);
  assert.match(backend, /todo_path\(&id\)/);
  assert.match(backend, /quick_todo_registry_list/);
  assert.match(backend, /quick_todo_delete_todo/);
});

test("S3 同步把每个注册 Todo 作为独立对象", () => {
  const sync = readFileSync(new URL("../src-tauri/src/sync.rs", import.meta.url), "utf8");
  assert.match(sync, /QuickTodoDefault/);
  assert.match(sync, /QuickTodo\(String\)/);
  assert.match(sync, /quick-todo-\{id\}/);
  assert.match(sync, /quick_todos/);
});
