import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const pocRoot = path.resolve(import.meta.dirname, "..");
const read = (relativePath) =>
  fs.readFileSync(path.join(pocRoot, relativePath), "utf8");

test("Phase 1A WebView2 benchmark is isolated and reports protocol metrics", () => {
  const packageJson = JSON.parse(read("package.json"));
  const benchmark = read("scripts/phase1a-webview2-benchmark.mjs");

  assert.equal(
    packageJson.scripts["test:webview2:benchmark"],
    "node scripts/phase1a-webview2-benchmark.mjs",
  );
  for (const token of [
    "MKN_PHASE1A_BENCHMARK_DEV_PORT",
    "MKN_PHASE1A_BENCHMARK_CDP_PORT",
    "MKN_PHASE1A_BENCHMARK_COLD_SAMPLES",
    "MKN_PHASE1A_BENCHMARK_HOT_SAMPLES",
    "MKN_PHASE1A_BENCHMARK_KEY_SAMPLES",
    "MKN_PHASE1A_BENCHMARK_KEY_GAP_MS",
    "MKN_PHASE1A_BENCHMARK_EDITOR_PROFILE",
    "WEBVIEW2_USER_DATA_FOLDER",
    "CARGO_TARGET_DIR",
    "APPDATA",
    "LOCALAPPDATA",
    "TMP",
    "chromium.connectOverCDP",
    "mknote-editor-ready",
    "coldStart",
    "hotReload",
    "keyToPaint",
    "keyGapMs",
    "percentile",
    "buildHash",
    "limitations",
  ]) {
    assert.match(benchmark, new RegExp(token.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&")));
  }

  assert.match(benchmark, /benchmarkBytes/);
  assert.match(benchmark, /benchmarkEditorProfile/);
  assert.match(benchmark, /no-table-runtime/);
  assert.match(benchmark, /no-table-align-runtime/);
assert.match(benchmark, /no-table-editing-runtime/);
assert.match(benchmark, /incremental-table-align-runtime/);
assert.match(benchmark, /virtualized-blocks/);
  assert.match(benchmark, /100 \* 1024/);
  assert.match(benchmark, /500 \* 1024/);
  assert.match(benchmark, /beforeDevCommand/);
  assert.match(benchmark, /devUrl/);
  assert.match(benchmark, /CARGO_TARGET_DIR/);
  assert.doesNotMatch(benchmark, /MKN_PHASE1A_BENCHMARK_DEV_PORT \?\? 4173/);
  assert.match(benchmark, /process\.exitCode/);
});
