import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const repositoryRoot = process.cwd();
const fixturePath = join(
  repositoryRoot,
  "tests",
  "fixtures",
  "visual-editor",
  "imagePersistence.ts",
);
const scriptPath = join(repositoryRoot, "scripts", "visual-editor-image-persistence-e2e.mjs");

test("图片 visual Release 探针必须覆盖六类安全图片和危险源回退", () => {
  const fixtureSource = readFileSync(fixturePath, "utf8");
  const scriptSource = readFileSync(scriptPath, "utf8");

  assert.match(fixtureSource, /VISUAL_EDITOR_IMAGE_PERSISTENCE_FIXTURES/);
  for (const fixtureId of [
    "image-local",
    "image-hosted",
    "image-doodled",
    "image-width",
    "image-data",
    "image-dangerous",
  ]) {
    assert.match(fixtureSource, new RegExp(`\\"${fixtureId}\\"`));
  }

  assert.match(scriptSource, /mknote\.visual-editor\.phase2-production-image-persistence\.v1/);
  assert.match(scriptSource, /sourceUnchanged/);
  assert.match(scriptSource, /reopened/);
	assert.match(scriptSource, /fallbackSourceEditor/);
	assert.match(scriptSource, /mknote-markdown-editor/);
	assert.match(scriptSource, /WEBVIEW2_USER_DATA_FOLDER/);
	assert.match(scriptSource, /ownerPortsUntouched/);
	assert.match(scriptSource, /visual-prosemirror/);
	assert.match(scriptSource, /expectedRuntimeErrors/);
	assert.match(scriptSource, /ERR_CONNECTION_CLOSED/);
	assert.match(scriptSource, /cdn\.example\.com\/hosted\.png/);
});
