import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const popoutSource = readFileSync("src/components/PopoutView.tsx", "utf8");

test("Popout 保存必须使用 revision-aware 队列并携带 editor revision", () => {
  assert.match(popoutSource, /useQueuedNoteWriter/);
  assert.match(popoutSource, /writeNoteQueued/);
  assert.match(popoutSource, /editorRevision:\s*editorRevisionRef\.current/);
});
