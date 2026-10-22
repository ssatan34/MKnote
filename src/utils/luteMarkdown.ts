/**
 * 内置 Lute 1.7.6 精确匹配上游 ead82ece 构建（仅 CRLF/LF 差异）；来源与许可证见 ../vendor/README.md。
 * 源文件 SHA-256：BBF54A7D1BFCB2737D38B716D13D901344B6A9815B38C4610D4015D035A38629
 */
import "../vendor/lute.min.cjs";
import { formatWidthTitle, parseWidthFromTitle } from "./imageMarkdown.ts";

interface LuteInstance {
  MarkdownStr: (name: string, markdown: string) => string;
  HTML2BlockDOM: (html: string) => string;
  BlockDOM2StdMd: (blockDom: string) => string;
  SetUnorderedListMarker: (marker: string) => void;
}

interface LuteFactory {
  New: () => LuteInstance;
}

const luteGlobal = globalThis as typeof globalThis & { Lute?: LuteFactory };

// 与思源 Protyle 当前使用的 Lute 配置保持同一组语义；MDnote 不维护思源块 ID，
// 因此关闭 IAL，避免每次预览产生不可持久化的随机属性。
const BOOLEAN_OPTIONS: ReadonlyArray<readonly [string, boolean]> = [
  ["SetGFMTable", true],
  ["SetGFMTaskListItem", true],
  ["SetGFMStrikethrough", true],
  ["SetGFMAutoLink", true],
  ["SetSoftBreak2HardBreak", true],
  ["SetCodeSyntaxHighlight", false],
  ["SetFootnotes", false],
  ["SetToC", false],
  ["SetHeadingID", false],
  ["SetAutoSpace", false],
  ["SetEmoji", true],
  ["SetVditorWYSIWYG", false],
  ["SetProtyleWYSIWYG", true],
  ["SetVditorIR", false],
  ["SetVditorSV", false],
  ["SetInlineMath", true],
  ["SetInlineMathAllowDigitAfterOpenMarker", true],
  ["SetVditorCodeBlockPreview", false],
  ["SetVditorMathBlockPreview", false],
  ["SetVditorHTMLBlockPreview", false],
  ["SetRenderListStyle", false],
  ["SetSanitize", true],
  ["SetChineseParagraphBeginningSpace", false],
  ["SetYamlFrontMatter", false],
  ["SetSetext", false],
  ["SetBlockRef", true],
  ["SetFileAnnotationRef", true],
  ["SetMark", true],
  ["SetKramdownIAL", false],
  ["SetKramdownBlockIAL", false],
  ["SetKramdownSpanIAL", false],
  ["SetTag", true],
  ["SetImgPathAllowSpace", true],
  ["SetSuperBlock", true],
  ["SetSup", true],
  ["SetSub", true],
  ["SetInlineAsterisk", true],
  ["SetInlineUnderscore", true],
  ["SetGitConflict", true],
  ["SetLinkRef", false],
  ["SetIndentCodeBlock", false],
  ["SetDataImage", true],
  ["SetTextMark", true],
  ["SetParagraphBeginningSpace", true],
  ["SetProtyleMarkNetImg", false],
  ["SetSpellcheck", false],
  ["SetPreventEncodeLinkSpace", true],
  ["SetCallout", true],
  ["SetEnsureListItemParagraph", false],
];

let luteInstance: LuteInstance | null = null;

function getLute(): LuteInstance {
  if (luteInstance) return luteInstance;

  const factory = luteGlobal.Lute;
  if (!factory) {
    throw new Error("Lute 未加载，无法执行 Markdown 渲染");
  }

  const instance = factory.New();
  const setters = instance as unknown as Record<string, unknown>;
  for (const [name, value] of BOOLEAN_OPTIONS) {
    const setter = setters[name];
    if (typeof setter !== "function") {
      throw new Error(`当前 Lute 缺少配置方法：${name}`);
    }
    (setter as (nextValue: boolean) => void).call(instance, value);
  }
  instance.SetUnorderedListMarker("-");

  luteInstance = instance;
  return instance;
}

function readAttribute(tag: string, name: string): string | null {
  const match = tag.match(
    new RegExp(`\\s${escapeRegExp(name)}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i"),
  );
  return match?.[1] ?? match?.[2] ?? match?.[3] ?? null;
}

function replaceAttribute(tag: string, name: string, value: string): string {
  const pattern = new RegExp(`\\s${name}\\s*=\\s*(["'])(.*?)\\1`, "i");
  if (pattern.test(tag)) {
    return tag.replace(pattern, () => ` ${name}="${value}"`);
  }
  return appendAttributes(tag, [`${name}="${value}"`]);
}

function removeAttribute(tag: string, name: string): string {
  return tag.replace(
    new RegExp(
      `\\s${escapeRegExp(name)}\\s*=\\s*(?:"[^"]*"|'[^']*'|[^\\s>]+)`,
      "gi",
    ),
    "",
  );
}

function appendAttributes(tag: string, attributes: string[]): string {
  if (attributes.length === 0) return tag;
  const suffix = tag.endsWith("/>") ? "/>" : ">";
  const body = tag.slice(0, -suffix.length).trimEnd();
  return `${body} ${attributes.join(" ")} ${suffix}`;
}

const SAFE_RASTER_DATA_URL =
  /^data:image\/(?:png|jpe?g|gif|webp|avif);base64,[a-z0-9+/=_-]+$/i;

function decodeUrlEntities(value: string): string {
  return value.replace(
    /&(?:#x([0-9a-f]+)|#([0-9]+)|colon|tab|newline|nbsp);?/gi,
    (entity, hexadecimal: string | undefined, decimal: string | undefined) => {
      if (hexadecimal || decimal) {
        const rawCodePoint = hexadecimal ?? decimal;
        if (!rawCodePoint) return entity;
        const codePoint = Number.parseInt(rawCodePoint, hexadecimal ? 16 : 10);
        if (Number.isInteger(codePoint) && codePoint >= 0 && codePoint <= 0x10ffff) {
          return String.fromCodePoint(codePoint);
        }
        return entity;
      }
      if (/colon/i.test(entity)) return ":";
      if (/tab/i.test(entity)) return "\t";
      if (/newline/i.test(entity)) return "\n";
      return " ";
    },
  );
}

function normalizeUrlForSafety(value: string): string {
  return decodeUrlEntities(value)
    .replace(/[\u0000-\u0020\u007f\u00a0]/g, "")
    .toLowerCase();
}

function isSafeUrlAttribute(name: "href" | "src", value: string): boolean {
  const normalized = normalizeUrlForSafety(value);
  if (!normalized) return true;

  if (name === "src" && SAFE_RASTER_DATA_URL.test(normalized)) return true;

  const protocol = normalized.match(/^([a-z][a-z0-9+.-]*):/i)?.[1]?.toLowerCase();
  if (protocol) {
    if (name === "src" && /^https?$/.test(protocol)) return true;
    if (name === "src" && protocol === "asset") {
      return /^asset:\/\/localhost(?:\/|$)/i.test(normalized);
    }
    return name === "href" && /^(?:https?|mailto|tel)$/.test(protocol);
  }

  // 相对路径和锚点可用于本地 Markdown；协议相对 URL 会绕过这里的协议白名单。
  return !normalized.startsWith("//");
}

function sanitizeHtmlTag(tag: string): string {
  if (!/^<[a-z][^>]*>/i.test(tag) || /^<\//.test(tag)) return tag;

  let next = tag
    .replace(
      /\s+on[a-z][\w:-]*(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?/gi,
      "",
    )
    .replace(/\s+srcdoc\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "");

  for (const name of ["href", "src"] as const) {
    const value = readAttribute(next, name);
    if (value !== null && !isSafeUrlAttribute(name, value)) {
      next = removeAttribute(next, name);
    }
  }

  const style = readAttribute(next, "style");
  if (style && /(?:url\s*\(|expression\s*\(|-moz-binding|behavior\s*:)/i.test(style)) {
    next = removeAttribute(next, "style");
  }
  return next;
}

function sanitizeHtmlAttributes(html: string): string {
  return html.replace(/<[a-z][^>]*>/gi, sanitizeHtmlTag);
}

function isLocalAsset(src: string): boolean {
  return /^(?:File\/|assets\/|asset:\/\/localhost(?:\/|$))/i.test(src);
}

function adaptRenderedImage(tag: string): string {
  const src = readAttribute(tag, "src") ?? "";
  if (!src) return tag;

  const title = readAttribute(tag, "title");
  const attributes: string[] = [];
  const local = isLocalAsset(src);
  const doodled = title?.startsWith("mk-doodled|") === true;
  if (local && !doodled) attributes.push(`data-mk-rel="${src}"`);

  const width = parseWidthFromTitle(title);
  if (width) attributes.push(`data-mk-width="${width}"`);

  if (/^https?:\/\//i.test(src) || title?.startsWith("mk-hosted|") === true) {
    attributes.push('data-mk-hosted="1"');
  }
  if (doodled) {
    attributes.push(`data-mk-rel="${src}"`);
    attributes.push(`data-mk-doodled="${title.slice("mk-doodled|".length)}"`);
  }

  return appendAttributes(tag, attributes);
}

function normalizeRenderedHtml(html: string): string {
  const withImageMetadata = html.replace(/<img\b[^>]*>/gi, adaptRenderedImage);
  const withoutDynamicAttrs = withImageMetadata.replace(
    /\s(?:id|updated|data-node-id|data-node-index)=(['"])(.*?)\1/gi,
    "",
  );
  const withoutTableWrapper = withoutDynamicAttrs.replace(/&#34;/gi, "&quot;").replace(
    /<table\b[\s\S]*?<\/table>/gi,
    (table) => `<div class="mk-table-wrap">${table}</div>`,
  );
  return sanitizeHtmlAttributes(withoutTableWrapper);
}

function normalizeEditableImage(tag: string): string {
  const rel = readAttribute(tag, "data-mk-rel") ?? readAttribute(tag, "data-mk-local-rel");
  const title = readAttribute(tag, "title");
  const width = readAttribute(tag, "data-mk-width");
  const hosted = readAttribute(tag, "data-mk-hosted") === "1";
  const doodled = readAttribute(tag, "data-mk-doodled");

  let next = tag;
  if (rel) next = replaceAttribute(next, "src", rel);

  let nextTitle = title;
  if (doodled) {
    nextTitle = `mk-doodled|${doodled}`;
  } else if (hosted && rel) {
    nextTitle = `mk-hosted|${rel}`;
  } else if (width && Number(width) > 0) {
    nextTitle = formatWidthTitle(Number(width));
  }
  if (nextTitle) next = replaceAttribute(next, "title", nextTitle);

  for (const name of [
    "data-mk-rel",
    "data-mk-local-rel",
    "data-mk-width",
    "data-mk-hosted",
    "data-mk-doodled",
    "style",
    "class",
  ]) {
    next = removeAttribute(next, name);
  }
  return next;
}

function normalizeEditableHtml(html: string): string {
  const sanitizedHtml = sanitizeHtmlAttributes(html);
  const withoutTableWrapper = sanitizedHtml.replace(
    /<div\b[^>]*class=(['"])[^'">]*mk-table-wrap[^'">]*\1[^>]*>([\s\S]*?)<\/div>/gi,
    "$2",
  );
  const withoutImageFrame = withoutTableWrapper.replace(
    /<figure\b[^>]*class=(['"])[^'">]*mk-image-frame[^'">]*\1[^>]*>([\s\S]*?)<\/figure>/gi,
    (_match, _quote: string, inner: string) => inner.match(/<img\b[^>]*>/i)?.[0] ?? "",
  );
  return withoutImageFrame.replace(/<img\b[^>]*>/gi, normalizeEditableImage);
}

function stripAssetProtocol(markdown: string): string {
  return markdown.replace(
    /!\[([^\]]*)\]\(asset:\/\/localhost\/([^\s)]+)([^)]*)\)/g,
    (_match, alt: string, path: string, suffix: string) => `![${alt}](File/${path}${suffix})`,
  );
}

function sanitizeMarkdownUrlDestinations(markdown: string): string {
  let inFencedCode = false;

  return markdown
    .split(/(\r?\n)/)
    .map((part) => {
      if (/^\s*(`{3,}|~{3,})/.test(part)) {
        inFencedCode = !inFencedCode;
        return part;
      }
      if (inFencedCode || /^\r?\n$/.test(part)) return part;

      return part.replace(
        /(!?\[[^\]]*\])\(\s*(<[^>\r\n]*>|[^)\s\r\n]+)([^)]*)\)/g,
        (match, label: string, destinationToken: string) => {
          const destination = destinationToken.startsWith("<")
            ? destinationToken.slice(1, -1)
            : destinationToken;
          const attribute = label.startsWith("!") ? "src" : "href";
          return isSafeUrlAttribute(attribute, destination) ? match : `${label}()`;
        },
      );
    })
    .join("");
}

function collectLooseListItems(html: string): boolean[] {
  const looseItems: boolean[] = [];
  const listItemPattern = /<li\b[^>]*>/gi;
  let match: RegExpExecArray | null;

  while ((match = listItemPattern.exec(html))) {
    const afterOpeningTag = html.slice(match.index + match[0].length);
    looseItems.push(/^\s*<p\b/i.test(afterOpeningTag));
  }

  return looseItems;
}

function isSerializedListItemLine(line: string): boolean {
  return /^\s*(?:>\s*)*(?:[-+*]|\d+[.)])\s+(?:\[[ xX]\]\s+)?/.test(line);
}

function normalizeSerializedListSpacing(markdown: string, html: string): string {
  const looseItems = collectLooseListItems(html);
  if (looseItems.length === 0) return markdown;

  const lines = markdown.split("\n");
  const listItemIndexes = new Map<number, number>();
  let listItemIndex = 0;
  let inFencedCode = false;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (/^\s*(?:`{3,}|~{3,})/.test(line)) {
      inFencedCode = !inFencedCode;
      continue;
    }
    if (inFencedCode || !isSerializedListItemLine(line)) continue;

    listItemIndexes.set(index, listItemIndex);
    listItemIndex += 1;
  }

  if (listItemIndex === 0) return markdown;

  const normalized: string[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    if (
      lines[index].trim() === "" &&
      listItemIndexes.has(index - 1) &&
      listItemIndexes.has(index + 1)
    ) {
      const previousItemIndex = listItemIndexes.get(index - 1);
      if (previousItemIndex !== undefined && looseItems[previousItemIndex] === false) {
        continue;
      }
    }
    normalized.push(lines[index]);
  }

  return normalized.join("\n");
}

const HARD_BREAK_TOKEN_PREFIX = "\uE000MKNHARD";
const BACKSLASH_HARD_BREAK_TOKEN_PREFIX = "\uE000MKNBACK";
const SOFT_BREAK_TOKEN_PREFIX = "\uE000MKNSOFT";
const TOKEN_END = "\uE001";
const BACKSLASH_HARD_BREAK_MARKDOWN = "\\" + "\n";

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function createUniqueToken(source: string, prefix: string): string {
  let index = 0;
  let token = `${prefix}${index}${TOKEN_END}`;
  while (source.includes(token)) {
    index += 1;
    token = `${prefix}${index}${TOKEN_END}`;
  }
  return token;
}

function protectMarkdownHardBreaks(markdown: string): {
  markdown: string;
  spaceToken: string;
  backslashToken: string;
} {
  const spaceToken = createUniqueToken(markdown, HARD_BREAK_TOKEN_PREFIX);
  const backslashToken = createUniqueToken(
    `${markdown}${spaceToken}`,
    BACKSLASH_HARD_BREAK_TOKEN_PREFIX,
  );
  let inFencedCode = false;

  const protectedMarkdown = markdown.replace(/^([^\r\n]*)(\r?\n)/gm, (line, content: string, eol: string) => {
    if (/^\s*(`{3,}|~{3,})/.test(content)) {
      inFencedCode = !inFencedCode;
      return line;
    }
    if (inFencedCode) return line;
    if (content.includes("|")) return line;
    if (/[ ]{2,}$/.test(content)) {
      return `${content.replace(/[ ]{2,}$/, spaceToken)}${eol}`;
    }
    if (/\\$/.test(content)) {
      return `${content.slice(0, -1)}${backslashToken}${eol}`;
    }
    return line;
  });

  return { markdown: protectedMarkdown, spaceToken, backslashToken };
}

function annotateRenderedBreaks(
  html: string,
  hardBreakTokens: { spaceToken: string; backslashToken: string },
): string {
  let tableDepth = 0;
  const pattern = new RegExp(
    `${escapeRegExp(hardBreakTokens.backslashToken)}(<br\\b[^>]*>)|${escapeRegExp(hardBreakTokens.spaceToken)}(<br\\b[^>]*>)|<\\/?table\\b[^>]*>|<br\\b[^>]*>`,
    "gi",
  );

  return html.replace(
    pattern,
    (
      match,
      backslashBreakTag: string | undefined,
      spaceBreakTag: string | undefined,
    ) => {
      if (backslashBreakTag) {
        return appendAttributes(backslashBreakTag, [
          'data-mk-hard-break="1"',
          'data-mk-hard-break-style="backslash"',
        ]);
      }
      if (spaceBreakTag) {
        return appendAttributes(spaceBreakTag, [
          'data-mk-hard-break="1"',
          'data-mk-hard-break-style="spaces"',
        ]);
      }
      if (/^<table\b/i.test(match)) {
        tableDepth += 1;
        return match;
      }
      if (/^<\/table\b/i.test(match)) {
        tableDepth = Math.max(0, tableDepth - 1);
        return match;
      }
      if (tableDepth > 0) return match;
      return appendAttributes(match, ['data-mk-soft-break="1"']);
    },
  );
}

function extractCheckedTaskMarkers(markdown: string): string[] {
  const markers: string[] = [];
  let inFencedCode = false;

  for (const line of markdown.split(/\r?\n/)) {
    if (/^\s*(`{3,}|~{3,})/.test(line)) {
      inFencedCode = !inFencedCode;
      continue;
    }
    if (inFencedCode) continue;
    const match = line.match(/^\s*(?:>\s*)*(?:[-+*]|\d+[.)])\s+\[([xX])\]/);
    if (match) markers.push(match[1]);
  }

  return markers;
}

function annotateRenderedTaskMarkers(html: string, markdown: string): string {
  const markers = extractCheckedTaskMarkers(markdown);
  let markerIndex = 0;

  return html.replace(/<input\b[^>]*>/gi, (tag) => {
    if (!/\btype\s*=\s*["']checkbox["']/i.test(tag)) return tag;
    if (!/\bchecked(?:\s*=\s*(?:["'][^"']*["']|[^\s>]+))?/i.test(tag)) return tag;
    const marker = markers[markerIndex++] ?? "X";
    return appendAttributes(tag, [`data-mk-task-marker="${marker}"`]);
  });
}

function restoreTaskMarkerCases(markdown: string, html: string): string {
  const markers = [...html.matchAll(/<input\b[^>]*data-mk-task-marker\s*=\s*["']([xX])["'][^>]*>/gi)].map(
    (match) => match[1],
  );
  let markerIndex = 0;

  return markdown.replace(
    /(^|\n)([ \t]*(?:>\s*)*(?:[-+*]|\d+[.)])\s+)\[X\]/g,
    (_match, linePrefix: string, itemPrefix: string) => {
      const marker = markers[markerIndex++] ?? "X";
      return `${linePrefix}${itemPrefix}[${marker}]`;
    },
  );
}

function findMatchingDivRange(
  html: string,
  openingStart: number,
): { closeStart: number; closeEnd: number } | null {
  const divPattern = /<\/?div\b[^>]*>/gi;
  divPattern.lastIndex = openingStart;
  const opening = divPattern.exec(html);
  if (!opening || opening.index !== openingStart || !/^<div\b/i.test(opening[0])) return null;

  let depth = 1;
  let tag: RegExpExecArray | null;
  while ((tag = divPattern.exec(html))) {
    if (/^<div\b/i.test(tag[0])) {
      depth += 1;
      continue;
    }
    depth -= 1;
    if (depth === 0) {
      return { closeStart: tag.index, closeEnd: tag.index + tag[0].length };
    }
  }
  return null;
}

function protectEditableCallouts(html: string): {
  html: string;
  replacements: Array<{ token: string; markdown: string }>;
} {
  const calloutPattern = /<div\b[^>]*class=(['"])[^'"]*\bcallout\b[^'"]*\1[^>]*>/gi;
  const replacements: Array<{ token: string; markdown: string }> = [];
  let tokenSource = html;
  let output = "";
  let cursor = 0;
  let match: RegExpExecArray | null;

  while ((match = calloutPattern.exec(html))) {
    if (match.index < cursor) continue;
    const outerRange = findMatchingDivRange(html, match.index);
    if (!outerRange) break;

    const block = html.slice(match.index, outerRange.closeEnd);
    const contentOpen = /<div\b[^>]*class=(['"])[^'"]*\bcallout-content\b[^'"]*\1[^>]*>/i.exec(block);
    if (!contentOpen) continue;
    const contentRange = findMatchingDivRange(block, contentOpen.index);
    if (!contentRange) continue;

    const contentInnerStart = contentOpen.index + contentOpen[0].length;
    const contentInner = block.slice(contentInnerStart, contentRange.closeStart);
    const token = createUniqueToken(tokenSource, "\uE000MKNCALLOUT");
    tokenSource += token;
    const firstParagraph = /<p\b[^>]*>/i.exec(contentInner);
    const contentWithToken = firstParagraph
      ? `${contentInner.slice(0, firstParagraph.index + firstParagraph[0].length)}${token}${contentInner.slice(firstParagraph.index + firstParagraph[0].length)}`
      : `<p>${token}</p>${contentInner}`;
    const subtype = readAttribute(match[0], "data-subtype") ?? "NOTE";

    output += html.slice(cursor, match.index);
    output += `<blockquote>${contentWithToken}</blockquote>`;
    cursor = outerRange.closeEnd;
    calloutPattern.lastIndex = outerRange.closeEnd;
    replacements.push({ token, markdown: `[!${subtype}]\n> ` });
  }

  output += html.slice(cursor);
  return { html: output, replacements };
}

function protectEditableLineBreaks(html: string): {
  html: string;
  replacements: Array<{ token: string; markdown: string }>;
} {
  const replacements: Array<{ token: string; markdown: string }> = [];
  let tokenSource = html;
  let tableDepth = 0;
  let blockquoteDepth = 0;
  const protectedHtml = html.replace(
    /<\/?table\b[^>]*>|<\/?blockquote\b[^>]*>|<br\b[^>]*>/gi,
    (tag) => {
      if (/^<table\b/i.test(tag)) {
        tableDepth += 1;
        return tag;
      }
      if (/^<\/table\b/i.test(tag)) {
        tableDepth = Math.max(0, tableDepth - 1);
        return tag;
      }
      if (/^<blockquote\b/i.test(tag)) {
        blockquoteDepth += 1;
        return tag;
      }
      if (/^<\/blockquote\b/i.test(tag)) {
        blockquoteDepth = Math.max(0, blockquoteDepth - 1);
        return tag;
      }
      if (tableDepth > 0) return tag;

      const isSoftBreak = /\bdata-mk-soft-break\s*=\s*["']1["']/i.test(tag);
      const isBackslashHardBreak =
        /\bdata-mk-hard-break-style\s*=\s*["']backslash["']/i.test(tag);
      const token = createUniqueToken(
        tokenSource,
        isSoftBreak
          ? SOFT_BREAK_TOKEN_PREFIX
          : isBackslashHardBreak
            ? BACKSLASH_HARD_BREAK_TOKEN_PREFIX
            : HARD_BREAK_TOKEN_PREFIX,
      );
      tokenSource += token;
      replacements.push({
        token,
        markdown: `${
          isSoftBreak
            ? "\n"
            : isBackslashHardBreak
              ? BACKSLASH_HARD_BREAK_MARKDOWN
              : "  \n"
        }${"> ".repeat(blockquoteDepth)}`,
      });
      return `<span data-mk-line-break="1">${token}</span>`;
    },
  );

  return { html: protectedHtml, replacements };
}

export function luteMarkdownToHtml(markdown: string): string {
  const protectedMarkdown = protectMarkdownHardBreaks(markdown);
  const html = normalizeRenderedHtml(getLute().MarkdownStr("", protectedMarkdown.markdown));
  return annotateRenderedTaskMarkers(annotateRenderedBreaks(html, protectedMarkdown), markdown);
}

export function luteHtmlToMarkdown(html: string): string {
  const normalizedHtml = normalizeEditableHtml(html || "");
  if (!normalizedHtml.trim()) return "";
  const protectedCallouts = protectEditableCallouts(normalizedHtml);
  const protectedLineBreaks = protectEditableLineBreaks(protectedCallouts.html);
  const blockDom = getLute().HTML2BlockDOM(protectedLineBreaks.html);
  let markdown = stripAssetProtocol(getLute().BlockDOM2StdMd(blockDom).trim());
  for (const replacement of protectedLineBreaks.replacements) {
    markdown = markdown.replace(
      new RegExp(escapeRegExp(replacement.token), "g"),
      replacement.markdown,
    );
  }
  for (const replacement of protectedCallouts.replacements) {
    markdown = markdown.replace(
      new RegExp(escapeRegExp(replacement.token), "g"),
      replacement.markdown,
    );
  }
  const restoredMarkdown = restoreTaskMarkerCases(markdown, normalizedHtml);
  return sanitizeMarkdownUrlDestinations(
    normalizeSerializedListSpacing(restoredMarkdown, normalizedHtml),
  );
}
