import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import {
  captureReadyDiagnostics,
  classifyReadyTimeout,
} from "../scripts/phase1a-ready-diagnostics.mjs";

const pocRoot = path.resolve(import.meta.dirname, "..");

test("ready timeout classifies an editor create that has not completed", () => {
  assert.equal(
    classifyReadyTimeout({
      status: { state: "booting", text: "启动中" },
      editor: { exists: true, rootChildCount: 0 },
      timing: {
        createStartMarkCount: 1,
        stateInitMarkCount: 1,
        viewInitMarkCount: 0,
        createEndMarkCount: 0,
        readyMarkCount: 0,
      },
    }),
    "editor-create-incomplete",
  );
});

test("ready timeout classifies an explicit editor initialization error", () => {
  assert.equal(
    classifyReadyTimeout({
      status: { state: "error", text: "PoC 挂载失败" },
      editor: { exists: false, rootChildCount: 0 },
      timing: {
        createStartMarkCount: 1,
        stateInitMarkCount: 0,
        viewInitMarkCount: 0,
        createEndMarkCount: 0,
        readyMarkCount: 0,
      },
    }),
    "editor-init-error",
  );
});

test("ready timeout classifies a completed ready mark as an observation race", () => {
  assert.equal(
    classifyReadyTimeout({
      status: { state: "ready", text: "结构化状态就绪" },
      editor: { exists: true, rootChildCount: 2048 },
      timing: {
        createStartMarkCount: 1,
        stateInitMarkCount: 1,
        viewInitMarkCount: 1,
        createEndMarkCount: 1,
        readyMarkCount: 1,
      },
    }),
    "ready-observation-race",
  );
});

test("captureReadyDiagnostics returns a serializable snapshot and classification", async () => {
  const snapshot = {
    status: { state: "booting", text: "启动中" },
    editor: { exists: true, rootChildCount: 0 },
    timing: {
      createStartMarkCount: 1,
      stateInitMarkCount: 1,
      viewInitMarkCount: 0,
      createEndMarkCount: 0,
      readyMarkCount: 0,
    },
  };
  const page = {
    evaluate: async () => snapshot,
  };

  assert.deepEqual(await captureReadyDiagnostics(page), {
    ...snapshot,
    classification: "editor-create-incomplete",
  });
});

test("captureReadyDiagnostics includes browser loading events when provided", async () => {
  const snapshot = {
    status: { state: "booting", text: "启动中" },
    editor: { exists: false, rootChildCount: 0 },
    timing: {
      createStartMarkCount: 0,
      stateInitMarkCount: 0,
      viewInitMarkCount: 0,
      createEndMarkCount: 0,
      readyMarkCount: 0,
    },
  };
  const browserEvents = {
    pageErrors: ["Failed to load module"],
    consoleErrors: [],
    requestFailures: [{ url: "http://127.0.0.1:4234/src/main.ts" }],
    responses: [{ url: "http://127.0.0.1:4234/src/main.ts", status: 500 }],
  };
  const page = {
    evaluate: async () => snapshot,
  };

  assert.deepEqual(await captureReadyDiagnostics(page, browserEvents), {
    ...snapshot,
    browserEvents,
    classification: "editor-create-not-started",
  });
});

test("IME harness records ready diagnostics when readiness polling fails", () => {
  const imeProbe = fs.readFileSync(
    path.join(pocRoot, "scripts/phase1a-webview2-ime-e2e.mjs"),
    "utf8",
  );

  assert.match(imeProbe, /phase1a-ready-diagnostics/);
  assert.match(imeProbe, /readyDiagnostics/);
  assert.match(imeProbe, /captureReadyDiagnostics/);
});
