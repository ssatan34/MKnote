import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  refreshEditorFocusAfterWindowMove,
  type EditorFocusTarget,
} from "../src/utils/windowMoveEditorFocus.ts";

const compactViewSource = readFileSync("src/components/CompactView.tsx", "utf8");
const compactHeaderSource = readFileSync("src/components/compact/CompactHeader.tsx", "utf8");
const appCssSource = readFileSync("src/App.css", "utf8");

function createFocusTarget(events: string[]): EditorFocusTarget {
  return {
    isConnected: true,
    blur: () => events.push("blur"),
    focus: (options) => events.push(options?.preventScroll ? "focus:no-scroll" : "focus"),
  };
}

test("窗口移动后的编辑器焦点刷新必须先 blur，再在下一帧 focus", () => {
  const events: string[] = [];
  const frames: Array<() => void> = [];
  const editor = createFocusTarget(events);

  refreshEditorFocusAfterWindowMove(editor, (callback) => frames.push(callback));

  assert.deepEqual(events, ["blur"]);
  assert.equal(frames.length, 1);

  frames[0]();

  assert.deepEqual(events, ["blur", "focus:no-scroll"]);
});

test("主窗口拖动必须使用单一 JS 入口，并在移动结束后刷新编辑器焦点", () => {
  assert.match(compactViewSource, /appBridge\.window\.current\(\)\.onMoved\(/);
  assert.match(compactViewSource, /refreshEditorFocusAfterWindowMove\(/);
  assert.match(compactViewSource, /appBridge\.window\.startDragging\(\)/);
  assert.doesNotMatch(compactHeaderSource, /data-tauri-drag-region/);
  assert.doesNotMatch(
    appCssSource,
    /\.compact-header\s*\{[^}]*-webkit-app-region:\s*drag/s,
  );
});
