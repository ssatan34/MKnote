import assert from "node:assert/strict";
import test from "node:test";
import { buildBenchmarkMarkdown } from "./fixtures/visual-editor/benchmark.ts";

test("性能基准语料稳定生成 100KB 与 500KB 两档输入", () => {
  const oneHundredKb = buildBenchmarkMarkdown(100 * 1024);
  const fiveHundredKb = buildBenchmarkMarkdown(500 * 1024);

  assert.equal(Buffer.byteLength(oneHundredKb, "utf8"), 100 * 1024);
  assert.equal(Buffer.byteLength(fiveHundredKb, "utf8"), 500 * 1024);
  assert.match(oneHundredKb, /visual-editor-benchmark-0000/);
  assert.match(fiveHundredKb, /\| index \| text \|/);
});
