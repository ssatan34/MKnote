import { readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";

const editorPaneSource = readFileSync(
  new URL("../src/components/compact/EditorPane.tsx", import.meta.url),
  "utf8",
);

test("EditorPane does not statically load VisualEditor", () => {
  assert.doesNotMatch(
    editorPaneSource,
    /import\s+\{\s*VisualEditor\s*\}\s+from\s+"\.\.\/VisualEditor"/,
  );
  assert.match(
    editorPaneSource,
    /const\s+VisualEditor\s*=\s*lazy\(\(\)\s*=>\s*import\("\.\.\/VisualEditor"\)/,
  );
});

test("EditorPane keeps visual and source-recovery branches under Suspense", () => {
  assert.match(
    editorPaneSource,
    /<Suspense\s+fallback=\{null\}>[\s\S]*useVisualEditor\s*\?[\s\S]*<VisualEditor[\s\S]*:[\s\S]*<VisualEditorRecoveryPanel/,
  );
  assert.doesNotMatch(editorPaneSource, /EditablePreviewEditor/);
});

test("EditorPane catches visual lazy-load failures and opens the source editor", () => {
  assert.match(editorPaneSource, /class\s+VisualEditorErrorBoundary\s+extends\s+Component/);
  assert.match(editorPaneSource, /static\s+getDerivedStateFromError/);
  assert.match(editorPaneSource, /componentDidCatch\s*\(/);
  assert.match(
    editorPaneSource,
    /<VisualEditorErrorBoundary\s+onError=\{openSourceEditor\}>[\s\S]*<VisualEditor/,
  );
  assert.match(editorPaneSource, /onOpenSourceEditor\?\.\(\)/);
});
