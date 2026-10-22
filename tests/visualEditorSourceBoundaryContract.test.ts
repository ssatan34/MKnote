import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";

const repositoryRoot = join(import.meta.dirname, "..");
const readSource = (...parts: string[]) => readFileSync(join(repositoryRoot, ...parts), "utf8");
const importSourceBoundary = async () =>
  import(pathToFileURL(join(repositoryRoot, "src", "utils", "visualEditorSourceBoundary.ts")).href);

test("默认 Visual Editor 必须在不支持的 source span 前进入安全源码回退", () => {
  const boundaryPath = join(repositoryRoot, "src", "utils", "visualEditorSourceBoundary.ts");
  const editorPane = readSource("src", "components", "compact", "EditorPane.tsx");
  const recoveryPanel = readSource("src", "components", "VisualEditorRecoveryPanel.tsx");

  assert.equal(existsSync(boundaryPath), true, "必须存在按内容识别 source boundary 的适配器");
  assert.match(editorPane, /inspectVisualEditorSourceBoundary/);
  assert.match(editorPane, /visualEditorSourceBoundary/);
  assert.match(recoveryPanel, /message/);
});

test("source boundary 必须保留原生 Wikilink，同时阻止 raw 与 safe-source 进入可写 Visual Editor", async () => {
  const modulePath = join(repositoryRoot, "src", "utils", "visualEditorSourceBoundary.ts");
  assert.equal(existsSync(modulePath), true);
  const { inspectVisualEditorSourceBoundary } = await importSourceBoundary();

  assert.equal(inspectVisualEditorSourceBoundary("普通段落\n\n[[项目计划]]"), null);
  assert.equal(inspectVisualEditorSourceBoundary("<u>下划线</u>\n\n==高亮=="), null);

  const raw = inspectVisualEditorSourceBoundary("---\ntitle: keep\n---\n\n正文");
  assert.equal(raw?.kind, "raw");
  assert.deepEqual(raw?.sourceKinds, ["front-matter"]);

  const safeSource = inspectVisualEditorSourceBoundary(
    "正文[^one]\n\n[^one]: 不进入日常可视化编辑",
  );
  assert.equal(safeSource?.kind, "safe-source");
  assert.deepEqual(safeSource?.sourceKinds, ["footnote-reference", "footnote-definition"]);

  const unsafeUrl = inspectVisualEditorSourceBoundary(
    "[危险链接](javascript:alert(1))",
  );
  assert.equal(unsafeUrl?.kind, "safe-source");
  assert.deepEqual(unsafeUrl?.sourceKinds, ["unsafe-url"]);
});

test("source boundary 遇到未闭合原子语法时必须拒绝进入可写 Visual Editor", async () => {
  const { inspectVisualEditorSourceBoundary } = await importSourceBoundary();

  const boundary = inspectVisualEditorSourceBoundary("---\ntitle: incomplete\n\n正文");
  assert.equal(boundary?.kind, "safe-source");
  assert.deepEqual(boundary?.sourceKinds, ["malformed-source"]);
});

test("任务行回车产生的 br 变体必须继续留在可写 Visual Editor", async () => {
  const { inspectVisualEditorSourceBoundary } = await importSourceBoundary();

  for (const lineBreak of ["<br>", "<br/>", "<br />"]) {
    const markdown = `- [ ] 预览工具的图形化表示\n- [ ] ${lineBreak}`;
    assert.equal(
      inspectVisualEditorSourceBoundary(markdown),
      null,
      `${lineBreak} 不应触发源码回退`,
    );
  }
});
