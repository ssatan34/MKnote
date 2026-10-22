import assert from "node:assert/strict";
import test from "node:test";

import { buildGateScopePreview } from "../scripts/preview-visual-editor-gate-b-p0.mjs";

const records = [
  "compatibility-corpus",
  "source-aware-safety",
  "selection-history-paste",
  "webview2-performance-100kb",
  "save-cas-fault-injection",
  "webview2-performance-500kb",
  "process-memory",
  "release-package",
].map((id) => ({ id, status: id === "webview2-performance-500kb" || id === "process-memory" ? "failed" : "pass" }));

test("P0 scope preview keeps formal Gate blocked and retains P1-specific failures", () => {
  const preview = buildGateScopePreview({
    manifest: { generatedAt: "2026-08-24T00:00:00.000Z", gate: { status: "blocked" }, records },
    t5Launch: { ownerEvidence: "pending" },
    generatedAt: "2026-08-24T01:00:00.000Z",
  });

  assert.equal(preview.authority, "non-authoritative-preview");
  assert.equal(preview.recommendedPath, "B");
  assert.equal(preview.gate.currentStatus, "blocked");
  assert.equal(preview.gate.previewStatus, "pending-owner");
  assert.equal(preview.t5.ownerEvidence, "pending");
  assert.deepEqual(
    preview.decisionRequiredRecords.map((record) => record.id),
    ["webview2-performance-500kb", "process-memory"],
  );
  assert.ok(preview.invariants.failedEvidenceRetained);
  assert.ok(!preview.invariants.writesFormalManifest);
  assert.ok(!preview.invariants.productionIntegration);
});

test("P0 scope preview becomes ready for an Owner scope decision only after T5 and P0 evidence pass", () => {
  const preview = buildGateScopePreview({
    manifest: { gate: { status: "blocked" }, records: records.map((record) => ({ ...record, status: "pass" })) },
    t5Launch: { ownerEvidence: "pass" },
    generatedAt: "2026-08-24T01:00:00.000Z",
  });

  assert.equal(preview.gate.previewStatus, "ready-for-owner-decision");
  assert.equal(preview.gate.canApplyRecommendedScope, false);
});

test("P0 scope preview rejects a manifest missing a required P0 record", () => {
  assert.throws(
    () =>
      buildGateScopePreview({
        manifest: { gate: { status: "blocked" }, records: records.filter((record) => record.id !== "save-cas-fault-injection") },
        t5Launch: { ownerEvidence: "pending" },
      }),
    /missing required P0 evidence record: save-cas-fault-injection/,
  );
});
