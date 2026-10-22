import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { formatQuickTodoContent } from "../src/utils/quickTodo.ts";
import { createQuickTodoMutationQueue, isLatestQuickTodoRequest } from "../src/utils/quickTodoModel.ts";
import { createQuickTodoWindowActions } from "../src/utils/quickTodoWindow.ts";
import { createQuickTodoService } from "../src/utils/quickTodoService.ts";
import { buildQuickTodoPopoutArgs, filterQuickTodoItems, pendingCount, searchQuickTodoNoteTargets, type QuickTodoItem } from "../src/utils/quickTodoModel.ts";
import { formatQuickTodoCountdown, fromQuickTodoDateTimeInput, toQuickTodoDateTimeInput } from "../src/utils/quickTodoReminder.ts";
import { QUICK_TODO_TAGS, toggleQuickTodoTag } from "../src/utils/quickTodoTags.ts";
import { QuickTodoTagPickerBase } from "../src/components/QuickTodoTagPickerBase.ts";
import { beginQuickTodoDrag, cancelQuickTodoDrag, createQuickTodoEscapeHandler, finishQuickTodoDrag, flattenQuickTodoItems, getQuickTodoSiblingItems, getQuickTodoInsertionMarker, getQuickTodoInsertionMarkerForTarget, isQuickTodoInteractionLocked, mergeQuickTodoParentOrder, mergeQuickTodoViewOrder, submitQuickTodoDraft, submitQuickTodoEdit, handleQuickTodoKey, moveQuickTodoDrag, moveQuickTodoItem, runQuickTodoListAction } from "../src/utils/quickTodoPanelModel.ts";

test("双击编辑 Quick Todo 时提交修剪后的内容，空白内容保持编辑态", async () => {
  const edited: string[] = [];
  assert.deepEqual(await submitQuickTodoEdit("  更新后的待办  ", async (text) => edited.push(text)), {
    text: "",
    submitted: true,
  });
  assert.deepEqual(await submitQuickTodoEdit("   ", async (text) => edited.push(text)), {
    text: "   ",
    submitted: false,
  });
  assert.deepEqual(edited, ["更新后的待办"]);
});

test("Quick Todo 模型支持顶层项目和子项目的 parentId", () => {
  const parent = { id: "parent", text: "父项目", completed: false, createdAt: "", completedAt: null, tag: null, parentId: null, remindAt: null };
  const child = { id: "child", text: "子项目", completed: false, createdAt: "", completedAt: null, tag: null, parentId: "parent", remindAt: null };
  assert.equal(parent.parentId, null);
  assert.equal(child.parentId, "parent");
});

test("Quick Todo 模型支持 Markdown 笔记链接", () => {
  const linked: QuickTodoItem = {
    id: "linked",
    text: "打开项目说明",
    completed: false,
    createdAt: "",
    completedAt: null,
    tag: null,
    parentId: null,
    remindAt: null,
    link: { zone: "default", name: "项目说明.md" },
  };
  assert.deepEqual(linked.link, { zone: "default", name: "项目说明.md" });
});

test("打开 Quick Todo 关联便签时使用便签窗口参数", () => {
  assert.deepEqual(buildQuickTodoPopoutArgs(
    { zone: "default", name: "项目说明.md" },
    { zone: "default", name: "项目说明.md", title: "项目说明", zoneLabel: "默认" },
    { x: 120, y: 240 },
  ), {
    zone: "default",
    name: "项目说明.md",
    title: "项目说明",
    width: 400,
    height: 300,
    x: 120,
    y: 240,
    useCursorPosition: false,
  });
  assert.equal(buildQuickTodoPopoutArgs(
    { zone: "default", name: "旧链接.md" },
    undefined,
    { x: 0, y: 0 },
  ).title, "旧链接");
});

test("笔记链接按标题搜索，完全匹配优先并保留跨区域重名结果", () => {
  const targets = [
    { zone: "default", name: "测试报告.md", title: "测试报告", zoneLabel: "默认" },
    { zone: "archive", name: "测试.md", title: "测试", zoneLabel: "存档" },
    { zone: "default", name: "测试.md", title: "测试", zoneLabel: "默认" },
  ];
  assert.deepEqual(searchQuickTodoNoteTargets(targets, "测试").map((target) => `${target.zone}:${target.name}`), [
    "archive:测试.md",
    "default:测试.md",
    "default:测试报告.md",
  ]);
  assert.deepEqual(searchQuickTodoNoteTargets(targets, "").length, 0);
});

test("Quick Todo service exposes link persistence", () => {
  const service = readFileSync(new URL("../src/utils/quickTodoService.ts", import.meta.url), "utf8");
  const controller = readFileSync(new URL("../src/hooks/useQuickTodoController.ts", import.meta.url), "utf8");
  assert.match(service, /setLink: \(id: string, link: QuickTodoLink \| null, todoId = DEFAULT_QUICK_TODO_ID\)/);
  assert.match(controller, /setLink\(id: string, link: QuickTodoLink \| null\)/);
});

test("Quick Todo 展示顺序让子项目紧跟在父项目之后", () => {
  const items = [
    { id: "child", text: "子项目", completed: false, createdAt: "", completedAt: null, tag: null, parentId: "parent" },
    { id: "other", text: "其他", completed: false, createdAt: "", completedAt: null, tag: null, parentId: null },
    { id: "parent", text: "父项目", completed: false, createdAt: "", completedAt: null, tag: null, parentId: null },
  ];
  assert.deepEqual(flattenQuickTodoItems(items).map((item) => item.id), ["other", "parent", "child"]);
});

test("Quick Todo 父项目提供添加子项目按钮，子项目不提供继续嵌套入口", () => {
  const panel = readFileSync(new URL("../src/components/QuickTodoPanel.tsx", import.meta.url), "utf8");
  assert.match(panel, /add_subtask/);
  assert.match(panel, /parentId/);
  assert.match(panel, /onAdd\(text: string, tag: QuickTodoTag \| null, parentId\?: string \| null\)/);
  assert.match(panel, /!item\.parentId[\s\S]*add_subtask/);
  assert.match(panel, /childParentId/);
});

test("Quick Todo 拖拽排序只影响同一父级的兄弟项目", () => {
  const items = [
    { id: "parent-a", text: "A", completed: false, createdAt: "", completedAt: null, tag: null, parentId: null },
    { id: "child-a", text: "A1", completed: false, createdAt: "", completedAt: null, tag: null, parentId: "parent-a" },
    { id: "parent-b", text: "B", completed: false, createdAt: "", completedAt: null, tag: null, parentId: null },
    { id: "child-b", text: "B1", completed: false, createdAt: "", completedAt: null, tag: null, parentId: "parent-b" },
  ];
  assert.deepEqual(getQuickTodoSiblingItems(items, "child-a", false).map((item) => item.id), ["child-a"]);
  assert.deepEqual(mergeQuickTodoParentOrder(items, "active", "parent-a", ["child-a"]).map((id) => id), items.map((item) => item.id));
});

test("Quick Todo 子项目拖拽状态携带父级，避免依赖异步 React state", () => {
  const items = [
    { id: "child-a", text: "A1", completed: false, createdAt: "", completedAt: null, tag: null, parentId: "parent-a" },
    { id: "child-b", text: "A2", completed: false, createdAt: "", completedAt: null, tag: null, parentId: "parent-a" },
  ];
  const drag = beginQuickTodoDrag(items, "child-b");

  assert.ok(drag);
  assert.equal(drag.parentId, "parent-a");
});

test("Quick Todo 子项目拖出父级范围松手时恢复全量列表", () => {
  const panel = readFileSync(new URL("../src/components/QuickTodoPanel.tsx", import.meta.url), "utf8");

  assert.doesNotMatch(panel, /finishQuickTodoDrag\(drag,\s*\(\)\s*=>\s*getQuickTodoSiblingItems/);
  assert.match(panel, /finishQuickTodoDrag\(drag,\s*\(\)\s*=>\s*latestItemsRef\.current/);
});

test("格式化 Quick Todo 为单条 Markdown checkbox", () => {
  assert.equal(formatQuickTodoContent("  完成周报  "), "- [ ] 完成周报\n");
});

test("拒绝空白 Quick Todo", () => {
  assert.throws(
    () => formatQuickTodoContent("  \t\n "),
    new Error("待办内容不能为空"),
  );
});

test("Quick Todo window actions map to the dedicated Tauri commands", async () => {
  const calls: Array<[string, Record<string, unknown> | undefined]> = [];
  const actions = createQuickTodoWindowActions(async (command, args) => {
    calls.push([command, args]);
    return undefined;
  });

  await actions.open("default");
  await actions.setPinned("default", true);
  await actions.setLocked("default", true);
  await actions.hide("default");

  assert.deepEqual(calls, [
    ["open_quick_todo_window", { todoId: "default" }],
    ["set_quick_todo_always_on_top", { todoId: "default", enabled: true }],
    ["set_quick_todo_locked", { todoId: "default", enabled: true }],
    ["hide_quick_todo_window", { todoId: "default" }],
  ]);
});

test("Quick Todo shell actions opt out of the native drag region", () => {
  const css = readFileSync(
    new URL("../src/components/QuickTodoShell.css", import.meta.url),
    "utf8",
  );

  assert.match(
    css,
    /\.quick-todo-shell-actions\s*\{[^}]*-webkit-app-region:\s*no-drag/s,
  );
});

test("Quick windows are allowed to invoke native window dragging", () => {
  const capability = JSON.parse(readFileSync(new URL("../src-tauri/capabilities/default.json", import.meta.url), "utf8")) as {
    windows: string[];
    permissions: string[];
  };
  assert.ok(capability.windows.includes("quick-todo-*"));
  assert.ok(capability.windows.includes("quick-pocket-*") || capability.windows.includes("quick-pocket"));
  assert.ok(capability.permissions.includes("core:window:allow-start-dragging"));
});

test("Quick Todo service maps tagged add, setTag and existing commands", async () => {
  const calls: Array<[string, Record<string, unknown> | undefined]> = [];
  const events: string[] = [];
  const service = createQuickTodoService(
    async (command, args) => { calls.push([command, args]); return []; },
    async (event) => { events.push(event); return () => undefined; },
  );
  await service.list();
  await service.add("无标签");
  await service.add("写周报", "important");
  await service.add("子项目", null, "qt_parent");
  await service.setTag("qt_1", "waiting");
  await service.setReminder("qt_1", "2026-07-14T14:30:00.000Z");
  await service.toggle("qt_1");
  await service.delete("qt_1");
  await service.clearCompleted();
  await service.onChanged(() => undefined);
  assert.deepEqual(calls, [
    ["quick_todo_list", { todoId: "default" }],
    ["quick_todo_add", { text: "无标签", tag: null, parentId: null, todoId: "default" }],
    ["quick_todo_add", { text: "写周报", tag: "important", parentId: null, todoId: "default" }],
    ["quick_todo_add", { text: "子项目", tag: null, parentId: "qt_parent", todoId: "default" }],
    ["quick_todo_set_tag", { id: "qt_1", tag: "waiting", todoId: "default" }],
    ["quick_todo_set_reminder", { id: "qt_1", remindAt: "2026-07-14T14:30:00.000Z", todoId: "default" }],
    ["quick_todo_toggle", { id: "qt_1", todoId: "default" }],
    ["quick_todo_delete", { id: "qt_1", todoId: "default" }],
    ["quick_todo_clear_completed", { todoId: "default" }],
  ]);
  assert.deepEqual(events, ["mknote:quick-todo-changed:default"]);
});

test("Quick Todo service sends the complete ordered ids to quick_todo_reorder", async () => {
  const calls: Array<[string, Record<string, unknown> | undefined]> = [];
  const service = createQuickTodoService(
    async (command, args) => { calls.push([command, args]); return []; },
    async () => () => undefined,
  );

  await service.reorder(["qt_3", "qt_1", "qt_2"]);

  assert.deepEqual(calls, [["quick_todo_reorder", { ids: ["qt_3", "qt_1", "qt_2"], todoId: "default" }]]);
});

test("stale Quick Todo responses cannot overwrite a newer mutation", () => {
  assert.equal(isLatestQuickTodoRequest(3, 3), true);
  assert.equal(isLatestQuickTodoRequest(2, 3), false);
});

test("Quick Todo mutations are serialized in invocation order", async () => {
  const queue = createQuickTodoMutationQueue();
  const order: string[] = [];
  let releaseFirst!: () => void;
  const firstGate = new Promise<void>((resolve) => { releaseFirst = resolve; });
  const first = queue(async () => {
    await firstGate;
    order.push("delete");
    return "deleted";
  });
  const second = queue(async () => {
    order.push("add");
    return "added";
  });

  await Promise.resolve();
  assert.deepEqual(order, []);
  releaseFirst();
  assert.deepEqual(await Promise.all([first, second]), ["deleted", "added"]);
  assert.deepEqual(order, ["delete", "add"]);
});

test("moveQuickTodoItem moves items up and down without mutating the input", () => {
  const items = [
    { id: "1", text: "A", completed: false, createdAt: "", completedAt: null, tag: null },
    { id: "2", text: "B", completed: false, createdAt: "", completedAt: null, tag: null },
    { id: "3", text: "C", completed: false, createdAt: "", completedAt: null, tag: null },
  ];
  const snapshot = [...items];

  assert.deepEqual(moveQuickTodoItem(items, "3", 0).map((item) => item.id), ["3", "1", "2"]);
  assert.deepEqual(moveQuickTodoItem(items, "1", 2).map((item) => item.id), ["2", "3", "1"]);
  assert.deepEqual(items, snapshot);
});

test("moveQuickTodoItem clamps target boundaries and leaves same-position or unknown ids unchanged", () => {
  const items = [
    { id: "1", text: "A", completed: false, createdAt: "", completedAt: null, tag: null },
    { id: "2", text: "B", completed: false, createdAt: "", completedAt: null, tag: null },
    { id: "3", text: "C", completed: false, createdAt: "", completedAt: null, tag: null },
  ];

  assert.deepEqual(moveQuickTodoItem(items, "2", -10).map((item) => item.id), ["2", "1", "3"]);
  assert.deepEqual(moveQuickTodoItem(items, "2", 99).map((item) => item.id), ["1", "3", "2"]);
  assert.deepEqual(moveQuickTodoItem(items, "2", 1), items);
  assert.deepEqual(moveQuickTodoItem(items, "missing", 0), items);
});

test("active-view reorder preserves hidden completed item slots", () => {
  const items = [
    { id: "active-a", text: "A", completed: false, createdAt: "", completedAt: null, tag: null },
    { id: "done", text: "D", completed: true, createdAt: "", completedAt: "2026-07-12T00:00:00Z", tag: null },
    { id: "active-b", text: "B", completed: false, createdAt: "", completedAt: null, tag: null },
  ];

  assert.deepEqual(
    mergeQuickTodoViewOrder(items, "active", ["active-b", "active-a"]),
    ["active-b", "done", "active-a"],
  );
});

test("Quick Todo drag state previews immutably and pointercancel restores the latest items", () => {
  const original = [
    { id: "1", text: "A", completed: false, createdAt: "", completedAt: null, tag: null },
    { id: "2", text: "B", completed: false, createdAt: "", completedAt: null, tag: null },
  ];
  const external = [...original, { id: "3", text: "C", completed: false, createdAt: "", completedAt: null, tag: null }];
  const drag = beginQuickTodoDrag(original, "2");
  assert.ok(drag);
  const moved = moveQuickTodoDrag(drag, 0);
  assert.deepEqual(moved.previewItems.map((item) => item.id), ["2", "1"]);
  assert.deepEqual(original.map((item) => item.id), ["1", "2"]);
  assert.equal(cancelQuickTodoDrag(moved, external), external);
});

test("Quick Todo reorder locks interactions and failed submit restores latest external items", async () => {
  const original = [
    { id: "1", text: "A", completed: false, createdAt: "", completedAt: null, tag: null },
    { id: "2", text: "B", completed: false, createdAt: "", completedAt: null, tag: null },
  ];
  const external = [{ ...original[0], text: "A updated" }, original[1]];
  const drag = moveQuickTodoDrag(beginQuickTodoDrag(original, "2")!, 0);
  assert.equal(isQuickTodoInteractionLocked(drag, false), true);
  assert.equal(isQuickTodoInteractionLocked(null, true), true);
  const result = await finishQuickTodoDrag(drag, () => external, async () => { throw new Error("disk"); });
  assert.equal(result.items, external);
  assert.match(result.error ?? "", /disk/);
});

test("Quick Todo drag uses the persisted order returned by the reorder action", async () => {
  const items = [
    { id: "1", text: "A", completed: false, createdAt: "", completedAt: null, tag: null },
    { id: "2", text: "B", completed: false, createdAt: "", completedAt: null, tag: null },
  ];
  const drag = moveQuickTodoDrag(beginQuickTodoDrag(items, "2")!, 0);
  const persisted = [items[1], items[0]];
  const result = await finishQuickTodoDrag(drag, () => items, async () => persisted);
  assert.equal(result.items, persisted);
});

test("Quick Todo drag keeps the rendered row order stable while moving the pointer", () => {
  const panel = readFileSync(new URL("../src/components/QuickTodoPanel.tsx", import.meta.url), "utf8");
  assert.match(panel, /const manualItems = items\.filter\(item => !isAllnoteWorkTodo\(item\)\)/);
  assert.match(panel, /const displayItems = \(dragSession \? manualItems : previewItems\)\.filter\(item => !isAllnoteWorkTodo\(item\)\)/);
  assert.match(panel, /getQuickTodoInsertionMarkerForTarget/);
});

test("Quick Todo insertion marker represents the first and final slots", () => {
  const items = [
    { id: "1", text: "A", completed: false, createdAt: "", completedAt: null, tag: null },
    { id: "2", text: "B", completed: false, createdAt: "", completedAt: null, tag: null },
    { id: "3", text: "C", completed: false, createdAt: "", completedAt: null, tag: null },
  ];
  const drag = beginQuickTodoDrag(items, "2")!;
  assert.deepEqual(getQuickTodoInsertionMarker(moveQuickTodoDrag(drag, 0)), { id: "2", edge: "before" });
  assert.deepEqual(getQuickTodoInsertionMarker(moveQuickTodoDrag(drag, 2)), { id: "2", edge: "after" });
  assert.deepEqual(getQuickTodoInsertionMarkerForTarget(items, "2", 0), { id: "1", edge: "before" });
  assert.deepEqual(getQuickTodoInsertionMarkerForTarget(items, "2", 2), { id: "3", edge: "after" });
});

test("pending count excludes completed items", () => {
  const items = [
    { id: "1", text: "A", completed: false, createdAt: "2026-07-11T01:00:00Z", completedAt: null, tag: null },
    { id: "2", text: "B", completed: true, createdAt: "2026-07-10T01:00:00Z", completedAt: "2026-07-11T02:00:00Z", tag: "idea" as const },
  ];
  assert.equal(pendingCount(items), 1);
});

test("Quick Todo countdown follows the agreed display boundaries", () => {
  const now = new Date("2026-07-14T10:00:00.000Z");
  assert.equal(formatQuickTodoCountdown("2026-07-14T15:30:00.000Z", now), "05:30");
  assert.equal(formatQuickTodoCountdown("2026-07-14T09:59:00.000Z", now), null);
  assert.equal(formatQuickTodoCountdown("2026-07-17T10:00:00.000Z", now), "3天");
  assert.equal(formatQuickTodoCountdown("2026-08-28T10:00:00.000Z", now), "1个月+");
  assert.equal(formatQuickTodoCountdown("2027-08-14T10:00:00.000Z", now), "1年+");
});

test("Quick Todo reminder datetime input round-trips as ISO", () => {
  const value = fromQuickTodoDateTimeInput("2026-07-14T14:30");
  assert.ok(value);
  assert.equal(toQuickTodoDateTimeInput(value), "2026-07-14T14:30");
  assert.equal(fromQuickTodoDateTimeInput(""), null);
});

test("Quick Todo tags use the fixed mapping and toggle as a nullable radio value", () => {
  assert.deepEqual(
    QUICK_TODO_TAGS.map(({ id, label, icon }) => ({ id, label, icon })),
    [
      { id: "important", label: "重要", icon: "quick_todo_important" },
      { id: "waiting", label: "等待", icon: "quick_todo_waiting" },
      { id: "next", label: "下一步", icon: "quick_todo_next" },
      { id: "idea", label: "想法", icon: "quick_todo_idea" },
      { id: "urgent", label: "紧急", icon: "quick_todo_urgent" },
      { id: "important_urgent", label: "重要紧急", icon: "quick_todo_important_urgent" },
    ],
  );
  assert.equal(toggleQuickTodoTag("important", "important"), null);
  assert.equal(toggleQuickTodoTag("important", "waiting"), "waiting");
  assert.equal(toggleQuickTodoTag(null, "idea"), "idea");
});

test("Quick Todo 按标签筛选，再次选择同一标签恢复全部条目", () => {
  const items: QuickTodoItem[] = [
    { id: "a", text: "A", completed: false, createdAt: "", completedAt: null, tag: "important", remindAt: null },
    { id: "b", text: "B", completed: false, createdAt: "", completedAt: null, tag: "idea", remindAt: null },
    { id: "c", text: "C", completed: false, createdAt: "", completedAt: null, tag: "important", remindAt: null },
  ];
  assert.deepEqual(filterQuickTodoItems(items, "important").map((item) => item.id), ["a", "c"]);
  assert.deepEqual(filterQuickTodoItems(items, null).map((item) => item.id), ["a", "b", "c"]);
});

test("Quick Todo tag icons are registered in the project icon manifest", () => {
  const manifest = JSON.parse(readFileSync(new URL("../src/assets/icon-manifest.json", import.meta.url), "utf8")) as Array<{ id: string }>;
  const ids = new Set(manifest.map((entry) => entry.id));
  for (const id of ["tag", ...QUICK_TODO_TAGS.map((entry) => entry.icon)]) assert.equal(ids.has(id), true, `missing icon ${id}`);
});

test("新增 Quick Todo 标签使用指定 SVG 素材和绿色/橙色语义色", () => {
  const css = readFileSync(new URL("../src/components/QuickTodoPanel.css", import.meta.url), "utf8");
  assert.match(css, /quick-todo-tag-trigger--semantic\.quick-todo-tag-urgent\s*\{[^}]*var\(--mk-success\)/s);
  assert.match(css, /quick-todo-tag-trigger--semantic\.quick-todo-tag-important_urgent\s*\{[^}]*var\(--mk-status-warning\)/s);
  for (const [filename, fill] of [
    ["quick-todo-urgent.svg", "currentColor"],
    ["quick-todo-important-urgent.svg", "currentColor"],
  ] as const) {
    const svg = readFileSync(new URL(`../src/assets/icons/${filename}`, import.meta.url), "utf8");
    assert.match(svg, new RegExp(`fill=\\"${fill}\\"`));
  }
});

test("Quick Todo pin icons exist and its secondary entry emphasizes hover with primary", () => {
  for (const filename of ["pin-on.svg", "pin-off.svg"]) {
    assert.equal(
      readFileSync(new URL("../src/assets/icons/" + filename, import.meta.url), "utf8").length > 0,
      true,
      `missing icon asset ${filename}`,
    );
  }
  const css = readFileSync(new URL("../src/components/QuickTodoEntry.css", import.meta.url), "utf8");
  assert.match(css, /\.quick-todo-trigger\s*\{[^}]*color:\s*var\(--mk-muted-icon\)/s);
  assert.match(css, /\.quick-todo-trigger:hover,[\s\S]*?\.quick-todo-trigger:focus-visible\s*\{[^}]*color:\s*var\(--mk-primary\)/s);
});

test("shared QuickTodoPanel has no Tauri or window-label dependency", () => {
  const source = readFileSync(new URL("../src/components/QuickTodoPanel.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(source, /@tauri-apps|appBridge|getCurrentWindow|window\.label/);
});

test("Quick Todo panel exposes handle-only Pointer Events reorder contract", () => {
  const panel = readFileSync(new URL("../src/components/QuickTodoPanel.tsx", import.meta.url), "utf8");
  const entry = readFileSync(new URL("../src/components/QuickTodoEntry.tsx", import.meta.url), "utf8");
  const css = readFileSync(new URL("../src/components/QuickTodoPanel.css", import.meta.url), "utf8");
  const manifest = JSON.parse(readFileSync(new URL("../src/assets/icon-manifest.json", import.meta.url), "utf8")) as Array<{ id: string }>;

  assert.match(panel, /onReorder\(ids:\s*string\[\]\):\s*Promise<QuickTodoItem\[\]\s*\|\s*void>/);
  assert.match(panel, /className="quick-todo-drag-handle"/);
  assert.match(panel, /aria-label="拖动排序"/);
  assert.match(panel, /onPointerDown=/);
  assert.match(panel, /onPointerMove=/);
  assert.match(panel, /onPointerUp=/);
  assert.match(panel, /onPointerCancel=/);
  assert.match(panel, /onLostPointerCapture=/);
  assert.match(panel, /const captureTarget = listRef\.current/);
  assert.match(panel, /captureTarget\.setPointerCapture/);
  assert.doesNotMatch(panel, /event\.currentTarget\.setPointerCapture/);
  assert.match(panel, /className="quick-todo-list"[^>]*onPointerMove=/);
  assert.doesNotMatch(panel, /className="quick-todo-drag-handle"[^>]*onPointerMove=/s);
  assert.match(panel, /releasePointerCapture/);
  assert.match(panel, /getBoundingClientRect/);
  assert.match(panel, /moveQuickTodoDrag/);
  assert.match(panel, /getQuickTodoInsertionMarker/);
  assert.match(entry, /onReorder=\{\(ids\) => controller\.reorder\(ids\)\}/);
  assert.equal(manifest.filter((item) => item.id === "drag_handle").length, 1);
  assert.match(panel, /aria-label="添加待办"/);
  assert.match(css, /\.quick-todo-drag-handle\s*\{[^}]*touch-action:\s*none/s);
  assert.match(css, /\.quick-todo-row\.quick-todo-insert-before::before\s*\{[^}]*var\(--mk-primary\)/s);
  assert.match(css, /\.quick-todo-row\.quick-todo-insert-after::after\s*\{[^}]*var\(--mk-primary\)/s);
});

test("panel model handles Enter, blank input, failure retention and Escape", async () => {
  const added: Array<[string, string | null]> = [];
  assert.deepEqual(await submitQuickTodoDraft("   ", "important", async (text, tag) => added.push([text, tag])), { draft: "   ", tag: "important", submitted: false });
  assert.deepEqual(await submitQuickTodoDraft("写周报", "important", async (text, tag) => added.push([text, tag])), { draft: "", tag: null, submitted: true });
  let failedDraft = "保留我";
  await assert.rejects(async () => {
    const result = await submitQuickTodoDraft(failedDraft, "waiting", async () => { throw new Error("disk"); });
    failedDraft = result.draft;
  }, /disk/);
  assert.equal(failedDraft, "保留我");
  assert.deepEqual(added, [["写周报", "important"]]);
  assert.equal(handleQuickTodoKey("Enter"), "submit");
  assert.equal(handleQuickTodoKey("Escape"), "close");
});

test("failed toggle/delete action keeps the current list", async () => {
  const items = [{ id: "1", text: "A", completed: false, createdAt: "2026-07-11T01:00:00Z", completedAt: null, tag: null }];
  const result = await runQuickTodoListAction(items, async () => { throw new Error("disk"); });
  assert.equal(result.items, items);
  assert.match(result.error ?? "", /disk/);
});

test("window-level Escape handler closes the popover from any focused control", () => {
  let closed = 0;
  let prevented = 0;
  let stopped = 0;
  const handler = createQuickTodoEscapeHandler(() => { closed += 1; });
  handler({ key: "Enter", preventDefault: () => { prevented += 1; }, stopPropagation: () => { stopped += 1; } });
  handler({ key: "Escape", preventDefault: () => { prevented += 1; }, stopPropagation: () => { stopped += 1; } });
  assert.deepEqual({ closed, prevented, stopped }, { closed: 1, prevented: 1, stopped: 1 });
});

test("Escape closes an open tag picker before closing the panel", () => {
  let pickerOpen = true;
  let closed = 0;
  const handler = createQuickTodoEscapeHandler(() => { closed += 1; }, () => pickerOpen, () => { pickerOpen = false; });
  const event = { key: "Escape", preventDefault() {}, stopPropagation() {} };
  handler(event);
  assert.equal(pickerOpen, false);
  assert.equal(closed, 0);
  handler(event);
  assert.equal(closed, 1);
});

test("Quick Todo panel renders icon-only radio tag pickers and no today UI", () => {
  const panel = readFileSync(new URL("../src/components/QuickTodoPanel.tsx", import.meta.url), "utf8");
  const picker = readFileSync(new URL("../src/components/QuickTodoTagPickerBase.ts", import.meta.url), "utf8");
  assert.doesNotMatch(panel, /isCreatedToday|quick-todo-today|>今天</);
  assert.match(picker, /role:\s*"radiogroup"/);
  assert.match(picker, /role:\s*"radio"/);
  assert.match(picker, /"aria-checked"/);
});

test("tag picker renders six real radios with one selected and icon-only content", () => {
  const markup = renderToStaticMarkup(createElement(QuickTodoTagPickerBase, {
    value: "waiting",
    onChange() {},
    renderIcon: (definition) => createElement("span", { "aria-hidden": true, "data-icon": definition.icon }),
  }));
  assert.equal((markup.match(/role="radio"/g) ?? []).length, 6);
  assert.equal((markup.match(/aria-checked="true"/g) ?? []).length, 1);
  assert.equal((markup.match(/role="radiogroup"/g) ?? []).length, 1);
  assert.match(markup, /aria-label="等待"[^>]*aria-checked="true"|aria-checked="true"[^>]*aria-label="等待"/);
  assert.doesNotMatch(markup, />\s*(重要|等待|下一步|想法)\s*</);
});

test("tag trigger source exposes current Chinese state through aria-label and title", () => {
  const panel = readFileSync(new URL("../src/components/QuickTodoPanel.tsx", import.meta.url), "utf8");
  assert.match(panel, /quickTodoTagControlLabel/);
  assert.match(panel, /aria-label=\{draftTagLabel\}/);
  assert.match(panel, /title=\{draftTagLabel\}/);
  assert.match(panel, /aria-label=\{itemTagLabel\}/);
  assert.match(panel, /title=\{itemTagLabel\}/);
});

test("Quick Todo semantic tag icons use primary while non-tag controls stay neutral", () => {
  const panel = readFileSync(new URL("../src/components/QuickTodoPanel.tsx", import.meta.url), "utf8");
  const css = readFileSync(new URL("../src/components/QuickTodoPanel.css", import.meta.url), "utf8");

  assert.match(panel, /quick-todo-tag-trigger--semantic/);
  assert.match(panel, /<QuickTodoAddTagButton/);
  const addTagCss = readFileSync(new URL("../src/components/QuickTodoAddTagButton.css", import.meta.url), "utf8");
  assert.match(addTagCss, /\.quick-todo-panel \.quick-todo-add-tag-button\s*\{[^}]*color:\s*var\(--mk-icon\)/s);
  assert.match(css, /\.quick-todo-input-row \.quick-todo-tag-trigger--semantic\s*\{[^}]*color:\s*var\(--mk-primary\)/s);
  assert.match(css, /\.quick-todo-row-tag\s*>\s*\.quick-todo-tag-trigger--semantic\s*\{[^}]*color:\s*var\(--mk-primary\)/s);
  assert.match(css, /\.quick-todo-tag-picker button\s*\{[^}]*color:\s*var\(--mk-primary\)/s);
  assert.match(css, /\.quick-todo-tag-trigger--empty\s*\{[^}]*color:\s*var\(--mk-icon\)/s);
  assert.match(css, /\.quick-todo-panel-title\s*\{[^}]*color:\s*var\(--mk-ink\)/s);
  assert.match(css, /\.quick-todo-panel-actions button\s*\{[^}]*color:\s*var\(--mk-icon\)/s);
  assert.match(css, /\.quick-todo-delete\s*\{[^}]*color:\s*var\(--mk-muted\)/s);
  assert.match(css, /\.quick-todo-drag-handle\s*\{[^}]*color:\s*var\(--mk-muted\)/s);
  assert.doesNotMatch(panel, /quick-todo-submit/);
  assert.doesNotMatch(css, /quick-todo-submit/);

  const genericHover = css.match(/\.quick-todo-panel button:hover:not\(:disabled\),\s*\.quick-todo-panel button:focus-visible\s*\{([^}]*)\}/s);
  assert.ok(genericHover);
  assert.doesNotMatch(genericHover[1], /--mk-primary/);
  const checkRule = css.match(/\.quick-todo-check\s*\{([^}]*)\}/s);
  assert.ok(checkRule);
  assert.doesNotMatch(checkRule[1], /--mk-primary/);
  for (const selector of ["quick-todo-panel-actions", "quick-todo-delete", "quick-todo-drag-handle"]) {
    assert.doesNotMatch(css, new RegExp(`\\.${selector}[^,{]*(?:hover|focus)[^{]*\\{[^}]*--mk-primary`, "s"));
  }
  assert.match(css, /\.quick-todo-check:hover\s*\{[^}]*color:\s*var\(--mk-primary\)/s);
  assert.match(css, /\.quick-todo-check:hover \.mk-animated-checkbox-path\s*\{[^}]*animation:\s*mk-quick-todo-hover-check/s);
});

test("Quick Todo 输入行提供与 Quick Pocket 一致的 Add 提交按钮", () => {
  const panel = readFileSync(new URL("../src/components/QuickTodoPanel.tsx", import.meta.url), "utf8");
  const css = readFileSync(new URL("../src/components/QuickTodoPanel.css", import.meta.url), "utf8");

  assert.match(panel, /className="quick-todo-save" title="添加待办" aria-label="添加待办" disabled=\{submitting\} onClick=\{\(\) => void submit\(\)\}>Add<\/button>/);
  assert.match(css, /\.quick-todo-save\s*\{[^}]*align-self:\s*stretch[^}]*background:\s*var\(--mk-primary-focus\)[^}]*color:\s*var\(--mk-on-primary\)/s);
  assert.match(css, /\.quick-todo-save:hover:not\(:disabled\),\s*\.quick-todo-save:focus-visible,\s*\.quick-todo-save:active\s*\{[^}]*background:\s*var\(--mk-primary\)/s);
});

test("completion control keeps its Chinese aria-label and tooltip in sync", () => {
  const panel = readFileSync(new URL("../src/components/QuickTodoPanel.tsx", import.meta.url), "utf8");
  assert.match(panel, /const completionLabel = item\.completed \? "取消完成" : "标记完成"/);
  assert.match(panel, /<AnimatedCheckbox\s+className="quick-todo-check"\s+checked=\{item\.completed\}\s+label=\{completionLabel\}/);
  const checkbox = readFileSync(new URL("../src/components/AnimatedCheckbox.tsx", import.meta.url), "utf8");
  assert.match(checkbox, /<input[\s\S]*?aria-label=\{label\}\s+title=\{label\}/);
});

test("Quick Todo CSS follows the DESIGN.md token and layout contract", () => {
  const panelCss = readFileSync(new URL("../src/components/QuickTodoPanel.css", import.meta.url), "utf8");
  const entryCss = readFileSync(new URL("../src/components/QuickTodoEntry.css", import.meta.url), "utf8");
  const css = `${panelCss}\n${entryCss}`;

  const width = panelCss.match(/\.quick-todo-panel\s*\{[^}]*\bwidth:\s*(\d+)px/s);
  assert.ok(width, "Quick Todo panel must declare a pixel width");
  assert.ok(Number(width[1]) >= 430 && Number(width[1]) <= 450, `panel width ${width[1]}px is outside 430-450px`);

  assert.doesNotMatch(css, /box-shadow|--mk-border|--mk-surface|#[\da-f]{3,8}\b|rgba?\s*\(/i);
  for (const token of ["--mk-canvas", "--mk-ink", "--mk-muted", "--mk-hairline", "--mk-divider", "--mk-pearl", "--mk-primary", "--mk-icon"]) {
    assert.match(css, new RegExp(token), `missing DESIGN.md token ${token}`);
  }
  assert.match(panelCss, /\.quick-todo-text\s*\{[^}]*\bmin-width:\s*0\b/s);
  assert.match(panelCss, /\.quick-todo-row-tag\s*\{[^}]*\b(?:width|flex-basis):\s*(?:28|30|32)px\b/s);
  assert.match(panelCss, /\.quick-todo-panel\s*\{[^}]*\bborder-radius:\s*10px\b/s);
  assert.match(panelCss, /\.quick-todo-tag-picker\s*\{[^}]*\bposition:\s*absolute\b/s);
});

test("Quick Todo 行操作只在悬浮、焦点或关联弹窗打开时显示", () => {
  const css = readFileSync(new URL("../src/components/QuickTodoPanel.css", import.meta.url), "utf8");
  assert.match(css, /\.quick-todo-row-actions\s*\{[^}]*\bopacity:\s*0[^}]*\bvisibility:\s*hidden[^}]*\bpointer-events:\s*none/s);
  assert.match(css, /\.quick-todo-row:hover\s+\.quick-todo-row-actions,[\s\S]*?\.quick-todo-row:focus-within\s+\.quick-todo-row-actions,[\s\S]*?\.quick-todo-row:has\(\.quick-todo-link-popover\)\s+\.quick-todo-row-actions\s*\{[^}]*\bopacity:\s*1[^}]*\bvisibility:\s*visible[^}]*\bpointer-events:\s*auto/s);
});

test("提醒设置使用独立原生窗口，并在 Quick Todo 左侧优先定位", () => {
  const panel = readFileSync(new URL("../src/components/QuickTodoPanel.tsx", import.meta.url), "utf8");
  const shell = readFileSync(new URL("../src/components/QuickTodoShell.tsx", import.meta.url), "utf8");
  const reminderShell = readFileSync(new URL("../src/components/QuickTodoReminderShell.tsx", import.meta.url), "utf8");
  const windowActions = readFileSync(new URL("../src/utils/quickTodoWindow.ts", import.meta.url), "utf8");
  const windowService = readFileSync(new URL("../src/services/windowService.ts", import.meta.url), "utf8");
  const windowSource = readFileSync(new URL("../src-tauri/src/quick_todo_window.rs", import.meta.url), "utf8");
  const entry = readFileSync(new URL("../src/main.tsx", import.meta.url), "utf8");

  assert.match(panel, /onOpenReminder\(item\.id\)/);
  assert.doesNotMatch(panel, /windowService|appBridge|@tauri-apps/);
  assert.doesNotMatch(panel, /quick-todo-reminder-popover/);
  assert.match(shell, /windowService\.openQuickTodoReminder\(todoId, itemId\)/);
  assert.match(reminderShell, /controller\.setReminder/);
  assert.match(reminderShell, /windowService\.hideQuickTodoReminder/);
  assert.match(reminderShell, /import \{ CloseButton \} from "\.\/CloseButton"/);
  assert.match(reminderShell, /<CloseButton aria-label="关闭提醒设置" title="关闭" onClick=\{close\} \/>/);
  assert.match(reminderShell, /className="mk-save-button"[\s\S]*?<span>Save<\/span>/);
  assert.match(reminderShell, /import "\.\.\/App\.css"/);
  assert.match(windowActions, /openReminder:\s*\(todoId: string, itemId: string\)\s*=>\s*invoke\("open_quick_todo_reminder_window", \{ todoId, itemId \}\)/);
  assert.match(windowService, /openQuickTodoReminder:\s*quickTodoWindowActions\.openReminder/);
  assert.match(windowSource, /pub const QUICK_TODO_REMINDER_WINDOW_LABEL: &str = "quick-todo-reminder"/);
  assert.match(windowSource, /pub fn resolve_reminder_placement/);
  assert.match(windowSource, /open_quick_todo_reminder_window/);
  assert.match(windowSource, /REMINDER_WINDOW_WIDTH/);
  assert.match(windowSource, /left_x/);
  assert.match(entry, /label\.startsWith\("quick-todo-reminder-"\)/);
  assert.match(entry, /QuickTodoReminderShell/);
});

test("到期提醒即使通知不可用也会清除，并且创建子 Todo 位于闹钟之前", () => {
  const scheduler = readFileSync(new URL("../src/hooks/useQuickTodoReminderScheduler.ts", import.meta.url), "utf8");
  const panel = readFileSync(new URL("../src/components/QuickTodoPanel.tsx", import.meta.url), "utf8");
  assert.match(scheduler, /if \(permitted\) await sendNotification/);
  assert.match(scheduler, /通知失败时仍然继续清除一次性提醒/);
  assert.match(scheduler, /await onTriggeredRef\.current\(item\.id\)/);
  assert.ok(panel.indexOf("quick-todo-add-child") < panel.indexOf("quick-todo-reminder-control"));
});

test("Quick Todo 行按钮顺序固定为子项目、闹钟、链接、删除、标签", () => {
  const panel = readFileSync(new URL("../src/components/QuickTodoPanel.tsx", import.meta.url), "utf8");
  const order = [
    "quick-todo-add-child",
    "quick-todo-reminder-control",
    "quick-todo-link-control",
    "quick-todo-delete",
    "quick-todo-row-tag",
  ].map((className) => panel.indexOf(className));
  assert.ok(order.every((index) => index >= 0));
  assert.deepEqual([...order].sort((a, b) => a - b), order);
  assert.match(panel, /onOpenLinkedNote/);
  assert.match(panel, /打开便签/);
  assert.match(panel, /更换链接/);
  assert.match(panel, /解除链接/);
});

test("Quick Todo 行标签始终位于最右侧，未设标签时仅随行悬浮显示", () => {
  const panel = readFileSync(new URL("../src/components/QuickTodoPanel.tsx", import.meta.url), "utf8");
  const css = readFileSync(new URL("../src/components/QuickTodoPanel.css", import.meta.url), "utf8");
  assert.ok(panel.indexOf("quick-todo-delete") < panel.indexOf("quick-todo-row-tag"));
  assert.match(panel, /<span className="quick-todo-tag-control quick-todo-row-tag"/);
  assert.match(panel, /item\.tag \? <button[\s\S]*?QuickTodoAddTagButton/);
  assert.match(css, /\.quick-todo-row-tag\s*>\s*button\[aria-label="添加标签"\]\s*\{[^}]*\bopacity:\s*0/s);
  assert.match(css, /\.quick-todo-row:hover\s+\.quick-todo-row-tag\s*>\s*button\[aria-label="添加标签"\],[\s\S]*?\.quick-todo-row:focus-within\s+\.quick-todo-row-tag\s*>\s*button\[aria-label="添加标签"\],[\s\S]*?\.quick-todo-row-tag\s*>\s*button\[aria-expanded="true"\]\s*\{[^}]*\bopacity:\s*1/s);
});

test("链接目标包含私密便签，并且打开选择器时会刷新目标列表", () => {
  const targets = readFileSync(new URL("../src/hooks/useQuickTodoNoteTargets.ts", import.meta.url), "utf8");
  const panel = readFileSync(new URL("../src/components/QuickTodoPanel.tsx", import.meta.url), "utf8");
  assert.match(targets, /"private"/);
  assert.match(targets, /"folder:archive"/);
  assert.match(targets, /zone === "folder:archive"/);
  assert.match(targets, /new Set/);
  assert.match(panel, /onRefreshNoteTargets/);
  assert.match(panel, /openLinkPicker[\s\S]*onRefreshNoteTargets/);
});

test("Quick Todo controller owns shared loading, change subscription and list actions", () => {
  const controller = readFileSync(
    new URL("../src/hooks/useQuickTodoController.ts", import.meta.url),
    "utf8",
  );
  assert.match(controller, /quickTodoService\.onChanged/);
  assert.match(controller, /quickTodoService\.list/);
  assert.match(controller, /quickTodoService\.add/);
  assert.match(controller, /quickTodoService\.setTag/);
  assert.match(controller, /quickTodoService\.toggle/);
  assert.match(controller, /quickTodoService\.delete/);
  assert.match(controller, /quickTodoService\.reorder/);
  assert.match(controller, /quickTodoService\.clearCompleted/);
  assert.match(controller, /mutationQueueRef/);
  assert.match(controller, /createQuickTodoMutationQueue/);
  assert.match(controller, /setItems\(itemsRef\.current\)/);
});

test("Quick Todo entry opens the dedicated window and exposes a concrete fallback error", () => {
  const entry = readFileSync(new URL("../src/components/QuickTodoEntry.tsx", import.meta.url), "utf8");
  assert.match(entry, /windowService\.openQuickTodo/);
  assert.match(entry, /打开 \$\{todo\.name\} 独立窗口失败/);
  assert.match(entry, /已回退到程序内面板/);
});

test("Quick Todo shell renders the shared panel with window-only actions", () => {
  const panel = readFileSync(new URL("../src/components/QuickTodoPanel.tsx", import.meta.url), "utf8");
  const shell = readFileSync(new URL("../src/components/QuickTodoShell.tsx", import.meta.url), "utf8");
  assert.match(panel, /viewMode\??:\s*QuickTodoViewMode/);
  assert.match(panel, /viewMode = "active"/);
  assert.match(panel, /footerActions\?: ReactNode/);
  assert.match(panel, /<footer>[\s\S]*footerActions[\s\S]*<\/footer>/);
  assert.match(panel, /item\.completed === completedView/);
  assert.match(panel, /!completedView && <div className="quick-todo-input-row">/);
  assert.match(panel, /!completedView && <button type="button" className="quick-todo-drag-handle"/);
  assert.match(shell, /QuickTodoPanel/);
  assert.match(shell, /useQuickTodoController/);
  assert.match(shell, /setQuickTodoPinned/);
  assert.match(shell, /setQuickTodoLocked/);
  assert.match(shell, /windowDragRegion=\{!locked\}/);
  assert.match(shell, /footerActions=\{/);
  assert.match(shell, /确认清空已完成/);
  assert.match(shell, /hideQuickTodo/);
});

test("Quick Todo continuously monitors native foreground state before requesting close", () => {
  const panel = readFileSync(new URL("../src/components/QuickTodoPanel.tsx", import.meta.url), "utf8");
  const shell = readFileSync(new URL("../src/components/QuickTodoShell.tsx", import.meta.url), "utf8");
  const windowSource = readFileSync(new URL("../src-tauri/src/quick_todo_window.rs", import.meta.url), "utf8");
  assert.match(panel, /onWindowDragStart/);
  assert.match(shell, /appBridge\.window\.startDragging\(\)/);
  assert.doesNotMatch(shell, /window\.addEventListener\("blur"/);
  assert.match(shell, /<LockToggleButton[\s\S]*?locked=\{locked\}[\s\S]*?onClick=\{\(\) => void toggleLocked\(\)\}/);
  const lockButton = readFileSync(new URL("../src/components/LockToggleButton.tsx", import.meta.url), "utf8");
  assert.match(lockButton, /aria-pressed=\{locked\}/);
  assert.match(lockButton, /aria-label=\{title\}/);
  assert.match(shell, /window\.addEventListener\("focus", resetToActiveView\)/);
  assert.doesNotMatch(shell, /onFocusChanged/);
  assert.match(windowSource, /start_foreground_monitor/);
  assert.match(windowSource, /std::thread::spawn/);
  assert.match(windowSource, /!crate::win_present::is_native_presented\(&window\)/);
  assert.match(windowSource, /crate::win_present::is_native_foreground\(&window\)/);
  assert.match(windowSource, /save_and_hide\(&window, &todo_id\)/);
  assert.doesNotMatch(windowSource, /WindowEvent::Focused\(false\)\s*=>\s*\{\s*if let Err\(error\) = save_and_hide/s);
});

test("Quick window foreground detection compares the Win32 root handle", () => {
  const source = readFileSync(new URL("../src-tauri/src/win_present.rs", import.meta.url), "utf8");
  assert.match(source, /GetAncestor/);
  assert.match(source, /GA_ROOT/);
});

test("Quick Todo tag picker closes when its focus scope loses focus", () => {
  const panel = readFileSync(new URL("../src/components/QuickTodoPanel.tsx", import.meta.url), "utf8");
  assert.match(panel, /quick-todo-tag-control" onBlur=/);
});

test("子 Todo 的编辑输入支持失焦清理、回车提交和标签选择", () => {
  const panel = readFileSync(new URL("../src/components/QuickTodoPanel.tsx", import.meta.url), "utf8");
  const childInput = panel.match(/className="quick-todo-child-input"[\s\S]*?<\/div>\}/)?.[0] ?? "";

  assert.match(childInput, /submitChild\(true\)/);
  assert.match(childInput, /event\.key === "Enter"[\s\S]*?submitChild\(\)/);
  assert.match(childInput, /QuickTodoTagPicker/);
  assert.doesNotMatch(childInput, /保存子项目|name="save"/);
});

test("子 Todo 通过缩进和更小字号与父 Todo 区分", () => {
  const panelCss = readFileSync(new URL("../src/components/QuickTodoPanel.css", import.meta.url), "utf8");
  const baseRowRule = panelCss.match(/\.quick-todo-row\s*\{[^}]*padding:\s*2px 0/s);
  assert.ok(baseRowRule?.index !== undefined);
  const childRowIndent = panelCss.lastIndexOf(".quick-todo-child-row");

  assert.ok(childRowIndent > baseRowRule.index, "子 Todo 缩进规则必须位于基础行 padding 简写之后，避免被覆盖");
  assert.match(panelCss, /\.quick-todo-child-row\s*\{[^}]*min-height:\s*34px[^}]*padding-left:\s*24px/s);
  assert.match(panelCss, /\.quick-todo-child-row \.quick-todo-text\s*\{[^}]*color:\s*var\(--mk-muted\)[^}]*font-size:\s*14px[^}]*line-height:\s*1\.35/s);
});

test("Quick Todo 面板右上角关闭按钮不触发原生窗口拖动", () => {
  const panel = readFileSync(new URL("../src/components/QuickTodoPanel.tsx", import.meta.url), "utf8");
  assert.match(panel, /<CloseButton aria-label="关闭 Quick Todo" title="关闭 Quick Todo" onClick=\{onClose\}/);
  const closeButton = readFileSync(new URL("../src/components/CloseButton.tsx", import.meta.url), "utf8");

  assert.match(closeButton, /data-no-drag/);
  assert.match(panel, /closest\("\[data-no-drag\]"\)/);
});
