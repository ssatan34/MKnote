import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const benchmarkSource = readFileSync(
  new URL("../scripts/phase1a-webview2-benchmark.mjs", import.meta.url),
  "utf8",
);

test("benchmark key timeout records bounded focus, selection, and event diagnostics", () => {
  assert.match(benchmarkSource, /function snapshotKeyFailureContext/);
  assert.match(benchmarkSource, /activeElement/);
  assert.match(benchmarkSource, /contentEditable/);
  assert.match(benchmarkSource, /selection/);
  assert.match(benchmarkSource, /eventCounts/);
  assert.match(benchmarkSource, /keyIndex/);
  assert.match(benchmarkSource, /MKN_PHASE1A_BENCHMARK_KEY_INITIAL_WAIT_MS/);
  assert.match(benchmarkSource, /keyInitialWaitMs/);
  assert.match(benchmarkSource, /MKN_PHASE1A_BENCHMARK_KEY_INPUT_MODE/);
  assert.match(benchmarkSource, /page\.keyboard\.insertText/);
  assert.match(benchmarkSource, /execCommand\("insertText"/);
  assert.match(benchmarkSource, /keyInputMode/);
  assert.match(benchmarkSource, /preventScroll:\s*true/);
});

test("formal keyboard press brings the WebView2 page to front before focusing the editor", () => {
  const start = benchmarkSource.indexOf("async function measureKeyToPaint");
  const end = benchmarkSource.indexOf("async function runColdStart", start);
  assert.ok(start >= 0 && end > start, "measureKeyToPaint source is missing");

  const measureKeyToPaint = benchmarkSource.slice(start, end);
  const bringToFrontIndex = measureKeyToPaint.indexOf("await page.bringToFront()");
  const focusIndex = measureKeyToPaint.indexOf("editor.focus");

  assert.ok(
    bringToFrontIndex >= 0 && bringToFrontIndex < focusIndex,
    "CDP keyboard input must target a frontmost WebView2 page before DOM focus",
  );
});
test("benchmark exposes click-focus as an explicit non-formal diagnostic mode", () => {
  assert.match(benchmarkSource, /MKN_PHASE1A_BENCHMARK_FOCUS_MODE/);
  assert.match(benchmarkSource, /focusMode/);
  assert.match(
    benchmarkSource,
    /locator\("\.ProseMirror"\)\.click\(\{\s*position:\s*\{\s*x:\s*40,\s*y:\s*24/,
  );
});
