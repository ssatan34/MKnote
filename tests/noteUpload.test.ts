import test from "node:test";
import assert from "node:assert/strict";
import { effectiveUploadTarget } from "../src/utils/noteUpload.ts";
import type { AppConfig } from "../src/types.ts";

test("legacy complete SiYuan config stays active, incomplete config stays disabled", () => {
  const legacy = { siyuan_api_url: "http://127.0.0.1:6806", siyuan_api_token: "fixture", siyuan_notebook_id: "notebook" } as AppConfig;
  assert.equal(effectiveUploadTarget(legacy), "siyuan");
  assert.equal(effectiveUploadTarget({ ...legacy, siyuan_notebook_id: " " }), "none");
  assert.equal(effectiveUploadTarget({} as AppConfig), "none");
});

test("explicit upload selection overrides legacy credentials, including all-off", () => {
  const legacy = { siyuan_api_url: "url", siyuan_api_token: "fixture", siyuan_notebook_id: "notebook" } as AppConfig;
  for (const target of ["none", "siyuan", "obsidian"] as const) {
    assert.equal(effectiveUploadTarget({ ...legacy, note_upload_target: target }), target);
  }
});
