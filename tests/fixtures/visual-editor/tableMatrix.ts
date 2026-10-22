export const TABLE_MATRIX_FEATURES = [
  "basic",
  "alignment",
  "mixed-alignment",
  "no-outer-pipes",
  "single-column",
  "wide-table",
  "empty-cell",
  "empty-header",
  "inline-mark",
  "escaped-pipe",
  "code-span-pipe",
  "html-break",
  "unicode",
  "numeric",
  "long-cell",
  "duplicate-values",
  "variable-separator",
  "irregular-spacing",
  "adjacent-blocks",
  "inline-html",
  "special-punctuation",
] as const;

export type TableMatrixFeature = (typeof TABLE_MATRIX_FEATURES)[number];
export type TableMatrixAlignment = "none" | "left" | "center" | "right";

export interface VisualEditorTableMatrixFixture {
  id: string;
  title: string;
  markdown: string;
  features: readonly TableMatrixFeature[];
  expectedRows: number;
  expectedColumns: number;
  expectedAlignments: readonly TableMatrixAlignment[];
}

function tableFixture(
  id: string,
  title: string,
  markdown: string,
  expectedRows: number,
  expectedColumns: number,
  features: readonly TableMatrixFeature[],
  expectedAlignments: readonly TableMatrixAlignment[],
): VisualEditorTableMatrixFixture {
  return {
    id,
    title,
    markdown: markdown.trim(),
    features,
    expectedRows,
    expectedColumns,
    expectedAlignments,
  };
}

export const VISUAL_EDITOR_TABLE_MATRIX: readonly VisualEditorTableMatrixFixture[] = [
  tableFixture(
    "table-001-basic",
    "基础二维表格",
    `| 名称 | 状态 |
| --- | --- |
| 编辑器 | 进行中 |
| 保存 | 已验证 |`,
    3,
    2,
    ["basic"],
    ["none", "none"],
  ),
  tableFixture(
    "table-002-left-alignment",
    "左对齐表格",
    `| 名称 | 状态 |
| :--- | --- |
| 编辑器 | 进行中 |`,
    2,
    2,
    ["alignment"],
    ["left", "none"],
  ),
  tableFixture(
    "table-003-center-alignment",
    "居中对齐表格",
    `| 名称 | 状态 |
| --- | :---: |
| 编辑器 | 进行中 |`,
    2,
    2,
    ["alignment"],
    ["none", "center"],
  ),
  tableFixture(
    "table-004-right-alignment",
    "右对齐表格",
    `| 名称 | 数量 |
| --- | ---: |
| 任务 | 3 |`,
    2,
    2,
    ["alignment", "numeric"],
    ["none", "right"],
  ),
  tableFixture(
    "table-005-mixed-alignment",
    "混合对齐表格",
    `| 左 | 中 | 右 |
| :--- | :---: | ---: |
| a | b | c |`,
    2,
    3,
    ["mixed-alignment", "alignment"],
    ["left", "center", "right"],
  ),
  tableFixture(
    "table-006-no-outer-pipes",
    "无外侧管线表格",
    `名称 | 状态
--- | ---
编辑器 | 进行中
保存 | 已验证`,
    3,
    2,
    ["no-outer-pipes"],
    ["none", "none"],
  ),
  tableFixture(
    "table-007-single-column",
    "单列表格",
    `| 项目 |
| --- |
| 编辑 |
| 保存 |
| 重开 |`,
    4,
    1,
    ["single-column"],
    ["none"],
  ),
  tableFixture(
    "table-008-wide-five-columns",
    "五列表格",
    `| A | B | C | D | E |
| --- | --- | --- | --- | --- |
| 1 | 2 | 3 | 4 | 5 |
| 6 | 7 | 8 | 9 | 10 |`,
    3,
    5,
    ["wide-table", "numeric"],
    ["none", "none", "none", "none", "none"],
  ),
  tableFixture(
    "table-009-empty-cells",
    "空单元格",
    `| A | B | C |
| --- | --- | --- |
|  | 值 |  |
| x |  | z |`,
    3,
    3,
    ["empty-cell"],
    ["none", "none", "none"],
  ),
  tableFixture(
    "table-010-empty-header",
    "空表头单元格",
    `|  | 状态 |
| --- | --- |
| 项目 | 已完成 |`,
    2,
    2,
    ["empty-header", "empty-cell"],
    ["none", "none"],
  ),
  tableFixture(
    "table-011-inline-marks",
    "行内格式表格",
    `| 类型 | 内容 |
| --- | --- |
| 强调 | **重要**、*提示*、~~旧值~~ |
| 链接 | [文档](https://example.com) |`,
    3,
    2,
    ["inline-mark"],
    ["none", "none"],
  ),
  tableFixture(
    "table-012-escaped-pipe",
    "转义管线表格",
    `| 语句 | 结果 |
| --- | --- |
| a \| b | 保留为一个单元格 |
| c | d |`,
    3,
    2,
    ["escaped-pipe"],
    ["none", "none"],
  ),
  tableFixture(
    "table-013-code-span-pipe",
    "代码片段中的管线",
    `| 命令 | 示例 |
| --- | --- |
| shell | \`a|b\` |
| regex | \`x|y\` |`,
    3,
    2,
    ["code-span-pipe", "inline-mark"],
    ["none", "none"],
  ),
  tableFixture(
    "table-014-html-break",
    "HTML 换行表格",
    `| 列 | 内容 |
| --- | --- |
| A | 第一行<br>第二行 |
| B | 单元格 |`,
    3,
    2,
    ["html-break"],
    ["none", "none"],
  ),
  tableFixture(
    "table-015-multiple-breaks",
    "多个 HTML 换行",
    `| 项目 | 说明 |
| --- | --- |
| 计划 | 第一行<br>第二行<br>第三行 |
| 结果 | 已完成 |`,
    3,
    2,
    ["html-break", "long-cell"],
    ["none", "none"],
  ),
  tableFixture(
    "table-016-unicode",
    "中英文与 emoji 表格",
    `| 名称 | 内容 |
| --- | --- |
| 中文 | English 🚀 |
| 标点 | ，。；！？ |`,
    3,
    2,
    ["unicode"],
    ["none", "none"],
  ),
  tableFixture(
    "table-017-numeric",
    "数字与百分比表格",
    `| 项目 | 数量 | 比例 |
| --- | ---: | ---: |
| A | 0 | 0% |
| B | 1024 | 99.9% |`,
    3,
    3,
    ["numeric", "alignment"],
    ["none", "right", "right"],
  ),
  tableFixture(
    "table-018-long-cell",
    "长文本单元格",
    `| 项目 | 说明 |
| --- | --- |
| 长文本 | 这是一个用于验证表格单元格宽度、换行和保存恢复的较长说明文本。 |`,
    2,
    2,
    ["long-cell"],
    ["none", "none"],
  ),
  tableFixture(
    "table-019-duplicate-values",
    "重复值表格",
    `| 状态 | 状态 |
| --- | --- |
| 相同 | 相同 |
| 相同 | 相同 |`,
    3,
    2,
    ["duplicate-values"],
    ["none", "none"],
  ),
  tableFixture(
    "table-020-variable-separator",
    "可变宽度对齐分隔线",
    `| 左 | 中 | 右 |
| :---- | :-----: | ------: |
| l | c | r |`,
    2,
    3,
    ["variable-separator", "mixed-alignment"],
    ["left", "center", "right"],
  ),
  tableFixture(
    "table-021-irregular-spacing",
    "不规则空白表格",
    `|A|  B | C|
|:---| :--: |---:|
| left | center | right |`,
    2,
    3,
    ["irregular-spacing", "mixed-alignment"],
    ["left", "center", "right"],
  ),
  tableFixture(
    "table-022-trailing-empty-cell",
    "末列为空",
    `| 名称 | 备注 |
| --- | --- |
| 项目 |  |`,
    2,
    2,
    ["empty-cell"],
    ["none", "none"],
  ),
  tableFixture(
    "table-023-leading-empty-cell",
    "首列为空",
    `| 名称 | 备注 |
| --- | --- |
|  | 尚未填写 |`,
    2,
    2,
    ["empty-cell"],
    ["none", "none"],
  ),
  tableFixture(
    "table-024-four-body-rows",
    "多行表格",
    `| 序号 | 状态 |
| --- | --- |
| 1 | 待办 |
| 2 | 进行中 |
| 3 | 阻塞 |
| 4 | 完成 |`,
    5,
    2,
    ["numeric"],
    ["none", "none"],
  ),
  tableFixture(
    "table-025-adjacent-paragraphs",
    "表格前后段落",
    `前置说明。

| 项目 | 结果 |
| --- | --- |
| 表格 | 通过 |

后置说明。`,
    2,
    2,
    ["adjacent-blocks"],
    ["none", "none"],
  ),
  tableFixture(
    "table-026-adjacent-code",
    "表格与代码块相邻",
    `| 项目 | 结果 |
| --- | --- |
| 构建 | 通过 |

\`\`\`text
after-table
\`\`\``,
    2,
    2,
    ["adjacent-blocks"],
    ["none", "none"],
  ),
  tableFixture(
    "table-027-inline-html",
    "行内 HTML 表格",
    `| 元素 | 内容 |
| --- | --- |
| 键盘 | <kbd>Ctrl</kbd>+<kbd>S</kbd> |
| 标记 | <span>文本</span> |`,
    3,
    2,
    ["inline-html"],
    ["none", "none"],
  ),
  tableFixture(
    "table-028-special-punctuation",
    "特殊标点表格",
    `| 符号 | 内容 |
| --- | --- |
| 引号 | “中文” ‘引号’ |
| 运算 | < > = & |`,
    3,
    2,
    ["special-punctuation"],
    ["none", "none"],
  ),
  tableFixture(
    "table-029-single-column-alignment",
    "单列居中表格",
    `| 状态 |
| :---: |
| 进行中 |
| 完成 |`,
    3,
    1,
    ["single-column", "alignment"],
    ["center"],
  ),
  tableFixture(
    "table-030-mixed-content",
    "混合内容表格",
    `| 项目 | 内容 | 状态 |
| :--- | :---: | ---: |
| **任务** | \`build\` \| release | 100% |
| [文档](https://example.com) | 第一行<br>第二行 | 1 |`,
    3,
    3,
    ["mixed-alignment", "inline-mark", "escaped-pipe", "html-break", "numeric"],
    ["left", "center", "right"],
  ),
];
