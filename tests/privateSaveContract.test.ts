import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const appSource = readFileSync("src/App.tsx", "utf8");

test("Private 保存必须复用 revision-aware 写入并携带 Private editor revision", () => {
  assert.match(appSource, /const flushPrivateNote = useCallback/);
  assert.match(appSource, /writeNoteQueued\("private", name, text/);
  assert.match(appSource, /editorRevision:\s*privateEditorRevisionRef\.current/);
});

test("隐藏路径必须等待 Private 脏内容写入完成", () => {
  const flushAllDirty = appSource.slice(
    appSource.indexOf("const flushAllDirty"),
    appSource.indexOf("const flushBeforeNavigation"),
  );
  assert.match(flushAllDirty, /await\s+flushPrivateNote\(\)/);
});
