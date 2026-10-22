import assert from "node:assert/strict";
import test from "node:test";
import { Schema } from "@milkdown/kit/prose/model";
import { EditorState, TextSelection } from "@milkdown/kit/prose/state";
import { applyFormatToTextarea } from "../src/utils/editorFormat.ts";
import { selectedLinesToTasks } from "../src/visual-editor/visualEditorTasks.ts";

test("文本选区逐行转换，保留空行、缩进和任务状态，排除末尾未选行", () => {
  const value = "前文\n甲\n\n  乙\n- [x] 完成\n- [ ] 已有\n后文";
  const textarea = { value, selectionStart: 4, selectionEnd: value.indexOf("后文"), focus() {} } as HTMLTextAreaElement;
  assert.equal(applyFormatToTextarea(textarea, "task"),
    "前文\n- [ ] 甲\n\n  - [ ] 乙\n- [x] 完成\n- [ ] 已有\n后文");
});

test("文本没有选区时保留单行任务切换", () => {
  const textarea = { value: "- [ ] 甲\n乙", selectionStart: 7, selectionEnd: 7, focus() {} } as HTMLTextAreaElement;
  assert.equal(applyFormatToTextarea(textarea, "task"), "甲\n乙");
});

const schema = new Schema({
  nodes: {
    doc: { content: "block+" },
    paragraph: { content: "inline*", group: "block" },
    text: { group: "inline" },
    hardbreak: { inline: true, group: "inline" },
    bullet_list: { content: "list_item+", group: "block" },
    list_item: { content: "paragraph block*", attrs: { checked: { default: null } } },
  },
  marks: { strong: {} },
});
const p = (text: string) => schema.node("paragraph", null, text ? schema.text(text) : undefined);
const task = (text: string, checked: boolean | null) => schema.node("list_item", { checked }, p(text));

test("可视化逐行拆分软换行和硬换行，保留空段、格式及已有完成状态", () => {
  const strong = schema.mark("strong");
  const doc = schema.node("doc", null, [
    schema.node("paragraph", null, [schema.text("甲\n乙", [strong]), schema.node("hardbreak"), schema.text("丙")]),
    p(""),
    schema.node("bullet_list", null, [task("完成", true), task("已有", false), task("普通", null)]),
  ]);
  const state = EditorState.create({ doc, selection: TextSelection.create(doc, 1, doc.content.size - 3) });
  const next = selectedLinesToTasks(state).doc;
  assert.equal(next.childCount, 3);
  assert.equal(next.child(1).type.name, "paragraph");
  assert.equal(next.child(1).textContent, "");
  assert.deepEqual([0, 1, 2].map((i) => next.firstChild!.child(i).textContent), ["甲", "乙", "丙"]);
  assert.equal(next.child(0).firstChild!.firstChild!.firstChild!.marks[0].type.name, "strong");
  assert.deepEqual([0, 1, 2].map((i) => next.lastChild!.child(i).attrs.checked), [true, false, false]);
  next.check();
});

test("可视化只转换选区触及的实际行，保留前后文字", () => {
  const doc = schema.node("doc", null, p("前\n目标\n后"));
  const state = EditorState.create({ doc, selection: TextSelection.create(doc, 3, 5) });
  const next = selectedLinesToTasks(state).doc;
  assert.deepEqual([0, 1, 2].map((i) => [next.child(i).type.name, next.child(i).textContent]),
    [["paragraph", "前"], ["bullet_list", "目标"], ["paragraph", "后"]]);
  next.check();
});

test("可视化普通列表的实际换行拆为独立任务并保留子列表", () => {
  const nested = schema.node("bullet_list", null, task("子项", null));
  const doc = schema.node("doc", null, schema.node("bullet_list", null,
    schema.node("list_item", null, [p("甲\n乙"), nested])));
  const state = EditorState.create({ doc, selection: TextSelection.create(doc, 3, 6) });
  const next = selectedLinesToTasks(state).doc;
  assert.equal(next.firstChild!.childCount, 2);
  assert.equal(next.firstChild!.child(0).attrs.checked, false);
  assert.equal(next.firstChild!.child(1).attrs.checked, false);
  assert.ok(next.firstChild!.child(1).lastChild!.eq(nested));
  next.check();
});
