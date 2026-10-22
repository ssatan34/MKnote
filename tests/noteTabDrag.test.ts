import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  applyTabDisplacement,
  clearTabDisplacementWithoutAnimation,
  canReorderTabGroups,
  findTabIntrusionTarget,
  getTabDisplacement,
  nativePreviewOffset,
  reorderTabsByKey,
} from "../src/utils/noteTabDragModel.ts";

const key = (tab: { id: string }) => tab.id;

test("只移动一个 Tab，并保持其他 Tab 的相对顺序", () => {
  const tabs = [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }];

  const result = reorderTabsByKey(tabs, "b", "d", key);

  assert.deepEqual(result.map(key), ["a", "c", "d", "b"]);
  assert.deepEqual(tabs.map(key), ["a", "b", "c", "d"]);
});

test("拖回原标签时不改变顺序", () => {
  const tabs = [{ id: "a" }, { id: "b" }, { id: "c" }];

  assert.deepEqual(reorderTabsByKey(tabs, "b", "b", key), tabs);
});

test("找不到拖拽目标时不改变顺序", () => {
  const tabs = [{ id: "a" }, { id: "b" }];

  assert.deepEqual(reorderTabsByKey(tabs, "missing", "b", key), tabs);
  assert.deepEqual(reorderTabsByKey(tabs, "a", "missing", key), tabs);
});

test("普通标签和锁定标签只在各自分组内排序", () => {
  assert.equal(canReorderTabGroups(false, false), true);
  assert.equal(canReorderTabGroups(true, true), true);
  assert.equal(canReorderTabGroups(false, true), false);
  assert.equal(canReorderTabGroups(true, false), false);
});

test("原生拖拽预览沿用鼠标在标签内的抓取点", () => {
  assert.deepEqual(
    nativePreviewOffset(
      { left: 240, top: 72 },
      { clientX: 286, clientY: 91 },
    ),
    { x: 46, y: 19 },
  );
});

test("拖入相邻标签超过 8px 才补位，退回 8px 内立即复原", () => {
  const rects = [
    { key: "a", left: 0, right: 100 },
    { key: "b", left: 100, right: 220 },
    { key: "c", left: 220, right: 300 },
  ];

  assert.equal(findTabIntrusionTarget(rects, "a", 47, 40, 100), "a");
  assert.equal(findTabIntrusionTarget(rects, "a", 49, 40, 100), "b");
  assert.equal(findTabIntrusionTarget(rects, "a", 47, 40, 100), "a");
});

test("向左拖动使用同一条 8px 边界且没有滞回区", () => {
  const rects = [
    { key: "a", left: 0, right: 100 },
    { key: "b", left: 100, right: 220 },
  ];

  assert.equal(findTabIntrusionTarget(rects, "b", 133, 40, 120), "b");
  assert.equal(findTabIntrusionTarget(rects, "b", 131, 40, 120), "a");
  assert.equal(findTabIntrusionTarget(rects, "b", 133, 40, 120), "b");
});

test("只让被跨过的标签按被拖拽标签宽度补位", () => {
  const keys = ["a", "b", "c", "d"];

  assert.deepEqual(getTabDisplacement(keys, "a", "b", 100), {
    a: 0,
    b: -100,
    c: 0,
    d: 0,
  });
  assert.deepEqual(getTabDisplacement(keys, "c", "a", 80), {
    a: 80,
    b: 80,
    c: 0,
    d: 0,
  });
});

test("拖拽事件可以直接把补位位移写入现有 Tab 元素", () => {
  const tabs = [
    { key: "a", x: 999 },
    { key: "b", x: 999 },
    { key: "c", x: 999 },
  ];

  applyTabDisplacement(
    tabs,
    { a: 0, b: -102, c: 0 },
    (tab) => tab.key,
    (tab, x) => { tab.x = x; },
  );

  assert.deepEqual(tabs.map((tab) => tab.x), [0, -102, 0]);
});

test("松手提交排序前无动画地清除所有临时位移", () => {
  const tabs = [
    { transform: "translateX(120px)", transition: "" },
    { transform: "translateX(-80px)", transition: "" },
  ];

  clearTabDisplacementWithoutAnimation(
    tabs,
    (tab, value) => { tab.transition = value; },
    (tab, value) => { tab.transform = value; },
  );

  assert.deepEqual(tabs, [
    { transform: "", transition: "none" },
    { transform: "", transition: "none" },
  ]);
});

test("WebView2 栏内排序使用 Pointer 拖拽，避开原生拖拽事件阻塞", () => {
  const tabsBar = readFileSync(new URL("../src/components/NoteTabsBar.tsx", import.meta.url), "utf8");

  assert.match(tabsBar, /setPointerCapture/);
  assert.match(tabsBar, /onPointerDown=\{onPointerDown\}/);
  assert.doesNotMatch(tabsBar, /monitorForElements/);
});

test("中键关闭在 PointerDown 阶段拦截默认自动滚动，普通悬浮不显示拖拽光标", () => {
  const tabsBar = readFileSync(new URL("../src/components/NoteTabsBar.tsx", import.meta.url), "utf8");
  const tabsCss = readFileSync(new URL("../src/components/NoteTabsBar.css", import.meta.url), "utf8");

  assert.match(tabsBar, /if \(event\.button === 1\)[\s\S]*?event\.preventDefault\(\)[\s\S]*?onMiddleClickClose/);
  assert.match(tabsCss, /\.note-tab\s*\{[\s\S]*?cursor:\s*pointer;/);
  assert.doesNotMatch(tabsCss, /\.note-tab\s*\{[\s\S]*?cursor:\s*grab;/);
});

test("拖出主窗口使用与原 Tab 同尺寸、同抓取点的透明预览窗", () => {
  const tabsBar = readFileSync(new URL("../src/components/NoteTabsBar.tsx", import.meta.url), "utf8");
  const tabsCss = readFileSync(new URL("../src/components/NoteTabsBar.css", import.meta.url), "utf8");
  const detach = readFileSync(new URL("../src-tauri/src/detach.rs", import.meta.url), "utf8");
  const main = readFileSync(new URL("../src/main.tsx", import.meta.url), "utf8");

  assert.match(tabsBar, /showTabDragPreview/);
  assert.match(tabsBar, /grabOffsetX/);
  assert.match(tabsBar, /classList\.add\("drag-outside"\)/);
  assert.match(tabsCss, /\.note-tab\.dragging\.drag-outside\s*\{[^}]*opacity:\s*0/s);
  assert.match(detach, /show_tab_drag_preview/);
  assert.match(detach, /grab_offset_x/);
  assert.match(main, /TabDragPreviewView/);
});
