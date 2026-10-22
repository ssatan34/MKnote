/**
 * 可视化编辑器进入 Markdown parser 前的原文保护层。
 *
 * 这里不尝试解释未知语法，只把可明确识别的 source span 替换成不会
 * 与用户原文冲突的占位符。恢复时必须验证每个占位符恰好出现一次，
 * 这样普通段落的编辑不会静默吞掉原子块。
 */

export interface SourceSpan {
  token: string;
  kind: string;
  source: string;
  /** UTF-16 code-unit offset in the original Markdown. */
  start: number;
  /** Exclusive UTF-16 code-unit offset in the original Markdown. */
  end: number;
}

export interface ProtectedSourceDocument {
  protectedMarkdown: string;
  spans: SourceSpan[];
  originalMarkdown?: string;
}

export class SourceAwareMarkdownError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SourceAwareMarkdownError";
  }
}

interface CandidateSpan {
  kind: string;
  start: number;
  end: number;
}

interface TextRange {
  start: number;
  end: number;
}

interface HtmlTag {
  start: number;
  end: number;
  name: string;
  closing: boolean;
  selfClosing: boolean;
  source: string;
}

const FRONT_MATTER_START = /^(?:\uFEFF)?---[ \t]*(?:\r?\n|$)/;
const HTML_COMMENT_START = "<!--";
const HTML_COMMENT_END = "-->";
const HTML_BLOCK_TAGS = new Set([
  "address",
  "article",
  "aside",
  "blockquote",
  "body",
  "caption",
  "center",
  "colgroup",
  "dd",
  "details",
  "dialog",
  "div",
  "dl",
  "dt",
  "fieldset",
  "figcaption",
  "figure",
  "footer",
  "form",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "head",
  "header",
  "html",
  "legend",
  "li",
  "main",
  "menu",
  "nav",
  "ol",
  "p",
  "pre",
  "script",
  "section",
  "style",
  "summary",
  "table",
  "tbody",
  "td",
  "tfoot",
  "th",
  "thead",
  "title",
  "tr",
  "ul",
  "svg",
  "template",
]);
// `<u>` 是 Visual Editor 自有的下划线标记；它必须和 `<br>` 一样不被
// source-aware 回退误判，否则保存一次下划线就会把笔记降级到源码模式。
const SAFE_INLINE_HTML_TAGS = new Set(["br", "u"]);
const UNSAFE_HTML_TAGS = new Set([
  "applet",
  "embed",
  "form",
  "iframe",
  "object",
  "script",
  "style",
  "svg",
  "template",
]);
const UNSAFE_HTML_ATTRIBUTE = /\s(?:on[a-z]+|srcdoc)\s*=|\b(?:javascript|vbscript):/i;
const FENCE_START = /^[ \t]{0,3}(`{3,}|~{3,})[^\r\n]*(?:\r?\n|$)/gm;
const INLINE_CODE = /(`+)([^\r\n]*?)\1/g;
const WIKILINK = /\[\[[^\]\r\n]+\]\]/g;
const SIYUAN_BLOCK_REF = /\^[0-9]{8,}-[A-Za-z0-9-]+/g;
const SIYUAN_IAL = /^[ \t]{0,3}\{:[^\r\n]*\}(?:\r?\n|$)/gm;
const FOOTNOTE_DEFINITION = /^[ \t]{0,3}\[\^[^\]\r\n]+\]:[^\r\n]*(?:\r?\n|$)/gm;
const FOOTNOTE_REFERENCE = /\[\^[^\]\r\n]+\]/g;
// CommonMark HTTP(S) autolinks begin with `<` but are not HTML tags. Keep the
// exception narrow so dangerous protocols and attribute-like input still use
// the source-preserving safety boundary.
const MARKDOWN_HTTP_AUTOLINK = /^<https?:\/\/[^\s<>]+>$/i;
const SOURCE_TOKEN_PREFIX = "\uE000mknote-source-";
const SOURCE_TOKEN_SUFFIX = "\uE001";

function fail(message: string): never {
  throw new SourceAwareMarkdownError(message);
}

function intersectsRange(start: number, end: number, ranges: TextRange[]): boolean {
  return ranges.some((range) => start < range.end && end > range.start);
}

function findCodeRanges(markdown: string): TextRange[] {
  const ranges: TextRange[] = [];
  let openFence: { start: number; marker: string } | null = null;

  FENCE_START.lastIndex = 0;
  let fenceMatch: RegExpExecArray | null;
  while ((fenceMatch = FENCE_START.exec(markdown))) {
    const marker = fenceMatch[1];
    if (!openFence) {
      openFence = { start: fenceMatch.index, marker };
      continue;
    }

    const markerCharacter = openFence.marker[0];
    if (marker[0] !== markerCharacter || marker.length < openFence.marker.length) {
      continue;
    }

    ranges.push({ start: openFence.start, end: fenceMatch.index + fenceMatch[0].length });
    openFence = null;
  }

  if (openFence) {
    fail("代码围栏未闭合，source-aware 保护拒绝猜测");
  }

  INLINE_CODE.lastIndex = 0;
  let inlineMatch: RegExpExecArray | null;
  while ((inlineMatch = INLINE_CODE.exec(markdown))) {
    ranges.push({ start: inlineMatch.index, end: inlineMatch.index + inlineMatch[0].length });
  }

  return ranges;
}

function parseHtmlTag(markdown: string, start: number): HtmlTag | null {
  if (markdown[start] !== "<") {
    return null;
  }

  let cursor = start + 1;
  let closing = false;
  if (markdown[cursor] === "/") {
    closing = true;
    cursor += 1;
  }

  const nameStart = cursor;
  while (cursor < markdown.length && /[A-Za-z0-9:-]/.test(markdown[cursor])) {
    cursor += 1;
  }
  if (cursor === nameStart) {
    return null;
  }

  const nameEnd = cursor;
  const nextCharacter = markdown[cursor];
  if (nextCharacter !== ">" && nextCharacter !== "/" && !/\s/.test(nextCharacter ?? "")) {
    return null;
  }

  let quote: string | null = null;
  while (cursor < markdown.length) {
    const character = markdown[cursor];
    if (quote) {
      if (character === quote) {
        quote = null;
      }
    } else if (character === '"' || character === "'") {
      quote = character;
    } else if (character === ">") {
      const end = cursor + 1;
      const source = markdown.slice(start, end);
      return {
        start,
        end,
        name: markdown.slice(nameStart, nameEnd).toLowerCase(),
        closing,
        selfClosing: closing || /\/\s*>$/.test(source),
        source,
      };
    }
    cursor += 1;
  }

  fail("HTML 标签未闭合，source-aware 保护拒绝猜测");
}

function findNextHtmlTag(markdown: string, from: number, ignoredRanges: TextRange[]): HtmlTag | null {
  let cursor = from;
  while (cursor < markdown.length) {
    const start = markdown.indexOf("<", cursor);
    if (start < 0) {
      return null;
    }
    if (ignoredRanges.some((range) => start >= range.start && start < range.end)) {
      const ignoredRange = ignoredRanges.find((range) => start >= range.start && start < range.end);
      cursor = ignoredRange?.end ?? start + 1;
      continue;
    }
    if (markdown.startsWith(HTML_COMMENT_START, start)) {
      const endMarker = markdown.indexOf(HTML_COMMENT_END, start + HTML_COMMENT_START.length);
      if (endMarker < 0) {
        fail("HTML 注释未闭合，source-aware 保护拒绝猜测");
      }
      cursor = endMarker + HTML_COMMENT_END.length;
      continue;
    }

    const tag = parseHtmlTag(markdown, start);
    if (tag) {
      return tag;
    }
    cursor = start + 1;
  }
  return null;
}

function findMatchingHtmlBlock(
  markdown: string,
  openingTag: HtmlTag,
  ignoredRanges: TextRange[],
): number {
  let depth = 1;
  let cursor = openingTag.end;

  while (true) {
    const tag = findNextHtmlTag(markdown, cursor, ignoredRanges);
    if (!tag) {
      fail(`HTML 块 <${openingTag.name}> 未闭合，source-aware 保护拒绝猜测`);
    }
    cursor = tag.end;
    if (tag.name !== openingTag.name) {
      continue;
    }
    if (tag.closing) {
      depth -= 1;
      if (depth === 0) {
        return tag.end;
      }
    } else if (!tag.selfClosing) {
      depth += 1;
    }
  }
}

function isUnsafeHtml(tag: HtmlTag): boolean {
  return UNSAFE_HTML_TAGS.has(tag.name) || UNSAFE_HTML_ATTRIBUTE.test(tag.source);
}

function collectHtmlCandidates(markdown: string, ignoredRanges: TextRange[]): CandidateSpan[] {
  const candidates: CandidateSpan[] = [];
  let cursor = 0;

  while (true) {
    const tag = findNextHtmlTag(markdown, cursor, ignoredRanges);
    if (!tag) {
      break;
    }
    cursor = tag.end;
    if (tag.closing || intersectsRange(tag.start, tag.end, ignoredRanges)) {
      continue;
    }
    if (MARKDOWN_HTTP_AUTOLINK.test(tag.source)) {
      continue;
    }

    if (HTML_BLOCK_TAGS.has(tag.name) && !tag.selfClosing) {
      const end = findMatchingHtmlBlock(markdown, tag, ignoredRanges);
      candidates.push({
        kind: isUnsafeHtml(tag) ? "unsafe-html" : "raw-html-block",
        start: tag.start,
        end,
      });
      cursor = end;
      continue;
    }

    if (isUnsafeHtml(tag) || !SAFE_INLINE_HTML_TAGS.has(tag.name)) {
      candidates.push({
        kind: "unsafe-html",
        start: tag.start,
        end: tag.end,
      });
    }
  }

  let commentCursor = 0;
  while (true) {
    const start = markdown.indexOf(HTML_COMMENT_START, commentCursor);
    if (start < 0) {
      break;
    }
    commentCursor = start + HTML_COMMENT_START.length;
    if (intersectsRange(start, start + HTML_COMMENT_START.length, ignoredRanges)) {
      continue;
    }
    const endMarker = markdown.indexOf(HTML_COMMENT_END, commentCursor);
    if (endMarker < 0) {
      fail("HTML 注释未闭合，source-aware 保护拒绝猜测");
    }
    const end = endMarker + HTML_COMMENT_END.length;
    if (!intersectsRange(start, end, ignoredRanges)) {
      candidates.push({ kind: "html-comment", start, end });
    }
    commentCursor = end;
  }

  return candidates;
}

function findFrontMatter(markdown: string): CandidateSpan | null {
  const startMatch = FRONT_MATTER_START.exec(markdown);
  if (!startMatch) {
    return null;
  }

  const closePattern = /^(?:---|\.\.\.)[ \t]*(?:\r?\n|$)/gm;
  closePattern.lastIndex = startMatch[0].length;
  const closeMatch = closePattern.exec(markdown);
  if (!closeMatch) {
    fail("front matter 未闭合，source-aware 保护拒绝猜测");
  }

  return { kind: "front-matter", start: 0, end: closeMatch.index + closeMatch[0].length };
}

function collectRegexCandidates(
  markdown: string,
  expression: RegExp,
  kind: string,
  ignoredRanges: TextRange[],
): CandidateSpan[] {
  const candidates: CandidateSpan[] = [];
  expression.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = expression.exec(markdown))) {
    const start = match.index;
    const end = start + match[0].length;
    if (!intersectsRange(start, end, ignoredRanges)) {
      candidates.push({ kind, start, end });
    }
  }
  return candidates;
}

function findMarkdownLinkEnd(markdown: string, openingParenthesis: number): number | null {
  let depth = 0;
  let quote: string | null = null;
  let escaped = false;

  for (let index = openingParenthesis; index < markdown.length; index += 1) {
    const character = markdown[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (character === "\\") {
      escaped = true;
      continue;
    }
    if (quote) {
      if (character === quote) {
        quote = null;
      }
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
      continue;
    }
    if (character === "(") {
      depth += 1;
    } else if (character === ")") {
      depth -= 1;
      if (depth === 0) {
        return index + 1;
      }
    } else if (character === "\r" || character === "\n") {
      return null;
    }
  }
  return null;
}

function isUnsafeMarkdownDestination(destination: string): boolean {
  if (/^(?:javascript|vbscript):/i.test(destination)) {
    return true;
  }
  if (!/^data:/i.test(destination)) {
    return false;
  }

  // 仅放行不带脚本能力的栅格图片；SVG、HTML 和其他 Data URL 交给 safe-source。
  return !/^data:image\/(?:png|jpeg|jpg|gif|webp|avif|bmp);base64,[A-Za-z0-9+/]+={0,2}$/i.test(
    destination,
  );
}

function collectUnsafeUrlCandidates(markdown: string, ignoredRanges: TextRange[]): CandidateSpan[] {
  const candidates: CandidateSpan[] = [];
  const linkStart = /!?\[[^\]\r\n]*\]\(/g;
  let match: RegExpExecArray | null;
  while ((match = linkStart.exec(markdown))) {
    const start = match.index;
    const openingParenthesis = start + match[0].length - 1;
    const end = findMarkdownLinkEnd(markdown, openingParenthesis);
    if (end === null || intersectsRange(start, end, ignoredRanges)) {
      continue;
    }

    const destination = markdown
      .slice(openingParenthesis + 1, end - 1)
      .trimStart()
      .replace(/^<([^>]*)>.*/, "$1");
    if (isUnsafeMarkdownDestination(destination)) {
      candidates.push({ kind: "unsafe-url", start, end });
    }
  }
  return candidates;
}

function selectNonOverlappingCandidates(candidates: CandidateSpan[]): CandidateSpan[] {
  const selected: CandidateSpan[] = [];
  const ordered = [...candidates].sort((left, right) => {
    if (left.start !== right.start) {
      return left.start - right.start;
    }
    return right.end - left.end;
  });

  let previous: CandidateSpan | undefined;
  for (const candidate of ordered) {
    if (!previous || candidate.start >= previous.end) {
      selected.push(candidate);
      previous = candidate;
      continue;
    }

    if (candidate.end <= previous.end) {
      // 已选中的较大区段包含当前候选，例如 raw HTML 块包含内部标签。
      continue;
    }

    if (candidate.start < previous.end && candidate.end > previous.end) {
      fail(
        `source span 重叠：${previous.kind} [${previous.start},${previous.end}) 与 ${candidate.kind} [${candidate.start},${candidate.end})`,
      );
    }
  }

  return selected.sort((left, right) => left.start - right.start);
}

function createToken(index: number, markdown: string, reserved: Set<string>): string {
  let suffix = 0;
  while (true) {
    const token = `${SOURCE_TOKEN_PREFIX}${index}${suffix ? `-${suffix}` : ""}${SOURCE_TOKEN_SUFFIX}`;
    if (!markdown.includes(token) && !reserved.has(token)) {
      return token;
    }
    suffix += 1;
  }
}

function countOccurrences(text: string, token: string): number {
  return text.split(token).length - 1;
}

function replaceExactlyOnce(text: string, token: string, source: string): string {
  const occurrences = countOccurrences(text, token);
  if (occurrences === 0) {
    fail(`原文占位符 ${token} 缺失，拒绝写回`);
  }
  if (occurrences > 1) {
    fail(`原文占位符 ${token} 重复，拒绝写回`);
  }
  const tokenStart = text.indexOf(token);
  return `${text.slice(0, tokenStart)}${source}${text.slice(tokenStart + token.length)}`;
}

function restoreGeneratedSourceSpans(
  document: ProtectedSourceDocument,
  protectedMarkdown: string,
): string {
  const spansByToken = new Map<string, SourceSpan>();
  for (const span of document.spans) {
    if (spansByToken.has(span.token)) {
      fail(`原文占位符 ${span.token} 重复，拒绝写回`);
    }
    spansByToken.set(span.token, span);
  }

  const seenTokens = new Set<string>();
  const restoredParts: string[] = [];
  let cursor = 0;
  while (cursor < protectedMarkdown.length) {
    const tokenStart = protectedMarkdown.indexOf(SOURCE_TOKEN_PREFIX, cursor);
    if (tokenStart < 0) {
      restoredParts.push(protectedMarkdown.slice(cursor));
      cursor = protectedMarkdown.length;
      break;
    }

    const tokenEnd = protectedMarkdown.indexOf(SOURCE_TOKEN_SUFFIX, tokenStart + SOURCE_TOKEN_PREFIX.length);
    if (tokenEnd < 0) {
      restoredParts.push(protectedMarkdown.slice(cursor));
      cursor = protectedMarkdown.length;
      break;
    }

    const tokenEndExclusive = tokenEnd + SOURCE_TOKEN_SUFFIX.length;
    const token = protectedMarkdown.slice(tokenStart, tokenEndExclusive);
    const span = spansByToken.get(token);
    if (!span) {
      // 非本次生成的私有区段交给后续缺失校验，不擅自解释用户输入。
      restoredParts.push(protectedMarkdown.slice(cursor, tokenEndExclusive));
      cursor = tokenEndExclusive;
      continue;
    }
    if (seenTokens.has(token)) {
      fail(`原文占位符 ${token} 重复，拒绝写回`);
    }

    restoredParts.push(protectedMarkdown.slice(cursor, tokenStart), span.source);
    seenTokens.add(token);
    cursor = tokenEndExclusive;
  }

  if (seenTokens.size !== document.spans.length) {
    const missingSpan = document.spans.find((span) => !seenTokens.has(span.token));
    if (missingSpan) {
      fail(`原文占位符 ${missingSpan.token} 缺失，拒绝写回`);
    }
  }

  return restoredParts.join("");
}

export function protectSourceSpans(markdown: string): ProtectedSourceDocument {
  const codeRanges = findCodeRanges(markdown);
  const candidates: CandidateSpan[] = [];
  const frontMatter = findFrontMatter(markdown);
  if (frontMatter) {
    candidates.push(frontMatter);
  }

  candidates.push(...collectHtmlCandidates(markdown, codeRanges));
  candidates.push(
    ...collectRegexCandidates(markdown, SIYUAN_IAL, "siyuan-ial", codeRanges),
    ...collectRegexCandidates(markdown, FOOTNOTE_DEFINITION, "footnote-definition", codeRanges),
    ...collectRegexCandidates(markdown, SIYUAN_BLOCK_REF, "siyuan-block-ref", codeRanges),
    ...collectRegexCandidates(markdown, FOOTNOTE_REFERENCE, "footnote-reference", codeRanges),
    ...collectRegexCandidates(markdown, WIKILINK, "wikilink", codeRanges),
    ...collectUnsafeUrlCandidates(markdown, codeRanges),
  );

  const spans = selectNonOverlappingCandidates(candidates).map((candidate, index) => ({
    ...candidate,
    token: createToken(index, markdown, new Set()),
    source: markdown.slice(candidate.start, candidate.end),
  }));

  const protectedParts: string[] = [];
  let sourceCursor = 0;
  for (const span of spans) {
    protectedParts.push(markdown.slice(sourceCursor, span.start), span.token);
    sourceCursor = span.end;
  }
  protectedParts.push(markdown.slice(sourceCursor));
  const protectedMarkdown = protectedParts.join("");

  return { originalMarkdown: markdown, protectedMarkdown, spans };
}

export function restoreSourceSpans(
  document: ProtectedSourceDocument,
  protectedMarkdown: string,
): string {
  if (document.spans.every((span) => span.token.startsWith(SOURCE_TOKEN_PREFIX))) {
    return restoreGeneratedSourceSpans(document, protectedMarkdown);
  }

  let restored = protectedMarkdown;
  for (const span of document.spans) {
    restored = replaceExactlyOnce(restored, span.token, span.source);
  }
  return restored;
}
