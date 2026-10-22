import assert from "node:assert/strict";
import test from "node:test";
import {
  VISUAL_EDITOR_FIXTURES,
  VISUAL_EDITOR_CLASSIFICATIONS,
  type VisualEditorClassification,
} from "./fixtures/visual-editor/corpus.ts";
import { luteMarkdownToHtml } from "../src/utils/luteMarkdown.ts";

const REQUIRED_SYNTAX = [
  "gfm",
  "front-matter",
  "footnotes",
  "setext",
  "html",
  "html-comment",
  "siyuan-block-ref",
  "siyuan-ial",
  "wikilink",
  "callout",
  "hard-break",
  "task",
  "table",
  "image-local",
  "image-hosted",
  "image-doodled",
  "image-width",
  "image-data",
  "image-remote",
  "image-missing",
] as const;

test("可视化编辑器兼容语料不少于 100 份且覆盖计划要求的语法", () => {
  assert.ok(VISUAL_EDITOR_FIXTURES.length >= 100);

  const ids = VISUAL_EDITOR_FIXTURES.map((fixture) => fixture.id);
  assert.equal(new Set(ids).size, ids.length, "fixture id 必须唯一");

  for (const syntax of REQUIRED_SYNTAX) {
    assert.ok(
      VISUAL_EDITOR_FIXTURES.some((fixture) => fixture.syntax.includes(syntax)),
      `缺少语法覆盖：${syntax}`,
    );
  }
});

test("每份语料都声明四分类中的一种处理策略", () => {
  for (const fixture of VISUAL_EDITOR_FIXTURES) {
    assert.ok(
      VISUAL_EDITOR_CLASSIFICATIONS.includes(fixture.classification),
      `${fixture.id} 的分类无效：${fixture.classification satisfies VisualEditorClassification}`,
    );
    assert.notEqual(fixture.markdown.trim(), "", `${fixture.id} 不得为空`);
  }
});

test("当前 Lute 基线至少能渲染所有原生可视化样例", () => {
  const nativeFixtures = VISUAL_EDITOR_FIXTURES.filter(
    (fixture) => fixture.classification === "native",
  );

  for (const fixture of nativeFixtures) {
    const html = luteMarkdownToHtml(fixture.markdown);
    assert.ok(html.trim(), `${fixture.id} 渲染结果为空`);
  }
});
