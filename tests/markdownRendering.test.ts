import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { renderMarkdownHtml } from "../src/utils/markdownRenderCore.ts";

const previewCss = readFileSync(new URL("../src/components/MarkdownPreview.css", import.meta.url), "utf8");

test("renders Markdown lists, links, and highlights", () => {
  const html = renderMarkdownHtml("* bullet\n\n1. ordered\n\n[link](https://example.com)\n\n==highlight==\n\n| A | B |\n|---|---|\n| 1 | 2 |");

  assert.match(html, /<ul>[\s\S]*<li>bullet<\/li>[\s\S]*<\/ul>/);
  assert.match(html, /<ol>[\s\S]*<li>ordered<\/li>[\s\S]*<\/ol>/);
  assert.match(html, /<a href="https:\/\/example\.com">link<\/a>/);
  assert.match(html, /<mark>highlight<\/mark>/);
  assert.match(html, /<div class="mk-table-wrap">[\s\S]*<table>/);
});

test("does not emit unsafe links or raw HTML", () => {
  const html = renderMarkdownHtml("[bad](javascript:alert(1))\n\n<span onclick=\"alert(1)\">raw</span>");

  assert.doesNotMatch(html, /javascript:/i);
  assert.doesNotMatch(html, /<span/i);
  assert.match(html, /&lt;span[^>]*&gt;raw&lt;\/span&gt;/);
});

test("escapes image attributes while preserving local image metadata", () => {
  const html = renderMarkdownHtml('![a &quot;quoted&quot;](File/assets/a.png "w:320px")');

  assert.match(html, /src="File\/assets\/a\.png"/);
  assert.match(html, /alt="a &quot;quoted&quot;"/);
  assert.match(html, /data-mk-width="320"/);
});

test("preview styles preserve Markdown link and heading hierarchy", () => {
  assert.match(previewCss, /\.markdown-preview a\s*\{/);
  assert.match(previewCss, /\.markdown-preview h4\s*\{/);
  assert.match(previewCss, /\.markdown-preview h5\s*\{/);
  assert.match(previewCss, /\.markdown-preview h6\s*\{/);
});
