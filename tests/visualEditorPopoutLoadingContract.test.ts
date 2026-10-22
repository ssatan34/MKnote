import { readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";

const popoutSource = readFileSync(
  new URL("../src/components/PopoutView.tsx", import.meta.url),
  "utf8",
);

test("Popout visual editor lazy-loads without the removed legacy preview editor", () => {
  assert.doesNotMatch(
    popoutSource,
    /import\s+\{\s*EditablePreviewEditor\s*\}\s+from\s+"\.\/EditablePreviewEditor"/,
  );
  assert.match(
    popoutSource,
    /const\s+VisualEditor\s*=\s*lazy\(\(\)\s*=>\s*import\("\.\/VisualEditor"\)/,
  );
  assert.match(popoutSource, /VisualEditorRecoveryPanel/);
  assert.doesNotMatch(popoutSource, /EditablePreviewEditor/);
});

test("Popout catches visual lazy-load failures and exposes source recovery", () => {
  assert.match(
    popoutSource,
    /import\s+\{\s*VisualEditorErrorBoundary\s*\}\s+from\s+"\.\/VisualEditorErrorBoundary"/,
  );
  assert.match(
    popoutSource,
    /<VisualEditorErrorBoundary\s+onError=\{openSourceEditor\}>[\s\S]*<VisualEditor[\s\S]*<\/VisualEditorErrorBoundary>/,
  );
  assert.match(popoutSource, /setVisualEditorFailed/);
  assert.match(popoutSource, /setViewMode\("edit"\)/);
  assert.match(popoutSource, /className="editor"/);
});
