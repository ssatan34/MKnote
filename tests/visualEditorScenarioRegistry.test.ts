import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));
const registryPath = join(repositoryRoot, "docs", "visual-editor-test-registry.json");

function readRegistry() {
  return JSON.parse(readFileSync(registryPath, "utf8")) as {
    schemaVersion: string;
    executionRules: {
      newScenarioRequiresOnePrimaryOwner: boolean;
      secondaryLayersDeclareBoundaryOnly: boolean;
      formalT4UsesOneRunArtifactSet: boolean;
    };
    baselinePolicy: {
      replayDefault: string;
      replayRequiresProductionChange: boolean;
      source: string;
    };
    layers: Array<{
      id: string;
      responsibility: string;
      primaryEvidence: string[];
    }>;
    scenarios: Array<{
      id: string;
      layer: string;
      primaryEvidence: string;
      boundary: string;
    }>;
  };
}

test("可视化编辑器测试场景注册表声明 T0-T5 唯一责任与真实证据入口", () => {
  const registry = readRegistry();
  const expectedLayers = ["T0", "T1", "T2", "T3", "T4", "T5"];
  const layerIds = registry.layers.map((layer) => layer.id);

  assert.equal(
    registry.schemaVersion,
    "mknote.visual-editor.test-scenario-registry.v1",
  );
  assert.deepEqual(layerIds, expectedLayers);
  assert.equal(new Set(layerIds).size, layerIds.length);
  assert.equal(registry.executionRules.newScenarioRequiresOnePrimaryOwner, true);
  assert.equal(registry.executionRules.secondaryLayersDeclareBoundaryOnly, true);
  assert.equal(registry.executionRules.formalT4UsesOneRunArtifactSet, true);
  assert.equal(registry.baselinePolicy.replayDefault, "skip");
  assert.equal(registry.baselinePolicy.replayRequiresProductionChange, true);
  assert.equal(
    registry.baselinePolicy.source,
    "docs/visual-editor-baseline-manifest.md",
  );
  const packageJson = JSON.parse(
    readFileSync(join(repositoryRoot, "package.json"), "utf8"),
  ) as { scripts?: Record<string, string> };
  assert.equal(
    packageJson.scripts?.["test:visual-editor-registry"],
    "node --test --test-isolation=none tests/visualEditorScenarioRegistry.test.ts",
  );

  const layerById = new Map(registry.layers.map((layer) => [layer.id, layer]));
  const evidenceOwners = registry.layers.flatMap((layer) =>
    layer.primaryEvidence.map((path) => layer.id + ":" + path),
  );
  const evidencePaths = registry.layers.flatMap((layer) => layer.primaryEvidence);
  assert.equal(new Set(evidencePaths).size, evidencePaths.length);
  for (const layer of registry.layers) {
    assert.notEqual(layer.responsibility.trim(), "");
    assert.ok(layer.primaryEvidence.length > 0);
    for (const evidencePath of layer.primaryEvidence) {
      assert.equal(
        existsSync(join(repositoryRoot, evidencePath)),
        true,
        layer.id + " evidence path does not exist: " + evidencePath,
      );
    }
  }
  assert.equal(new Set(evidenceOwners).size, evidenceOwners.length);

  const scenarioIds = registry.scenarios.map((scenario) => scenario.id);
  assert.equal(new Set(scenarioIds).size, scenarioIds.length);
  for (const scenario of registry.scenarios) {
    const layer = layerById.get(scenario.layer);
    assert.ok(layer, scenario.id + " references unknown layer " + scenario.layer);
    assert.ok(
      layer?.primaryEvidence.includes(scenario.primaryEvidence),
      scenario.id + " must point to its layer's primary evidence",
    );
    assert.notEqual(scenario.boundary.trim(), "");
  }
  for (const layerId of expectedLayers) {
    assert.ok(
      registry.scenarios.some((scenario) => scenario.layer === layerId),
      layerId + " must have a registered scenario",
    );
  }
});
