import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const { computeVirtualizedBlockRange } = await import(
  "../src/benchmarkDomVirtualization.ts",
);
const mainSource = fs.readFileSync(
  path.resolve(import.meta.dirname, "../src/main.ts"),
  "utf8",
);

test("virtualized block range clamps at the document edges", () => {
  assert.deepEqual(computeVirtualizedBlockRange(100, 0, 12), {
    start: 0,
    end: 12,
  });
  assert.deepEqual(computeVirtualizedBlockRange(100, 50, 12), {
    start: 44,
    end: 56,
  });
  assert.deepEqual(computeVirtualizedBlockRange(100, 99, 12), {
    start: 88,
    end: 100,
  });
});

test("virtualized block range handles empty and oversized documents", () => {
  assert.deepEqual(computeVirtualizedBlockRange(0, 0, 12), {
    start: 0,
    end: 0,
  });
  assert.deepEqual(computeVirtualizedBlockRange(5, 4, 12), {
    start: 0,
    end: 5,
  });
});

test("virtualized profile targets the ProseMirror editor view DOM", () => {
  assert.match(mainSource, /editorCtx\?\.get\(editorViewCtx\)\.dom/);
  assert.match(mainSource, /installBenchmarkDomVirtualization\(editorDom/);
});
