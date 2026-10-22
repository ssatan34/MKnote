import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const probeSource = readFileSync("scripts/visual-editor-phase2-production-e2e.mjs", "utf8");

test("Phase 2 visual Release probe must exercise table creation persistence", () => {
  assert.match(probeSource, /visual-table-persistence/);
  assert.match(probeSource, /clickMarkdownToolbarAction\(runtime\.page, "表格"\)/);
  assert.match(probeSource, /locator\("\.ProseMirror table"\)/);
  assert.match(probeSource, /reopened visual table/);
  assert.match(probeSource, /visual table row append/);
  assert.match(probeSource, /keyboard\.press\("Tab"\)/);
});

test("Phase 2 visual Release probe must exercise table toolbar deletion alignment", () => {
  assert.match(probeSource, /visual-editor-table-align-center/);
  assert.match(probeSource, /visual-editor-table-add-column/);
  assert.match(probeSource, /visual-editor-table-delete-row/);
  assert.match(probeSource, /visual-editor-table-delete-column/);
  assert.match(probeSource, /visual table alignment persistence/);
  assert.match(probeSource, /reopened visual table alignment/);
});

test("table toolbar probe must preserve the aligned header while deleting another column", () => {
  assert.match(probeSource, /const secondHeaderCell = visual\.locator\("\.ProseMirror table th"\)\.nth\(1\)/);
  assert.match(probeSource, /clickVisiblePoint\(runtime\.page, secondHeaderCell, "second table header"\)/);
  assert.match(probeSource, /const alignedHeaderCell = visual\.locator\("\.ProseMirror table th"\)\.first\(\)/);
  assert.match(
    probeSource,
    /const remainingBodyCell = visual\.locator\("\.ProseMirror table tr"\)\.nth\(1\)\.locator\("th, td"\)\.nth\(1\)/,
  );
});

test("table toolbar probe must accept variable-width GFM alignment separators", () => {
  assert.match(probeSource, /:-\{3,\}:/);
});

test("table toolbar probe must exercise all three alignment commands", () => {
  assert.match(probeSource, /visual-editor-table-align-left/);
  assert.match(probeSource, /visual-editor-table-align-center/);
  assert.match(probeSource, /visual-editor-table-align-right/);
  assert.match(probeSource, /visual table left alignment/);
  assert.match(probeSource, /visual table right alignment/);
});
