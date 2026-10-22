import assert from "node:assert/strict";
import test from "node:test";
import {
  findVisualTextRanges,
  selectNextVisualRange,
  type VisualTextNode,
} from "../src/visual-editor/visualEditorSearch.ts";

test("查找模型返回每个文本节点中的稳定 ProseMirror 区间", () => {
  const nodes: VisualTextNode[] = [
    { from: 1, text: "alpha beta " },
    { from: 14, text: "alpha" },
  ];

  assert.deepEqual(findVisualTextRanges(nodes, "alpha"), [
    { from: 1, to: 6 },
    { from: 14, to: 19 },
  ]);
  assert.deepEqual(findVisualTextRanges(nodes, ""), []);
});

test("查找下一个从当前结果之后继续并在末尾循环", () => {
  const ranges = [
    { from: 1, to: 6 },
    { from: 14, to: 19 },
  ];

  assert.deepEqual(selectNextVisualRange(ranges, { from: 1, to: 6 }), { from: 14, to: 19 });
  assert.deepEqual(selectNextVisualRange(ranges, { from: 14, to: 19 }), { from: 1, to: 6 });
  assert.equal(selectNextVisualRange([], { from: 0, to: 0 }), null);
});
