import assert from "node:assert/strict";
import test from "node:test";

const { normalizeEditorStructure } = await import(
  "../scripts/editor-structure.mjs",
);

test("editor structure snapshot keeps only non-content counts", () => {
  const snapshot = normalizeEditorStructure({
    rootChildCount: 1,
    descendantElementCount: 7,
    tableCount: 1,
    rowCount: 2,
    cellCount: 4,
    paragraphCount: 0,
    listItemCount: 0,
  headingCount: 1,
  imageCount: 0,
  textContentLength: 42,
  visibleDirectBlockCount: 1,
  hiddenDirectBlockCount: 0,
  textContent: "private markdown body",
    html: "<table>private markdown body</table>",
  });

  assert.deepEqual(snapshot, {
    rootChildCount: 1,
    descendantElementCount: 7,
    tableCount: 1,
    rowCount: 2,
    cellCount: 4,
    paragraphCount: 0,
    listItemCount: 0,
  headingCount: 1,
  imageCount: 0,
  textContentLength: 42,
  visibleDirectBlockCount: 1,
  hiddenDirectBlockCount: 0,
});
  assert.equal("textContent" in snapshot, false);
  assert.equal("html" in snapshot, false);
  assert.throws(
    () => normalizeEditorStructure({ ...snapshot, rowCount: -1 }),
    /non-negative integer/,
  );
});
