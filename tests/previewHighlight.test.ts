import test from "node:test";
import assert from "node:assert/strict";
import { highlightPreviewCode } from "../src/utils/previewHighlight.ts";

test("plain Markdown does not load the syntax highlighter", async () => {
  let loads = 0;
  await highlightPreviewCode([], async () => {
    loads++;
    return { default: { highlightElement() {} } };
  });
  assert.equal(loads, 0);
});

test("code blocks share a module load and all reach the highlighter", async () => {
  const a = {} as HTMLElement; const b = {} as HTMLElement;
  const highlighted: HTMLElement[] = []; let loads = 0;
  await highlightPreviewCode([a, b], async () => {
    loads++;
    return { default: { highlightElement(node) { highlighted.push(node); } } };
  });
  assert.equal(loads, 1);
  assert.deepEqual(highlighted, [a, b]);
});
