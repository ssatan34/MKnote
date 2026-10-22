import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { findSelectionInContent, mergeAiResult } from "../src/utils/aiContent.ts";

const repositoryRoot = process.cwd();

test("visual Beta 的 AI 选区路径复用页面选区并写回 revision 保存链", () => {
  const compactView = readFileSync(
    join(repositoryRoot, "src", "components", "CompactView.tsx"),
    "utf8",
  );
  const toolbars = readFileSync(
    join(repositoryRoot, "src", "components", "compact", "EditorToolbars.tsx"),
    "utf8",
  );
  const app = readFileSync(join(repositoryRoot, "src", "App.tsx"), "utf8");
  const aiPanel = readFileSync(
    join(repositoryRoot, "src", "components", "AiAssistPanel.tsx"),
    "utf8",
  );
  const aiApi = readFileSync(join(repositoryRoot, "src", "utils", "aiApi.ts"), "utf8");
  const productionProbe = readFileSync(
    join(repositoryRoot, "scripts", "visual-editor-phase2-production-e2e.mjs"),
    "utf8",
  );

  assert.match(compactView, /getEditorSelectionContext/);
  assert.match(compactView, /window\.getSelection/);
  assert.match(compactView, /findSelectionInContent/);
  assert.match(toolbars, /ai-assist-btn[\s\S]*?onMouseDown=\{\(e\) => e\.preventDefault\(\)\}/);
  assert.match(app, /mergeAiResult/);
  assert.match(app, /setContentRevision/);
  assert.match(app, /debouncedSave/);
  assert.match(aiPanel, /fetchAiCompletion/);
  assert.ok(aiApi.includes("chat/completions"));
  assert.match(aiPanel, /onApply\(text, action\)/);
  assert.ok(productionProbe.includes("visual-ai-selection-and-apply"));
  assert.ok(productionProbe.includes("set_ai_config"));
  assert.ok(productionProbe.includes("AI replacement"));
  assert.match(
    productionProbe,
    /async function ensureVisualEditor\(page\)[\s\S]*?page\.waitForSelector\(\s*['"]\[data-testid="mknote-editor-pane"\]/,
  );
});

test("AI 结果替换与续写都保持 Markdown 选区边界", () => {
  const content = "请保留这段文字。\n\n下一段。";
  const selection = findSelectionInContent(content, "保留这段文字");

  assert.deepEqual(selection, {
    text: "保留这段文字",
    start: 1,
    end: 7,
  });
  assert.equal(
    mergeAiResult(content, selection!, "改写后的内容", "polish"),
    "请改写后的内容。\n\n下一段。",
  );
  assert.equal(
    mergeAiResult(content, selection!, "继续写", "continue"),
    "请保留这段文字继续写。\n\n下一段。",
  );
});
