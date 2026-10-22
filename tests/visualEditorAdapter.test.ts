import assert from "node:assert/strict";
import test from "node:test";
import {
  createVisualEditorAdapter,
  type VisualEditorRuntime,
} from "../src/visual-editor/visualEditorAdapter.ts";

function createFakeRuntime(): VisualEditorRuntime & {
  calls: string[];
  emit(markdown: string): void;
} {
  const calls: string[] = [];
  const listeners = new Set<(markdown: string) => void>();
  let markdown = "初始";
  let selection = { from: 2, to: 2 };

  return {
    calls,
    loadMarkdown(nextMarkdown) {
      calls.push(`load:${nextMarkdown}`);
      markdown = nextMarkdown;
    },
    getMarkdown() {
      calls.push("getMarkdown");
      return markdown;
    },
    focus() {
      calls.push("focus");
    },
    getSelection() {
      calls.push("getSelection");
      return selection;
    },
    replaceSelection(text) {
      calls.push(`replace:${text}`);
      markdown = text;
      selection = { from: 1, to: 1 };
    },
    executeCommand(command) {
      calls.push(`command:${command}`);
      return command === "bold";
    },
    undo() {
      calls.push("undo");
      return true;
    },
    redo() {
      calls.push("redo");
      return false;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    destroy() {
      calls.push("destroy");
      listeners.clear();
    },
    emit(nextMarkdown) {
      markdown = nextMarkdown;
      for (const listener of listeners) listener(nextMarkdown);
    },
  };
}

test("visual editor adapter delegates document, selection, command and lifecycle operations", async () => {
  const runtime = createFakeRuntime();
  const adapter = createVisualEditorAdapter(runtime);
  const changes: string[] = [];

  await adapter.loadMarkdown("# 标题");
  assert.equal(adapter.getMarkdown(), "# 标题");
  assert.deepEqual(adapter.getSelection(), { from: 2, to: 2 });
  adapter.focus();
  adapter.replaceSelection("替换");
  assert.equal(adapter.executeCommand("bold"), true);
  assert.equal(adapter.undo(), true);
  assert.equal(adapter.redo(), false);

  const unsubscribe = adapter.subscribe((markdown) => changes.push(markdown));
  runtime.emit("用户编辑");
  unsubscribe();
  runtime.emit("取消订阅");

  assert.deepEqual(changes, ["用户编辑"]);
  assert.deepEqual(runtime.calls, [
    "load:# 标题",
    "getMarkdown",
    "getSelection",
    "focus",
    "replace:替换",
    "command:bold",
    "undo",
    "redo",
  ]);

  adapter.destroy();
  assert.equal(runtime.calls.at(-1), "destroy");
});

test("visual editor adapter does not forward changes after destruction", () => {
  const runtime = createFakeRuntime();
  const adapter = createVisualEditorAdapter(runtime);
  const changes: string[] = [];
  adapter.subscribe((markdown) => changes.push(markdown));

  adapter.destroy();
  runtime.emit("销毁后的输入");

  assert.deepEqual(changes, []);
});
