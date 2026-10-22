import assert from "node:assert/strict";
import test from "node:test";
import { VISUAL_EDITOR_FIXTURES } from "./fixtures/visual-editor/corpus.ts";
import { luteHtmlToMarkdown, luteMarkdownToHtml } from "../src/utils/luteMarkdown.ts";

function fixtureMarkdown(id: string): string {
  const fixture = VISUAL_EDITOR_FIXTURES.find((item) => item.id === id);
  assert.ok(fixture, `missing fixture: ${id}`);
  return fixture.markdown;
}

test("恶意 HTML 和 URL 语料不得产生可执行标签或危险协议属性", () => {
  for (const id of ["unsafe-html", "unsafe-url"]) {
    const html = luteMarkdownToHtml(fixtureMarkdown(id));

    assert.doesNotMatch(html, /<script\b/i, `${id} must not emit script elements`);
    assert.doesNotMatch(html, /<img\b[^>]*\bonerror\s*=/i, `${id} must not emit image handlers`);
    assert.doesNotMatch(
      html,
      /\b(?:href|src)\s*=\s*["'][^"']*(?:javascript:|vbscript:|data:text\/html|data:application\/xhtml\+xml)/i,
      `${id} must not emit executable URL protocols`,
    );
  }
});

test("渲染和 HTML 回写都必须拒绝危险 Data URL 与脚本协议", () => {
  const renderedHtml = luteMarkdownToHtml(
    "![危险 SVG](data:image/svg+xml,<svg onload=alert(1)></svg>)\n\n[混淆协议](java&#x73;cript:alert(1))",
  );
  assert.doesNotMatch(
    renderedHtml,
    /\b(?:href|src)\s*=\s*[\"'][^\"']*(?:javascript:|vbscript:|data:(?:text\/html|application\/xhtml\+xml|image\/svg\+xml))/i,
    "Markdown rendering must reject executable and SVG Data URL protocols",
  );

  const markdown = luteHtmlToMarkdown(`
    <p><a href="data:text/html,&lt;script&gt;alert(1)&lt;/script&gt;">数据链接</a></p>
    <p><a href="vbscript:msgbox(1)">脚本链接</a></p>
    <p><img src="javascript:alert(1)" onerror="alert(1)"></p>
    <p><img src="data:image/svg+xml;base64,PHN2Zz48L3N2Zz4="></p>
    <p><img src="data:image/png;base64,iVBORw0KGgo="></p>
  `);

  assert.doesNotMatch(
    markdown,
    /\]\(\s*(?:javascript:|vbscript:|data:(?:text\/html|application\/xhtml\+xml|image\/svg\+xml))/i,
    "HTML writeback must not serialize executable or SVG Data URL destinations",
  );
  assert.match(
    markdown,
    /!\[\]\(data:image\/png;base64,iVBORw0KGgo=\)/,
    "HTML writeback must preserve the raster Data URL allowlist",
  );
});

test("图片节点必须保留本地、图床、涂鸦、宽度和白名单 Data URL 元数据", () => {
  const cases = [
    ["image-local", /data-mk-rel="File\/assets\/local\.png"/],
    ["image-hosted", /data-mk-hosted="1"/],
    ["image-doodled", /data-mk-rel="File\/assets\/original\.png"[\s\S]*data-mk-doodled="https:\/\/cdn\.example\.com\/doodle\.png"/],
    ["image-width", /data-mk-width="640"/],
    ["image-data", /src="data:image\/png;base64,iVBORw0KGgo="/],
    ["image-missing", /data-mk-rel="File\/assets\/not-found\.png"/],
  ] as const;

  for (const [id, expected] of cases) {
    assert.match(luteMarkdownToHtml(fixtureMarkdown(id)), expected, `${id} metadata was lost`);
  }
});
