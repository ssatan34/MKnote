import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { VISUAL_EDITOR_FIXTURES } from "./fixtures/visual-editor/corpus.ts";

interface NormalizationDecisionGroup {
  id: string;
  status: string;
  question: string;
  decision: string;
  observedDifference: string;
  allowedCanonicalChanges: string[];
  fixtureIds: string[];
}

interface NormalizationPolicyManifest {
  schemaVersion: number;
  manifestStatus: string;
  ownerApproval: {
    status: string;
    approvedBy: string | null;
    approvedAt: string | null;
  };
  defaultContract: {
    normalizationAllowed: boolean;
    allowedCanonicalChanges: string[];
    untouchedRegionContract: string;
    unapprovedHandling: string;
  };
  approvedContracts: {
    table: {
      structureClassification: string;
      canonicalizationScope: string;
      allowedCanonicalChanges: string[];
    };
    heading: {
      existingSetext: string;
      newHeading: string;
      explicitLevelOrStyleChange: string;
      automaticSetextToAtx: boolean;
    };
    image: {
      nodeAttributes: string[];
      canonicalizationScope: string;
      htmlAttributesAreNotAuthority: boolean;
    };
    inlineMath: {
      priority: string;
      untouchedSource: string;
      editedNode: string;
      blockDelimiter: string;
    };
  };
  evidence: {
    fixtureSource: string;
    roundTripContract: string;
    reviewRecord: string;
  };
  decisionGroups: NormalizationDecisionGroup[];
}

const manifest = JSON.parse(
  readFileSync(
    new URL("./fixtures/visual-editor/normalization-policy.json", import.meta.url),
    "utf8",
  ),
) as NormalizationPolicyManifest;

const normalizeFixtures = VISUAL_EDITOR_FIXTURES.filter(
  (fixture) => fixture.classification === "normalize",
);

const sortIds = (ids: string[]): string[] => [...ids].sort();

test("normalization policy manifest 覆盖全部 normalize 语料且没有重复", () => {
  assert.equal(manifest.schemaVersion, 2);
  assert.equal(
    manifest.evidence.fixtureSource,
    "tests/fixtures/visual-editor/corpus.ts",
  );
  assert.equal(
    manifest.evidence.roundTripContract,
    "tests/visualEditorCorpus.test.ts",
  );

  const manifestFixtureIds = manifest.decisionGroups.flatMap(
    (group) => group.fixtureIds,
  );

  assert.equal(manifest.decisionGroups.length, 3);
  assert.equal(
    new Set(manifest.decisionGroups.map((group) => group.id)).size,
    manifest.decisionGroups.length,
    "规范化决策组 id 必须唯一",
  );
  assert.equal(
    new Set(manifestFixtureIds).size,
    manifestFixtureIds.length,
    "规范化语料不能出现在多个决策组",
  );
  assert.deepEqual(
    sortIds(manifestFixtureIds),
    sortIds(normalizeFixtures.map((fixture) => fixture.id)),
    "manifest 必须覆盖全部 normalize 语料",
  );

  const fixtureById = new Map(
    VISUAL_EDITOR_FIXTURES.map((fixture) => [fixture.id, fixture]),
  );
  for (const group of manifest.decisionGroups) {
    assert.equal(group.status.startsWith("approved-"), true, group.id);
    assert.ok(group.question.trim(), `${group.id} 必须记录原决策问题`);
    assert.ok(group.decision.trim(), `${group.id} 必须记录 Owner 决策`);
    assert.ok(group.observedDifference.trim(), `${group.id} 必须记录观测差异`);
    for (const fixtureId of group.fixtureIds) {
      const fixture = fixtureById.get(fixtureId);
      assert.ok(fixture, `${group.id} 引用了不存在的语料 ${fixtureId}`);
      assert.equal(fixture?.classification, "normalize");
    }
  }
});

test("Owner 决策禁止全局静默规范化，只允许显式编辑范围内的稳定输出", () => {
  assert.equal(manifest.manifestStatus, "owner-approved");
  assert.equal(manifest.ownerApproval.status, "approved");
  assert.equal(manifest.ownerApproval.approvedBy, "project-owner");
  assert.equal(manifest.ownerApproval.approvedAt, "2026-08-22");

  assert.equal(manifest.defaultContract.normalizationAllowed, false);
  assert.deepEqual(manifest.defaultContract.allowedCanonicalChanges, []);
  assert.match(
    manifest.defaultContract.untouchedRegionContract,
    /byte-equal/,
  );

  assert.equal(
    manifest.approvedContracts.table.structureClassification,
    "native",
  );
  assert.equal(
    manifest.approvedContracts.table.canonicalizationScope,
    "edited-table-block-only",
  );
  assert.deepEqual(manifest.approvedContracts.table.allowedCanonicalChanges, [
    "cell-padding",
    "column-width",
    "alignment-separator",
    "pipe-escaping",
  ]);

  assert.equal(manifest.approvedContracts.heading.existingSetext, "preserve");
  assert.equal(manifest.approvedContracts.heading.newHeading, "atx");
  assert.equal(
    manifest.approvedContracts.heading.explicitLevelOrStyleChange,
    "allowed",
  );
  assert.equal(manifest.approvedContracts.heading.automaticSetextToAtx, false);

  assert.deepEqual(manifest.approvedContracts.image.nodeAttributes, [
    "src",
    "alt",
    "title",
    "sourceKind",
    "localRel",
    "originalLocalRel",
    "hostedUrl",
    "width",
    "doodledUrl",
  ]);
  assert.equal(
    manifest.approvedContracts.image.canonicalizationScope,
    "edited-image-node-only",
  );
  assert.equal(
    manifest.approvedContracts.image.htmlAttributesAreNotAuthority,
    true,
  );

  assert.equal(manifest.approvedContracts.inlineMath.priority, "P2");
  assert.equal(manifest.approvedContracts.inlineMath.untouchedSource, "preserve");
  assert.equal(
    manifest.approvedContracts.inlineMath.editedNode,
    "canonical-dollar-delimiter",
  );
  assert.equal(manifest.approvedContracts.inlineMath.blockDelimiter, "$$");
});
