import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const repositoryRoot = join(import.meta.dirname, "..");
const editorPane = readFileSync(
  join(repositoryRoot, "src", "components", "compact", "EditorPane.tsx"),
  "utf8",
);
const visualEditor = readFileSync(
  join(repositoryRoot, "src", "components", "VisualEditor.tsx"),
  "utf8",
);

test("生产 EditorPane 通过 flag 选择 P0 visual editor，并保留源码恢复路径", () => {
  assert.match(editorPane, /VITE_MKNOTE_EDITOR_MODE/);
  assert.match(editorPane, /shouldUseVisualEditor/);
  assert.match(editorPane, /VisualEditor/);
  assert.match(editorPane, /VisualEditorRecoveryPanel/);
  assert.doesNotMatch(editorPane, /EditablePreviewEditor/);
  assert.match(editorPane, /privateModeActive/);
  assert.match(editorPane, /privacyMask/);
});

test("visual editor component delegates Markdown changes and destroys the session", () => {
  assert.match(visualEditor, /createMilkdownVisualEditorAdapter/);
  assert.match(visualEditor, /createVisualEditorSession/);
  assert.match(visualEditor, /onChange/);
  assert.match(visualEditor, /sessionRef\.current\?\.destroy/);
});
