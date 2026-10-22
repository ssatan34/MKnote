import test from "node:test";
import assert from "node:assert/strict";
import { fitPinnedTabs } from "../src/utils/pinnedTabLayout.ts";

test("全部标题放得下时使用整行，不预留更多按钮", () => {
  assert.deepEqual(fitPinnedTabs([56, 160, 110], 334, -1), [0, 1, 2]);
  assert.deepEqual(fitPinnedTabs([], 700, -1), []);
});

test("空间不足时保留可辨认宽度和排序，并为更多入口让位", () => {
  assert.deepEqual(fitPinnedTabs([100, 180, 150, 56], 400, -1), [0, 1]);
  assert.deepEqual(fitPinnedTabs([220, 220], 200, -1), []);
});

test("从更多选择笔记后展示当前项，其他可见项保持原顺序", () => {
  assert.deepEqual(fitPinnedTabs([100, 180, 150, 56], 400, 3), [0, 3]);
  assert.deepEqual(fitPinnedTabs([100, 180, 150, 56], 400, 2), [0, 2]);
});

test("窗口变宽后恢复全部笔记，较短标题不被均分成长格子", () => {
  const widths = [56, 220, 140, 90];
  assert.deepEqual(fitPinnedTabs(widths, 300, 3), [0, 3]);
  assert.deepEqual(fitPinnedTabs(widths, 700, 3), [0, 1, 2, 3]);
});
