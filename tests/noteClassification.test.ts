import test from "node:test";
import assert from "node:assert/strict";
import { canClassifyNote, classificationReady } from "../src/utils/noteClassification.ts";
import type { NoteClassificationConfig } from "../src/types.ts";

test("classification follows current folder and excludes special/private notes", () => {
  assert.equal(canClassifyNote("default", "note.md"), true);
  for (const zone of ["inbox", "private", "folder:work"] as const) assert.equal(canClassifyNote(zone, "note.md"), false);
  assert.equal(canClassifyNote("default", "note.md", true), false);
  assert.equal(canClassifyNote("default", "note.md", false, true), false);
  assert.equal(canClassifyNote("default", "default-note.md"), false);
  assert.equal(canClassifyNote("default", "待办事项.md"), false);
  // Returning a note to Default makes it eligible again.
  assert.equal(canClassifyNote("default", "note.md"), true);
});

test("classification uses the selected provider's key and requires configured candidates", () => {
  const config: NoteClassificationConfig = { enabled: true, provider: "official", official: { api_token: "fixture" }, commandcode: {}, folders: [{ zone: "folder:work", description: "工作" }] };
  assert.equal(classificationReady(config), true);
  assert.equal(classificationReady({ ...config, provider: "commandcode" }), false);
  assert.equal(classificationReady({ ...config, enabled: false }), false);
  assert.equal(classificationReady({ ...config, folders: [] }), false);
  assert.equal(classificationReady(undefined), false);
});
