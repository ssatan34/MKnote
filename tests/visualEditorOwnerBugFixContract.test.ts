import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  applyFormatToTextarea,
  redoTextareaFormat,
  undoTextareaFormat,
} from "../src/utils/editorFormat.ts";

const adapterSource = readFileSync("src/visual-editor/visualEditorAdapter.ts", "utf8");
const headingCollapseSource = readFileSync("src/visual-editor/headingCollapse.ts", "utf8");
const compactViewSource = readFileSync("src/components/CompactView.tsx", "utf8");
const visualEditorCssSource = readFileSync("src/components/VisualEditor.css", "utf8");

interface TestTextarea extends HTMLTextAreaElement {
  undoNativeChange: () => void;
}

function createTextarea(value: string, selectionStart: number, selectionEnd = selectionStart): TestTextarea {
  let currentValue = value;
  let currentSelectionStart = selectionStart;
  let currentSelectionEnd = selectionEnd;
  const nativeUndoStack: string[] = [];

  return {
    get value() {
      return currentValue;
    },
    set value(next: string) {
      currentValue = next;
    },
    get selectionStart() {
      return currentSelectionStart;
    },
    set selectionStart(next: number) {
      currentSelectionStart = next;
    },
    get selectionEnd() {
      return currentSelectionEnd;
    },
    set selectionEnd(next: number) {
      currentSelectionEnd = next;
    },
    setRangeText(replacement: string, start: number, end: number) {
      nativeUndoStack.push(currentValue);
      currentValue = currentValue.slice(0, start) + replacement + currentValue.slice(end);
      currentSelectionStart = start + replacement.length;
      currentSelectionEnd = currentSelectionStart;
    },
    focus() {},
    undoNativeChange() {
      const previous = nativeUndoStack.pop();
      if (previous === undefined) return;
      currentValue = previous;
      currentSelectionStart = currentValue.length;
      currentSelectionEnd = currentValue.length;
    },
  } as TestTextarea;
}

test("源码标题格式化后，光标必须位于新增标题内容的末尾", () => {
  for (const [action, prefix] of [
    ["h1", "# "],
    ["h2", "## "],
    ["h3", "### "],
  ] as const) {
    const textarea = createTextarea("标题", 2);
    const result = applyFormatToTextarea(textarea, action);

    assert.equal(result, `${prefix}标题`);
    assert.equal(textarea.selectionStart, result.length, `${action} 光标不在内容末尾`);
    assert.equal(textarea.selectionEnd, result.length, `${action} 选区未收拢到内容末尾`);
  }
});

test("源码工具栏格式化必须保留浏览器原生 Ctrl+Z 撤销入口", () => {
  const textarea = createTextarea("代码", 0, 2);
  applyFormatToTextarea(textarea, "inlineCode");
  assert.equal(textarea.value, "`代码`");

  assert.equal(undoTextareaFormat(textarea), "代码");
  assert.equal(textarea.value, "代码");
  assert.equal(redoTextareaFormat(textarea), "`代码`");
  assert.equal(textarea.value, "`代码`");
});

test("代码块折叠必须把展示状态标记为 UI 变化并忽略 pre 属性观察", () => {
  assert.match(adapterSource, /pre\.style\.display\s*=\s*collapsed\s*\?\s*["']none["']\s*:\s*["']["']/);
  assert.match(adapterSource, /mutation\.target\s*===\s*pre/);
  assert.match(adapterSource, /dataset\.collapsed/);
});

test("标题折叠必须提供可访问的悬浮按钮、隐藏区段装饰和对应样式", () => {
  assert.match(adapterSource, /headingCollapsePlugin/);
  assert.match(headingCollapseSource, /Decoration\.widget/);
  assert.match(headingCollapseSource, /Decoration\.node/);
  assert.match(headingCollapseSource, /aria-expanded/);
  assert.match(headingCollapseSource, /contentEditable\s*=\s*["']false["']/);
  assert.match(visualEditorCssSource, /mk-heading-collapse-toggle/);
  assert.match(visualEditorCssSource, /mk-heading-section-hidden/);
});

test("标题折叠区段必须在下一个同级或更高级标题处结束", async () => {
  const { getCollapsedHeadingContentRanges } = await import("../src/visual-editor/headingCollapse.ts");
  const blocks = [
    { pos: 0, nodeSize: 4, type: "heading", level: 1 },
    { pos: 4, nodeSize: 5, type: "paragraph" },
    { pos: 9, nodeSize: 4, type: "heading", level: 2 },
    { pos: 13, nodeSize: 5, type: "paragraph" },
    { pos: 18, nodeSize: 4, type: "heading", level: 1 },
    { pos: 22, nodeSize: 5, type: "paragraph" },
  ];

  assert.deepEqual(
    getCollapsedHeadingContentRanges(blocks, new Set([0])),
    [
      { from: 4, to: 9 },
      { from: 9, to: 13 },
      { from: 13, to: 18 },
    ],
  );
  assert.deepEqual(
    getCollapsedHeadingContentRanges(blocks, new Set([9])),
    [{ from: 13, to: 18 }],
  );
});

test("标题折叠不应改变 Markdown 序列化或源码工具栏回退链路", () => {
  assert.match(adapterSource, /ctx\.get\(serializerCtx\)\(view\.state\.doc\)/);
  assert.match(compactViewSource, /applyFormatToTextarea/);
});
