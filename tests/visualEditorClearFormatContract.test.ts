import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const adapterSource = readFileSync("src/visual-editor/visualEditorAdapter.ts", "utf8");

test("Visual clear-format removes marks from the selected ProseMirror range", () => {
  assert.match(adapterSource, /function clearVisualSelectionFormatting[\s\S]*?removeMark/);
  assert.match(adapterSource, /case "clear-format":\s*return clearVisualSelectionFormatting/);
});
