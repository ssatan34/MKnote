import assert from "node:assert/strict";
import test from "node:test";
import {
  TABLE_MATRIX_FEATURES,
  VISUAL_EDITOR_TABLE_MATRIX,
  type TableMatrixAlignment,
} from "./fixtures/visual-editor/tableMatrix.ts";
import { luteMarkdownToHtml } from "../src/utils/luteMarkdown.ts";

const countMatches = (value: string, pattern: RegExp): number =>
  [...value.matchAll(pattern)].length;

const tableHtml = (html: string): string => {
  const match = html.match(/<table\b[\s\S]*?<\/table>/i);
  assert.ok(match, "表格 fixture 必须渲染出 table");
  return match[0];
};

const headerCells = (html: string): string[] => {
  const match = html.match(/<thead>[\s\S]*?<tr>([\s\S]*?)<\/tr>[\s\S]*?<\/thead>/i);
  assert.ok(match, "表格 fixture 必须渲染出 thead/tr");
  return [...match[1].matchAll(/<th\b([^>]*)>/gi)].map((cell) => cell[1] ?? "");
};

test("T4 表格兼容矩阵必须登记计划要求的 30 个独立场景", () => {
  assert.equal(VISUAL_EDITOR_TABLE_MATRIX.length, 30);

  const ids = VISUAL_EDITOR_TABLE_MATRIX.map((fixture) => fixture.id);
  assert.equal(new Set(ids).size, ids.length, "表格矩阵 id 必须唯一");

  const coveredFeatures = new Set(
    VISUAL_EDITOR_TABLE_MATRIX.flatMap((fixture) => fixture.features),
  );
  for (const feature of TABLE_MATRIX_FEATURES) {
    assert.ok(coveredFeatures.has(feature), `表格矩阵缺少维度：${feature}`);
  }

  for (const fixture of VISUAL_EDITOR_TABLE_MATRIX) {
    assert.ok(fixture.markdown.trim(), `${fixture.id} 的 Markdown 不得为空`);
    assert.ok(fixture.expectedRows >= 2, `${fixture.id} 至少需要表头和一行数据`);
    assert.ok(fixture.expectedColumns >= 1, `${fixture.id} 至少需要一列`);
    assert.equal(
      fixture.expectedAlignments.length,
      fixture.expectedColumns,
      `${fixture.id} 的对齐元数据必须与列数一致`,
    );
  }
});

test("T4 表格矩阵的每个场景都能经过当前 Markdown 渲染边界", () => {
  for (const fixture of VISUAL_EDITOR_TABLE_MATRIX) {
    const rendered = tableHtml(luteMarkdownToHtml(fixture.markdown));
    assert.equal(
      countMatches(rendered, /<table\b/gi),
      1,
      `${fixture.id} 应只包含一个表格`,
    );
    assert.equal(
      countMatches(rendered, /<tr\b/gi),
      fixture.expectedRows,
      `${fixture.id} 的行数与矩阵声明不一致`,
    );
    assert.equal(
      headerCells(rendered).length,
      fixture.expectedColumns,
      `${fixture.id} 的列数与矩阵声明不一致`,
    );
    assert.doesNotMatch(
      rendered,
      /MKN(?:HARD|SOFT)/,
      `${fixture.id} 不得泄漏 Markdown 换行保护占位符`,
    );
  }
});

test("T4 表格矩阵必须保留表头对齐语义", () => {
  const alignmentAttribute = (attributes: string): TableMatrixAlignment | "none" => {
    const match = attributes.match(/\balign=["'](left|center|right)["']/i);
    return (match?.[1]?.toLowerCase() as TableMatrixAlignment | undefined) ?? "none";
  };

  for (const fixture of VISUAL_EDITOR_TABLE_MATRIX) {
    const rendered = tableHtml(luteMarkdownToHtml(fixture.markdown));
    assert.deepEqual(
      headerCells(rendered).map(alignmentAttribute),
      fixture.expectedAlignments,
      `${fixture.id} 的表头对齐语义不一致`,
    );
  }
});
