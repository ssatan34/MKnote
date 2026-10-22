import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const repositoryRoot = join(import.meta.dirname, "..");
const modeSource = readFileSync(join(repositoryRoot, "src", "utils", "visualEditorMode.ts"), "utf8");
const editorPaneSource = readFileSync(
  join(repositoryRoot, "src", "components", "compact", "EditorPane.tsx"),
  "utf8",
);
const popoutSource = readFileSync(join(repositoryRoot, "src", "components", "PopoutView.tsx"), "utf8");
const capsuleSource = readFileSync(join(repositoryRoot, "src", "components", "CapsuleView.tsx"), "utf8");

test("protected windows keep their editor boundaries while Popout P0 stays scoped", () => {
  assert.match(modeSource, /!privateModeActive\s*&&\s*!privacyMask/);
  assert.match(editorPaneSource, /privateModeActive/);
  assert.match(editorPaneSource, /privacyMask/);
  assert.match(popoutSource, /VisualEditorRecoveryPanel/);
  assert.match(popoutSource, /className="editor"/);
  assert.doesNotMatch(popoutSource, /EditablePreviewEditor/);
  assert.match(popoutSource, /resolveVisualEditorMode/);
  assert.match(popoutSource, /viewMode === "preview"/);
  assert.match(popoutSource, /zone !== "private"/);
  assert.match(popoutSource, /if \(windowMode === "capsule"\)/);
  assert.match(popoutSource, /setVisualEditorFailed/);
  const titlebarStart = popoutSource.indexOf('className="popout-titlebar"');
  const editorStart = popoutSource.indexOf('className="popout-editor"');
  const visualStart = popoutSource.indexOf("<VisualEditor");
  assert.ok(titlebarStart >= 0, "Popout titlebar must remain present");
  assert.ok(editorStart > titlebarStart, "Popout editor must remain below the titlebar");
  assert.ok(visualStart > editorStart, "Popout VisualEditor must not replace the titlebar");
  assert.doesNotMatch(
    popoutSource.slice(titlebarStart, editorStart),
    /<VisualEditor/,
    "Popout titlebar must not mount VisualEditor",
  );
  assert.doesNotMatch(capsuleSource, /VisualEditor/);
});
