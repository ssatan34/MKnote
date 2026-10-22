import assert from "node:assert/strict";
import test from "node:test";
import { renderMarkdownHtml } from "../src/utils/markdownRenderCore.ts";
import { luteHtmlToMarkdown, luteMarkdownToHtml } from "../src/utils/luteMarkdown.ts";

test("普通段落中的 HTML br 应恢复为 Markdown 硬换行", () => {
  const html = `<p>第一行<br>第二行</p><table><thead><tr><th>列</th></tr></thead><tbody><tr><td>单元<br>格</td></tr></tbody></table>`;
  const markdown = luteHtmlToMarkdown(html);

  assert.match(markdown, /第一行 {2}\n第二行/);
  assert.match(markdown, /单元<br \/>格/);
});

test("普通段落中的软换行不应被误写成硬换行", () => {
  const markdown = "第一行\n第二行";

  assert.equal(luteHtmlToMarkdown(luteMarkdownToHtml(markdown)), markdown);
});

test("引用块中的软换行应保留后续行的引用前缀", () => {
  const markdown = "> 第一行\n> 第二行";

  assert.equal(luteHtmlToMarkdown(luteMarkdownToHtml(markdown)), markdown);
});

test("硬换行往返应区分两个空格与反斜杠写法", () => {
  const markdown = "第一行  \n第二行\n\n第三行\\\n第四行";

  assert.equal(luteHtmlToMarkdown(luteMarkdownToHtml(markdown)), markdown);
});

test("表格行中不应泄漏硬换行保护占位符", () => {
  const markdown = "| 列 | 内容 |\n| --- | --- |\n| B | 一个  \n换行 |";

  assert.doesNotMatch(luteHtmlToMarkdown(luteMarkdownToHtml(markdown)), /MKN(?:HARD|SOFT)/);
});

const tableMarkdown = `|  | 容易获取且可验证 | 不易获取或难以验证 |
|---|---|---|
| **重要** | • 当前阶段摘要<br>• 结构化阶段进度<br>• 当前事项（有明确项目依据时）<br>• 最后更新时间<br>• 更新频次热力图<br>• 项目基线中的直接观测值<br>• 质量与发布中的明确测试/构建结果 | • 当前健康度<br>• 主观整体完成度<br>• 风险与阻塞摘要<br>• 需要决策摘要<br>• 下一步动作（没有明确任务依据时）<br>• 项目基线中的状态/说明判断 |
| **非重要** | • 相关资料<br>• 可直接读取的补充备注<br>• 项目基线中的非关键补充值 | • 当前阶段复盘<br>• 模糊的质量评价<br>• 预估完成时间<br>• 紧迫感或主观优先级<br>• 成本与费用信息 |`;

test("表格单元格中的 HTML br 应保持为可显示换行而不是转义文本", () => {
  const html = renderMarkdownHtml(tableMarkdown);

  assert.equal((html.match(/<br\s*\/?\s*>/gi) ?? []).length, 17);
  assert.doesNotMatch(html, /&lt;br\s*\/?\s*&gt;/i);
});

test("contentEditable HTML 应通过 Lute 反向序列化为可上传 Markdown", () => {
  const html = `<table><thead><tr><th>列</th></tr></thead><tbody><tr><td>第一行<br>第二行</td></tr></tbody></table>`;
  const markdown = luteHtmlToMarkdown(html);

  assert.match(markdown, /\|\s*列\s*\|/);
  assert.match(markdown, /第一行<br\s*\/?>第二行/);
});

test("Lute 反向序列化应把 MDnote 图片元数据恢复到 Markdown", () => {
  const html = `<p><img src="asset://localhost/preview.png" alt="涂鸦" data-mk-rel="File/assets/preview.png" data-mk-width="320" data-mk-doodled="https://cdn.example.com/preview.png"></p>`;
  const markdown = luteHtmlToMarkdown(html);

  assert.match(
    markdown,
    /!\[涂鸦\]\(File\/assets\/preview\.png\s+"mk-doodled\|https:\/\/cdn\.example\.com\/preview\.png"\)/,
  );
});

test("任务列表应保留勾选状态", () => {
  const html = luteMarkdownToHtml("- [x] 已完成\n- [ ] 待处理");

  assert.match(html, /<input[^>]*checked[^>]*type="checkbox"/);
  assert.match(html, /<input[^>]*type="checkbox"/);
  assert.match(luteHtmlToMarkdown(html), /\[[Xx]\]\s*已完成/);
  assert.match(luteHtmlToMarkdown(html), /\[ \]\s*待处理/);
});

test("任务列表往返应保留小写与大写勾选标记", () => {
  const markdown = "- [x] 小写\n- [X] 大写";

  assert.equal(luteHtmlToMarkdown(luteMarkdownToHtml(markdown)), markdown);
});

test("Callout 往返应保留类型和块引用语法", () => {
  const markdown = "> [!NOTE]\n> 提示内容。\n>\n> 第二段内容。\n\n> [!TIP]\n> 另一条提示。";

  assert.equal(luteHtmlToMarkdown(luteMarkdownToHtml(markdown)), markdown);
});

test("无序列表往返应保留 GFM 的短横线 marker", () => {
  const markdown = "- 第一项\n- 第二项";
  const html = luteMarkdownToHtml(markdown);

  assert.equal(luteHtmlToMarkdown(html), markdown);
});

test("嵌套列表往返不得凭空插入空行", () => {
  const fixtures = [
    "> 先记录事实\n> 再补充行动项\n\n- 一项\n  - 子项\n1. 第一步\n2. 第二步\n\n---",
    "- [x] 已完成\n- [ ] 待处理\n  - [X] 子任务",
    "1. 准备\n   1. 备份\n   2. 验证\n2. 执行",
  ];

  for (const markdown of fixtures) {
    assert.equal(
      luteHtmlToMarkdown(luteMarkdownToHtml(markdown)),
      markdown,
      `列表结构往返必须保持：${markdown}`,
    );
  }
});

test("松散列表中父项与嵌套列表之间的空行应保留", () => {
  const markdown = "- 父项\n\n  - 子项";

  assert.equal(luteHtmlToMarkdown(luteMarkdownToHtml(markdown)), markdown);
});
