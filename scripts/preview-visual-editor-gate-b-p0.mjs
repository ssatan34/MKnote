/**
 * 生成 Gate B-P0 的 P0/P1 范围预览。
 *
 * 该脚本只读取正式 manifest 和 T5 启动记录，输出非权威 preview；
 * 不改写正式 manifest，不改变生产接入边界。
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(import.meta.dirname, "..");

const P0_EVIDENCE_IDS = Object.freeze([
  "compatibility-corpus",
  "source-aware-safety",
  "selection-history-paste",
  "webview2-performance-100kb",
  "save-cas-fault-injection",
]);

const DECISION_REQUIRED_IDS = Object.freeze([
  "webview2-performance-500kb",
  "process-memory",
]);

const SUPPORTING_EVIDENCE_IDS = Object.freeze(["release-package"]);

function indexRecords(records) {
  if (!Array.isArray(records)) {
    throw new Error("manifest.records must be an array");
  }

  return new Map(records.filter((record) => record && typeof record.id === "string").map((record) => [record.id, record]));
}

function selectRecords(recordMap, ids, label) {
  return ids.map((id) => {
    const record = recordMap.get(id);
    if (!record) {
      throw new Error(`missing required ${label} evidence record: ${id}`);
    }
    return record;
  });
}

function isPass(record) {
  return record.status === "pass";
}

function summarizeRecord(record) {
  return {
    id: record.id,
    status: record.status ?? "unknown",
    summary: record.summary ?? null,
    sourcePath: record.sourcePath ?? null,
    command: record.command ?? null,
  };
}

export function buildGateScopePreview({ manifest, t5Launch, generatedAt = new Date().toISOString(), sourcePaths = {} }) {
  const recordMap = indexRecords(manifest?.records);
  const p0Records = selectRecords(recordMap, P0_EVIDENCE_IDS, "P0");
  const decisionRecords = selectRecords(recordMap, DECISION_REQUIRED_IDS, "decision");
  const supportingRecords = selectRecords(recordMap, SUPPORTING_EVIDENCE_IDS, "supporting");
  const ownerEvidence = t5Launch?.ownerEvidence ?? "pending";
  const p0EvidencePass = p0Records.every(isPass);

  return {
    schemaVersion: "mknote.visual-editor.gate-b-p0-scope-preview.v1",
    generatedAt,
    authority: "non-authoritative-preview",
    recommendedPath: "B",
    source: {
      manifestGeneratedAt: manifest?.generatedAt ?? null,
      manifestGateStatus: manifest?.gate?.status ?? "unknown",
      manifestPath: sourcePaths.manifest ?? null,
      t5LaunchPath: sourcePaths.t5Launch ?? null,
    },
    gate: {
      currentStatus: manifest?.gate?.status ?? "unknown",
      currentBlockingIds: Array.isArray(manifest?.gate?.blockingIds)
        ? [...manifest.gate.blockingIds]
        : [],
      previewStatus: p0EvidencePass && ownerEvidence === "pass"
        ? "ready-for-owner-decision"
        : "pending-owner",
      canApplyRecommendedScope: false,
    },
    t5: {
      ownerEvidence,
      status: ownerEvidence === "pass" ? "pass" : "pending",
    },
    p0Records: p0Records.map(summarizeRecord),
    decisionRequiredRecords: decisionRecords.map(summarizeRecord),
    supportingRecords: supportingRecords.map(summarizeRecord),
    invariants: {
      failedEvidenceRetained: true,
      writesFormalManifest: false,
      productionIntegration: false,
    },
  };
}

function parseArgs(argv) {
  const options = {
    manifest: path.join(repositoryRoot, "poc", "visual-editor-phase1a", "artifacts", "phase1a-t4-evidence-manifest.json"),
    t5Launch: path.join(repositoryRoot, "poc", "visual-editor-phase1a", "artifacts", "t5-owner", "t5-owner-20260824-rerun", "launch.json"),
    output: path.join(repositoryRoot, "poc", "visual-editor-phase1a", "artifacts", "phase1a-gate-b-p0-scope-preview.json"),
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (!(argument in { "--manifest": true, "--t5-launch": true, "--output": true })) {
      throw new Error(`unknown argument: ${argument}`);
    }
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) {
      throw new Error(`missing value for ${argument}`);
    }
    const key = argument.slice(2).replaceAll("-", "");
    if (key === "manifest") options.manifest = path.resolve(value);
    if (key === "t5launch") options.t5Launch = path.resolve(value);
    if (key === "output") options.output = path.resolve(value);
    index += 1;
  }

  return options;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, ""));
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const preview = buildGateScopePreview({
    manifest: readJson(options.manifest),
    t5Launch: readJson(options.t5Launch),
    sourcePaths: { manifest: options.manifest, t5Launch: options.t5Launch },
  });

  fs.mkdirSync(path.dirname(options.output), { recursive: true });
  fs.writeFileSync(options.output, `${JSON.stringify(preview, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({ output: options.output, ...preview.gate }, null, 2));
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (invokedPath === path.resolve(fileURLToPath(import.meta.url))) {
  main();
}
