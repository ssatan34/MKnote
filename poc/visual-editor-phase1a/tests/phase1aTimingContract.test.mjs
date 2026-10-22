import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const pocRoot = path.resolve(import.meta.dirname, "..");
const read = (relativePath) =>
  fs.readFileSync(path.join(pocRoot, relativePath), "utf8");

test("benchmark exposes editor creation and first-frame timing without content", () => {
  const main = read("src/main.ts");
  const benchmark = read("scripts/phase1a-webview2-benchmark.mjs");

  assert.match(main, /performance\.mark\("mknote-editor-create-start"\)/);
  assert.match(main, /performance\.mark\("mknote-editor-create-end"\)/);
  assert.match(benchmark, /createDurationMs/);
  assert.match(benchmark, /readyToFirstFrameMs/);
  assert.match(benchmark, /editorTiming/);
  assert.doesNotMatch(benchmark, /innerHTML/);
});
test("benchmark exposes state and view phase timing for table diagnosis", () => { const main = read("src/main.ts"); const benchmark = read("scripts/phase1a-webview2-benchmark.mjs"); assert.match(main, /mknote-editor-state-init/); assert.match(main, /mknote-editor-view-init/); assert.match(benchmark, /stateInitMs/); assert.match(benchmark, /viewInitMs/); });
