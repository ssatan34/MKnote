import assert from "node:assert/strict";
import test from "node:test";
import {
  createEditorInteractionHarness,
  type ClipboardPayload,
} from "./fixtures/visual-editor/editorInteractionContractModel.ts";

test("替换选区必须只产生一个可撤销事务并把光标放在插入文本末尾", () => {
  const editor = createEditorInteractionHarness("你好世界");
  editor.setSelection({ from: 2, to: 4 });

  editor.replaceSelection("MK");

  assert.equal(editor.snapshot().content, "你好MK");
  assert.deepEqual(editor.snapshot().selection, { from: 4, to: 4 });
  assert.equal(editor.snapshot().undoDepth, 1);
  editor.undo();
  assert.equal(editor.snapshot().content, "你好世界");
});

test("一次 IME composition 的多次更新必须合并为一个 undo 事务", () => {
  const editor = createEditorInteractionHarness("");
  editor.beginComposition();
  editor.updateComposition("ni");
  editor.updateComposition("你");
  editor.endComposition();

  assert.equal(editor.snapshot().content, "你");
  assert.equal(editor.snapshot().undoDepth, 1);
  editor.undo();
  assert.equal(editor.snapshot().content, "");
});

test("剪贴板复制与粘贴必须使用当前选区且保持可撤销", () => {
  const source = createEditorInteractionHarness("甲乙丙");
  source.setSelection({ from: 1, to: 2 });

  const clipboard: ClipboardPayload = source.copySelection();
  const editor = createEditorInteractionHarness("甲丙");
  editor.setSelection({ from: 2, to: 2 });
  editor.paste(clipboard);

  assert.equal(clipboard.text, "乙");
  assert.equal(editor.snapshot().content, "甲丙乙");
  editor.undo();
  assert.equal(editor.snapshot().content, "甲丙");
});

test("redo 必须恢复最近一次撤销的编辑事务", () => {
  const editor = createEditorInteractionHarness("A");
  editor.setSelection({ from: 1, to: 1 });
  editor.replaceSelection("B");
  editor.undo();
  editor.redo();

  assert.equal(editor.snapshot().content, "AB");
  assert.deepEqual(editor.snapshot().selection, { from: 2, to: 2 });
});

test("序列化失败不得丢失内存内容，并必须暴露可恢复错误状态", () => {
  const editor = createEditorInteractionHarness("待保存");
  editor.setSelection({ from: 3, to: 3 });
  editor.replaceSelection("内容");

  editor.failSerialization("serializer failed");

  assert.equal(editor.snapshot().content, "待保存内容");
  assert.equal(editor.snapshot().dirty, true);
  assert.equal(editor.snapshot().saveStatus, "error");
  assert.equal(editor.snapshot().error, "serializer failed");
  editor.clearSaveError();
  assert.equal(editor.snapshot().error, null);
});

test("选区越界必须被拒绝，不能让事务进入非法坐标", () => {
  const editor = createEditorInteractionHarness("abc");

  assert.throws(() => editor.setSelection({ from: -1, to: 1 }), /selection/i);
  assert.throws(() => editor.setSelection({ from: 2, to: 1 }), /selection/i);
  assert.deepEqual(editor.snapshot().selection, { from: 0, to: 0 });
});
