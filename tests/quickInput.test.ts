import assert from "node:assert/strict";
import test from "node:test";
import { shouldInsertNewline, shouldSubmitInputKey } from "../src/utils/quickInputModel.ts";

test("Enter submits input", () => {
  assert.equal(shouldSubmitInputKey({ key: "Enter", shiftKey: false }), true);
  assert.equal(shouldSubmitInputKey({ key: "Enter", shiftKey: true }), false);
  assert.equal(shouldSubmitInputKey({ key: "Enter", shiftKey: false, isComposing: true }), false);
});

test("Shift+Enter inserts a newline", () => {
  assert.equal(shouldInsertNewline({ key: "Enter", shiftKey: true }), true);
  assert.equal(shouldInsertNewline({ key: "Enter", shiftKey: false }), false);
});
