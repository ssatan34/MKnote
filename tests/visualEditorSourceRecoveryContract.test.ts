import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const repositoryRoot = join(import.meta.dirname, "..");
const readSource = (...parts: string[]) => readFileSync(join(repositoryRoot, ...parts), "utf8");

test("visual editor failure exposes a source recovery path instead of the legacy preview editor", () => {
  const editorPane = readSource("src", "components", "compact", "EditorPane.tsx");
  const popout = readSource("src", "components", "PopoutView.tsx");
  const compactView = readSource("src", "components", "CompactView.tsx");
  const recoveryPanel = readSource("src", "components", "VisualEditorRecoveryPanel.tsx");

  assert.match(recoveryPanel, /打开源码编辑/);
  assert.match(editorPane, /VisualEditorRecoveryPanel/);
  assert.match(editorPane, /onOpenSourceEditor/);
  assert.doesNotMatch(editorPane, /EditablePreviewEditor/);
  assert.match(popout, /VisualEditorRecoveryPanel/);
  assert.match(popout, /setViewMode\("edit"\)/);
  assert.doesNotMatch(popout, /EditablePreviewEditor/);
  assert.match(compactView, /onOpenSourceEditor/);
});

test("legacy preview implementation is removed after source recovery is available", () => {
  assert.equal(
    existsSync(join(repositoryRoot, "src", "components", "EditablePreviewEditor.tsx")),
    false,
  );
  assert.equal(
    existsSync(join(repositoryRoot, "src", "components", "EditablePreviewEditor.css")),
    false,
  );
});
