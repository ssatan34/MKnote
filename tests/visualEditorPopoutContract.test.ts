import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const repositoryRoot = join(import.meta.dirname, "..");
const popoutSource = readFileSync(join(repositoryRoot, "src", "components", "PopoutView.tsx"), "utf8");
const capsuleSource = readFileSync(join(repositoryRoot, "src", "components", "CapsuleView.tsx"), "utf8");

test("Popout visual P0 is explicit, preview-only, non-private, and recoverable", () => {
  assert.match(popoutSource, /VITE_MKNOTE_EDITOR_MODE/);
  assert.match(popoutSource, /resolveVisualEditorMode/);
  assert.match(popoutSource, /viewMode === "preview"/);
  assert.match(popoutSource, /zone !== "private"/);
  assert.match(popoutSource, /<VisualEditor/);
  assert.match(popoutSource, /onPrepareMigrationSnapshot/);
  assert.match(popoutSource, /setVisualEditorFailed/);
  assert.match(popoutSource, /VisualEditorRecoveryPanel/);
  assert.match(popoutSource, /className="editor"/);
  assert.doesNotMatch(popoutSource, /EditablePreviewEditor/);
  const editorStart = popoutSource.indexOf('className="popout-editor"');
  const visualStart = popoutSource.indexOf("<VisualEditor");
  assert.ok(editorStart >= 0, "Popout editor container must remain present");
  assert.ok(visualStart > editorStart, "VisualEditor must render inside the Popout editor area");
  assert.doesNotMatch(capsuleSource, /<VisualEditor/);
});
