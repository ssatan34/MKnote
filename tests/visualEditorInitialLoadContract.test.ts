import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const visualEditorSource = readFileSync(
  new URL("../src/components/VisualEditor.tsx", import.meta.url),
  "utf8",
);
const adapterSource = readFileSync(
  new URL("../src/visual-editor/visualEditorAdapter.ts", import.meta.url),
  "utf8",
);

test("VisualEditor seeds Milkdown with the current note content", () => {
  assert.match(
    visualEditorSource,
    /createMilkdownVisualEditorAdapter\(\s*root,\s*latestInputsRef\.current\.content\s*(?:,\s*\{[\s\S]*?\}\s*)?\)/,
  );
  assert.doesNotMatch(
    visualEditorSource,
    /createMilkdownVisualEditorAdapter\(\s*root,\s*""\s*,/,
  );
});

test("Milkdown adapter skips the duplicate initial Markdown load", () => {
  assert.match(adapterSource, /let\s+currentMarkdown\s*=\s*initialMarkdown/);
  assert.match(adapterSource, /if\s*\(markdown\s*===\s*currentMarkdown\)\s*return/);
  // Task-marker normalization is part of the current adapter's persisted value.
  assert.match(adapterSource, /currentMarkdown\s*=\s*normalizeVisualTaskMarkdown\(markdown\)/);
});

test("VisualEditor does not reference an unowned Wikilink callback", () => {
  const usesWikilinkNavigation = /onWikilinkNavigateRef/.test(visualEditorSource);
  const declaresWikilinkNavigation = /const\s+onWikilinkNavigateRef\s*=/.test(visualEditorSource);

  assert.equal(usesWikilinkNavigation, declaresWikilinkNavigation);
});
