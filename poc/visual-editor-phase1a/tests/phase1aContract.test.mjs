import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const pocRoot = new URL("../", import.meta.url);

const readPocFile = (relativePath) =>
  readFileSync(new URL(relativePath, pocRoot), "utf8");

test("Phase 1A PoC 是私有包，不接入生产保存链", () => {
  const packageJson = JSON.parse(readPocFile("package.json"));
  const source = readPocFile("src/main.ts");

  assert.equal(packageJson.private, true);
  assert.equal(packageJson.name, "mknote-visual-editor-phase1a-poc");
  assert.ok(packageJson.dependencies?.["@milkdown/kit"]);
  assert.match(
    packageJson.scripts?.test ?? "",
    /tests\/phase1aRawHtmlComment\.test\.mjs/,
  );
  assert.match(source, /Editor\.make\(\)/);
  assert.match(source, /rootCtx/);
  assert.match(source, /defaultValueCtx/);
  assert.match(source, /listenerCtx/);
  assert.match(source, /history/);
  assert.doesNotMatch(source, /save-file|notesService|useQueuedNoteWriter|EditorPane/);
  assert.doesNotMatch(source, /innerHTML/);
});

test("benchmark query mode is explicit and preserves the normal PoC path", () => {
  const source = readPocFile("src/main.ts");

  assert.match(source, /parseBenchmarkBytes\(window\.location\.search\)/);
  assert.match(
    source,
    /buildBenchmarkMarkdown\(\s*benchmarkBytes,\s*benchmarkFixture,\s*benchmarkTableCount\s*,?\s*\)/,
  );
  assert.match(source, /defaultValueCtx, initialMarkdown/);
  assert.match(source, /mknote-editor-ready/);
});

test("benchmark mode keeps full Markdown serialization off the key path", () => {
  const source = readPocFile("src/main.ts");

  assert.match(source, /const isBenchmarkMode = benchmarkBytes !== null/);
  assert.match(
    source,
    /if \(!isBenchmarkMode\) \{[\s\S]*listenerCtx[\s\S]*markdownUpdated/,
  );
  assert.match(
    source,
    /if \(!isBenchmarkMode\) \{[\s\S]*\.use\(listener\)/,
  );
});
test("normal PoC path uses bounded table alignment while diagnostics stay explicit", () => { const source = readPocFile("src/main.ts"); assert.match(source, /!isBenchmarkMode[\s\S]*benchmarkEditorProfile === "normal"[\s\S]*benchmarkEditorProfile === "virtualized-blocks"[\s\S]*editor\.use\(gfmWithoutTableAlignRuntime\)\.use\(incrementalTableAlignPlugin\)/); assert.match(source, /benchmarkEditorProfile === "incremental-table-align-runtime"[\s\S]*editor\.use\(gfmWithoutTableAlignRuntime\)\.use\(incrementalTableAlignPlugin\)/); });
