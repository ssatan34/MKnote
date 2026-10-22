import assert from "node:assert/strict";
import test from "node:test";
import { VISUAL_EDITOR_FIXTURES } from "./fixtures/visual-editor/corpus.ts";
import {
  protectSourceSpans,
  restoreSourceSpans,
} from "../src/utils/sourceAwareMarkdown.ts";
import { inspectVisualEditorSourceBoundary } from "../src/utils/visualEditorSourceBoundary.ts";
import {
  luteHtmlToMarkdown,
  luteMarkdownToHtml,
} from "../src/utils/luteMarkdown.ts";

const SOURCE_FIXTURES = VISUAL_EDITOR_FIXTURES.filter(
  (fixture) => fixture.classification === "raw" || fixture.classification === "safe-source",
);

test("raw 与 safe-source 语料必须被识别为可恢复的原文原子 span", () => {
  for (const fixture of SOURCE_FIXTURES) {
    const protectedDocument = protectSourceSpans(fixture.markdown);

    assert.ok(protectedDocument.spans.length > 0, `${fixture.id} 未识别任何原子 span`);
    assert.equal(
      restoreSourceSpans(protectedDocument, protectedDocument.protectedMarkdown),
      fixture.markdown,
      `${fixture.id} 原文恢复后必须 byte-equal`,
    );
  }
});

test("raw 与 safe-source 语料经过 Lute 往返后必须恢复原始字节", () => {
  for (const fixture of SOURCE_FIXTURES) {
    const protectedDocument = protectSourceSpans(fixture.markdown);
    const html = luteMarkdownToHtml(protectedDocument.protectedMarkdown);
    const serializedMarkdown = luteHtmlToMarkdown(html);
    const restored = restoreSourceSpans(protectedDocument, serializedMarkdown);

    assert.equal(
      restored,
      fixture.markdown,
      `${fixture.id} 经 Lute HTML/Markdown 往返后必须 byte-equal`,
    );
  }
});

test("邻近普通 Markdown 编辑不得改变 raw span 的原始字节", () => {
  for (const fixture of SOURCE_FIXTURES) {
    const protectedDocument = protectSourceSpans(fixture.markdown);
    const editedMarkdown = `${protectedDocument.protectedMarkdown}\n\n邻近段落已编辑。`;
    const restored = restoreSourceSpans(protectedDocument, editedMarkdown);

    for (const span of protectedDocument.spans) {
      assert.ok(restored.includes(span.source), `${fixture.id} 的 ${span.kind} 被邻近编辑改变`);
    }
  }
});

test("占位符被删除或复制时必须拒绝写回，避免静默丢失原文", () => {
  const protectedDocument = protectSourceSpans(
    "正文前的注释<!-- keep me -->\n\n参见 [[项目计划]]。",
  );
  const token = protectedDocument.spans[0]?.token;
  assert.ok(token);

  assert.throws(
    () => restoreSourceSpans(protectedDocument, protectedDocument.protectedMarkdown.replace(token, "")),
    /占位符.*缺失/,
  );
  assert.throws(
    () => restoreSourceSpans(protectedDocument, `${protectedDocument.protectedMarkdown}${token}`),
    /占位符.*重复/,
  );
});

test("未闭合的 front matter 必须拒绝猜测并交给 safe-source 回退", () => {
  assert.throws(
    () => protectSourceSpans("---\ntitle: incomplete\n\n正文"),
    /front matter.*未闭合/,
  );
});

test("白名单栅格 Data URL 保持 native，危险 Data URL 进入安全回退", () => {
  const safeImage = protectSourceSpans("![内嵌图](data:image/png;base64,iVBORw0KGgo=)");
  assert.equal(safeImage.spans.length, 0);

  const unsafeLink = protectSourceSpans(
    "[数据链接](data:text/html,<script>alert(1)</script>)",
  );
  assert.deepEqual(unsafeLink.spans.map((span) => span.kind), ["unsafe-url"]);
});

test("HTTP(S) 自动链接应按 Markdown 处理，不能误判为 unsafe HTML", () => {
  const autolink =
    "<https://developers.openai.com/blog/rethinking-skills-and-prompts-for-gpt-6-astra>";
  const protectedDocument = protectSourceSpans(autolink);

  assert.deepEqual(protectedDocument.spans, []);
  assert.equal(inspectVisualEditorSourceBoundary(autolink), null);
  assert.match(
    luteMarkdownToHtml(autolink),
    /<a href="https:\/\/developers\.openai\.com\/blog\/rethinking-skills-and-prompts-for-gpt-6-astra">/,
  );

  const attributeLike = "<https://example.com onerror=alert(1)>";
  assert.equal(inspectVisualEditorSourceBoundary(attributeLike)?.kind, "safe-source");
});
