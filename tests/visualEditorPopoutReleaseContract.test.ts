import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const repositoryRoot = join(import.meta.dirname, "..");
const lifecycleSource = readFileSync(
  join(repositoryRoot, "scripts", "visual-editor-phase2-lifecycle-e2e.mjs"),
  "utf8",
);

test("Popout visual P0 has an opt-in isolated Release probe", () => {
  assert.match(lifecycleSource, /MKN_PHASE3_POPOUT_VISUAL/);
  assert.match(lifecycleSource, /popoutVisualMode/);
  assert.match(lifecycleSource, /popout-visual-p0/);
  assert.match(lifecycleSource, /切换到预览/);
  assert.match(lifecycleSource, /data-testid=\\?"mknote-visual-editor/);
  assert.match(lifecycleSource, /data-editor-ready=\\?"true/);
  assert.match(lifecycleSource, /popout-view--capsule/);
  assert.match(lifecycleSource, /visualDisabled/);
});
