import type { IconId } from "../components/Icon";

export type FormatAction =
  | "bold"
  | "italic"
  | "strikethrough"
  | "underline"
  | "highlight"
  | "caseTransform"
  | "task"
  | "taskDone"
  | "indent"
  | "outdent"
  | "h1"
  | "h2"
  | "h3"
  | "ul"
  | "ol"
  | "blockquote"
  | "inlineCode"
  | "codeBlock"
  | "link"
  | "image"
  | "table"
  | "hr"
  | "clearFormat";

function wrapSelection(
  text: string,
  start: number,
  end: number,
  before: string,
  after: string,
): { value: string; cursor: number } {
  const selected = text.slice(start, end);
  const value = text.slice(0, start) + before + selected + after + text.slice(end);
  return { value, cursor: start + before.length + selected.length + after.length };
}

function replaceSelection(
  text: string,
  start: number,
  end: number,
  replacement: string,
): { value: string; cursor: number } {
  const value = text.slice(0, start) + replacement + text.slice(end);
  return { value, cursor: start + replacement.length };
}

function getLineBlockRange(text: string, start: number, end: number) {
  const blockStart = text.lastIndexOf("\n", start - 1) + 1;
  let blockEnd = end;
  if (end > start && text[end - 1] === "\n") blockEnd = end - 1;
  const lastBreak = text.indexOf("\n", Math.max(start, blockEnd - 1));
  const blockEndLine = lastBreak === -1 ? text.length : lastBreak;
  return { blockStart, blockEnd: blockEndLine };
}

function mapLineBlock(
  text: string,
  blockStart: number,
  blockEnd: number,
  mapLine: (line: string) => string,
): string {
  const block = text.slice(blockStart, blockEnd);
  return text.slice(0, blockStart) + block.split("\n").map(mapLine).join("\n") + text.slice(blockEnd);
}

function toggleHeading(line: string, level: 1 | 2 | 3): string {
  const trimmed = line.trimStart();
  const indent = line.slice(0, line.length - trimmed.length);
  const headingMatch = trimmed.match(/^(#{1,6})\s+(.*)$/);
  const prefix = "#".repeat(level) + " ";
  if (headingMatch && headingMatch[1].length === level) {
    return indent + headingMatch[2];
  }
  const content = headingMatch ? headingMatch[2] : trimmed;
  return indent + prefix + content;
}

function toggleUlLine(line: string): string {
  const trimmed = line.trimStart();
  const indent = line.slice(0, line.length - trimmed.length);
  if (/^[-*+]\s+/.test(trimmed)) {
    return indent + trimmed.replace(/^[-*+]\s+/, "");
  }
  if (/^\d+\.\s+/.test(trimmed)) {
    return indent + "- " + trimmed.replace(/^\d+\.\s+/, "");
  }
  return indent + "- " + trimmed;
}

function toggleOlLines(lines: string[]): string[] {
  const allOrdered = lines.every((line) => {
    const trimmed = line.trimStart();
    return trimmed === "" || /^\d+\.\s+/.test(trimmed);
  });
  if (allOrdered) {
    return lines.map((line) => {
      const trimmed = line.trimStart();
      const indent = line.slice(0, line.length - trimmed.length);
      if (trimmed === "") return line;
      return indent + trimmed.replace(/^\d+\.\s+/, "");
    });
  }
  let index = 0;
  return lines.map((line) => {
    const trimmed = line.trimStart();
    const indent = line.slice(0, line.length - trimmed.length);
    if (trimmed === "") return line;
    index += 1;
    const content = trimmed
      .replace(/^[-*+]\s+/, "")
      .replace(/^\d+\.\s+/, "");
    return `${indent}${index}. ${content}`;
  });
}

function toggleBlockquoteLine(line: string): string {
  const trimmed = line.trimStart();
  const indent = line.slice(0, line.length - trimmed.length);
  if (/^>\s?/.test(trimmed)) {
    return indent + trimmed.replace(/^>\s?/, "");
  }
  return indent + "> " + trimmed;
}

function cycleCaseText(text: string): string {
  if (!text) return text;
  const hasLetter = /[a-zA-Z\u00C0-\u024F]/.test(text);
  if (!hasLetter) return text;
  if (text === text.toUpperCase()) {
    return text.toLowerCase();
  }
  if (text === text.toLowerCase()) {
    return text.replace(/\S+/g, (word) => {
      const lower = word.toLowerCase();
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    });
  }
  return text.toUpperCase();
}

function toggleTaskComplete(text: string, cursor: number): { value: string; cursor: number } {
  const lineStart = text.lastIndexOf("\n", cursor - 1) + 1;
  let lineEnd = text.indexOf("\n", cursor);
  if (lineEnd === -1) lineEnd = text.length;
  const line = text.slice(lineStart, lineEnd);
  const trimmed = line.trimStart();
  const indent = line.slice(0, line.length - trimmed.length);
  let newLine: string;
  const listTask = trimmed.match(/^([-*+])\s+\[([ xX])\]\s+(.*)$/);
  if (listTask) {
    const mark = listTask[2].toLowerCase() === "x" ? " " : "x";
    newLine = `${listTask[1]} [${mark}] ${listTask[3]}`;
  } else if (/^\[[ xX]\]\s/.test(trimmed)) {
    const bare = trimmed.match(/^\[([ xX])\]\s+(.*)$/);
    if (bare) {
      const mark = bare[1].toLowerCase() === "x" ? " " : "x";
      newLine = `[${mark}] ${bare[2]}`;
    } else {
      newLine = trimmed;
    }
  } else {
    newLine = `- [x] ${trimmed}`;
  }
  const value = text.slice(0, lineStart) + indent + newLine + text.slice(lineEnd);
  return { value, cursor: lineStart + indent.length + newLine.length };
}

function indentLine(line: string): string {
  if (line.length === 0) return "  ";
  return `  ${line}`;
}

function outdentLine(line: string): string {
  if (line.startsWith("\t")) return line.slice(1);
  if (line.startsWith("    ")) return line.slice(4);
  if (line.startsWith("  ")) return line.slice(2);
  if (line.startsWith(" ")) return line.slice(1);
  return line;
}

function toggleLineTask(text: string, cursor: number): { value: string; cursor: number } {
  const lineStart = text.lastIndexOf("\n", cursor - 1) + 1;
  let lineEnd = text.indexOf("\n", cursor);
  if (lineEnd === -1) lineEnd = text.length;
  const line = text.slice(lineStart, lineEnd);
  const trimmed = line.trimStart();
  const indent = line.slice(0, line.length - trimmed.length);
  let newLine: string;
  if (/^[-*]\s+\[[ xX]\]\s/.test(trimmed)) {
    newLine = trimmed.replace(/^[-*]\s+\[[ xX]\]\s/, "");
  } else if (/^\[[ xX]\]\s/.test(trimmed)) {
    newLine = trimmed.replace(/^\[[ xX]\]\s/, "");
  } else {
    newLine = `- [ ] ${trimmed}`;
  }
  const value = text.slice(0, lineStart) + indent + newLine + text.slice(lineEnd);
  return { value, cursor: lineStart + indent.length + newLine.length };
}

function stripMarkdown(text: string): string {
  return text
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^>\s?/gm, "")
    .replace(/^[-*+]\s+\[[ xX]\]\s+/gm, "")
    .replace(/^[-*+]\s+/gm, "")
    .replace(/^\d+\.\s+/gm, "")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/\*(.+?)\*/g, "$1")
    .replace(/__(.+?)__/g, "$1")
    .replace(/_(.+?)_/g, "$1")
    .replace(/~~(.+?)~~/g, "$1")
    .replace(/==(.+?)==/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/<u>(.*?)<\/u>/gi, "$1")
    .replace(/<mark>(.*?)<\/mark>/gi, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1");
}

const TABLE_TEMPLATE = `| 列1 | 列2 |
| --- | --- |
|  |  |`;

function insertAtCursor(text: string, start: number, end: number, insertion: string) {
  const needsLead = start > 0 && text[start - 1] !== "\n" && !insertion.startsWith("\n");
  const needsTrail = end < text.length && text[end] !== "\n" && !insertion.endsWith("\n");
  const payload = `${needsLead ? "\n\n" : ""}${insertion}${needsTrail ? "\n\n" : ""}`;
  return replaceSelection(text, start, end, payload);
}

function previewSelectionText(): string {
  return window.getSelection()?.toString() ?? "";
}

function insertHtmlInPreview(html: string) {
  document.execCommand("insertHTML", false, html);
}

interface TextareaFormatHistoryEntry {
  previous: string;
  next: string;
  previousSelection: { start: number; end: number };
  nextSelection: { start: number; end: number };
}

interface TextareaFormatHistoryState {
  undo: TextareaFormatHistoryEntry[];
  redo: TextareaFormatHistoryEntry[];
}

const textareaFormatHistory = new WeakMap<HTMLTextAreaElement, TextareaFormatHistoryState>();

function setTextareaHistoryValue(
  textarea: HTMLTextAreaElement,
  value: string,
  selection: { start: number; end: number },
): void {
  textarea.value = value;
  textarea.selectionStart = selection.start;
  textarea.selectionEnd = selection.end;
  textarea.focus();
}

export function undoTextareaFormat(textarea: HTMLTextAreaElement | null): string | null {
  if (!textarea) return null;
  const state = textareaFormatHistory.get(textarea);
  const entry = state && state.undo.length > 0 ? state.undo[state.undo.length - 1] : undefined;
  if (!state || !entry || textarea.value !== entry.next) return null;
  state.undo.pop();
  state.redo.push(entry);
  setTextareaHistoryValue(textarea, entry.previous, entry.previousSelection);
  return entry.previous;
}

export function redoTextareaFormat(textarea: HTMLTextAreaElement | null): string | null {
  if (!textarea) return null;
  const state = textareaFormatHistory.get(textarea);
  const entry = state && state.redo.length > 0 ? state.redo[state.redo.length - 1] : undefined;
  if (!state || !entry || textarea.value !== entry.previous) return null;
  state.redo.pop();
  state.undo.push(entry);
  setTextareaHistoryValue(textarea, entry.next, entry.nextSelection);
  return entry.next;
}

function applyTextareaValue(
  textarea: HTMLTextAreaElement,
  previous: string,
  next: string,
  cursor: number,
): void {
  if (previous !== next && typeof textarea.setRangeText === "function") {
    let prefixLength = 0;
    while (
      prefixLength < previous.length &&
      prefixLength < next.length &&
      previous[prefixLength] === next[prefixLength]
    ) {
      prefixLength += 1;
    }

    let suffixLength = 0;
    while (
      previous.length - suffixLength > prefixLength &&
      next.length - suffixLength > prefixLength &&
      previous[previous.length - suffixLength - 1] === next[next.length - suffixLength - 1]
    ) {
      suffixLength += 1;
    }

    const replacement = next.slice(prefixLength, next.length - suffixLength);
    textarea.setRangeText(
      replacement,
      prefixLength,
      previous.length - suffixLength,
      "preserve",
    );
  } else if (previous !== next) {
    // 极简测试桩或旧 WebView 没有 setRangeText 时保留可用的退化路径。
    textarea.value = next;
  }

  textarea.selectionStart = textarea.selectionEnd = Math.max(0, Math.min(cursor, next.length));
  textarea.focus();
}

export function applyFormatToTextarea(
  textarea: HTMLTextAreaElement,
  action: FormatAction,
): string {
  const previousValue = textarea.value;
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  let text = textarea.value;
  let cursor = end;

  switch (action) {
    case "bold": {
      const r = wrapSelection(text, start, end, "**", "**");
      text = r.value;
      cursor = r.cursor;
      break;
    }
    case "italic": {
      const r = wrapSelection(text, start, end, "*", "*");
      text = r.value;
      cursor = r.cursor;
      break;
    }
    case "strikethrough": {
      const r = wrapSelection(text, start, end, "~~", "~~");
      text = r.value;
      cursor = r.cursor;
      break;
    }
    case "underline": {
      const sel = text.slice(start, end) || "文字";
      const html = `<u>${sel}</u>`;
      text = text.slice(0, start) + html + text.slice(end);
      cursor = start + html.length;
      break;
    }
    case "highlight": {
      const r = wrapSelection(text, start, end, "==", "==");
      text = r.value;
      cursor = r.cursor;
      break;
    }
    case "caseTransform": {
      if (start === end) break;
      const selected = text.slice(start, end);
      const next = cycleCaseText(selected);
      const r = replaceSelection(text, start, end, next);
      text = r.value;
      cursor = r.cursor;
      break;
    }
    case "task": {
      if (start === end) {
        const r = toggleLineTask(text, start);
        text = r.value;
        cursor = r.cursor;
      } else {
        const { blockStart, blockEnd } = getLineBlockRange(text, start, end);
        const block = text.slice(blockStart, blockEnd).split("\n").map((line) => {
          const trimmed = line.trimStart();
          if (!trimmed || /^(?:[-*+]\s+)?\[[ xX]\](?:\s|$)/.test(trimmed)) return line;
          const indent = line.slice(0, line.length - trimmed.length);
          return `${indent}- [ ] ${trimmed.replace(/^(?:[-*+]\s+|\d+[.)]\s+)/, "")}`;
        }).join("\n");
        text = text.slice(0, blockStart) + block + text.slice(blockEnd);
        cursor = blockStart + block.length;
      }
      break;
    }
    case "taskDone": {
      const r = toggleTaskComplete(text, start);
      text = r.value;
      cursor = r.cursor;
      break;
    }
    case "indent": {
      const { blockStart, blockEnd } = getLineBlockRange(text, start, end);
      text = mapLineBlock(text, blockStart, blockEnd, indentLine);
      cursor = blockEnd;
      break;
    }
    case "outdent": {
      const { blockStart, blockEnd } = getLineBlockRange(text, start, end);
      text = mapLineBlock(text, blockStart, blockEnd, outdentLine);
      cursor = blockEnd;
      break;
    }
    case "h1":
    case "h2":
    case "h3": {
      const level = action === "h1" ? 1 : action === "h2" ? 2 : 3;
      const { blockStart, blockEnd } = getLineBlockRange(text, start, end);
      const block = text.slice(blockStart, blockEnd);
      const transformedBlock = block.split("\n").map((line) => toggleHeading(line, level)).join("\n");
      text = text.slice(0, blockStart) + transformedBlock + text.slice(blockEnd);
      cursor = blockStart + transformedBlock.length;
      break;
    }
    case "ul": {
      const { blockStart, blockEnd } = getLineBlockRange(text, start, end);
      text = mapLineBlock(text, blockStart, blockEnd, toggleUlLine);
      cursor = blockEnd;
      break;
    }
    case "ol": {
      const { blockStart, blockEnd } = getLineBlockRange(text, start, end);
      const block = text.slice(blockStart, blockEnd);
      const lines = block.split("\n");
      const nextLines = toggleOlLines(lines);
      text = text.slice(0, blockStart) + nextLines.join("\n") + text.slice(blockEnd);
      cursor = blockEnd;
      break;
    }
    case "blockquote": {
      const { blockStart, blockEnd } = getLineBlockRange(text, start, end);
      text = mapLineBlock(text, blockStart, blockEnd, toggleBlockquoteLine);
      cursor = blockEnd;
      break;
    }
    case "inlineCode": {
      const r = wrapSelection(text, start, end, "`", "`");
      text = r.value;
      cursor = r.cursor;
      break;
    }
    case "codeBlock": {
      const selected = text.slice(start, end);
      const body = selected || "代码";
      const fenced = `\`\`\`\n${body}\n\`\`\``;
      const r = replaceSelection(text, start, end, fenced);
      text = r.value;
      cursor = r.cursor;
      break;
    }
    case "link": {
      const label = text.slice(start, end) || "链接文字";
      const markdown = `[${label}](https://)`;
      const r = replaceSelection(text, start, end, markdown);
      text = r.value;
      cursor = start + `[${label}](`.length;
      break;
    }
    case "image": {
      const alt = text.slice(start, end) || "图片";
      const markdown = `![${alt}](https://)`;
      const r = replaceSelection(text, start, end, markdown);
      text = r.value;
      cursor = start + `![${alt}](`.length;
      break;
    }
    case "table": {
      const r = insertAtCursor(text, start, end, TABLE_TEMPLATE);
      text = r.value;
      cursor = r.cursor;
      break;
    }
    case "hr": {
      const r = insertAtCursor(text, start, end, "---");
      text = r.value;
      cursor = r.cursor;
      break;
    }
    case "clearFormat": {
      if (start === end) break;
      const selected = text.slice(start, end);
      const cleaned = stripMarkdown(selected);
      const r = replaceSelection(text, start, end, cleaned);
      text = r.value;
      cursor = r.cursor;
      break;
    }
  }

  applyTextareaValue(textarea, textarea.value, text, cursor);
  if (previousValue !== text) {
    const state = textareaFormatHistory.get(textarea) ?? { undo: [], redo: [] };
    state.undo.push({
      previous: previousValue,
      next: text,
      previousSelection: { start, end },
      nextSelection: { start: cursor, end: cursor },
    });
    state.redo.length = 0;
    textareaFormatHistory.set(textarea, state);
  }
  return text;
}

export function applyFormatToPreview(root: HTMLElement, action: FormatAction) {
  root.focus();
  switch (action) {
    case "bold":
      document.execCommand("bold");
      break;
    case "italic":
      document.execCommand("italic");
      break;
    case "strikethrough":
      document.execCommand("strikeThrough");
      break;
    case "underline":
      document.execCommand("underline");
      break;
    case "highlight": {
      const sel = previewSelectionText() || "文字";
      document.execCommand("insertText", false, `==${sel}==`);
      break;
    }
    case "caseTransform": {
      const sel = previewSelectionText();
      if (!sel) break;
      document.execCommand("insertText", false, cycleCaseText(sel));
      break;
    }
    case "task":
      document.execCommand("insertText", false, "- [ ] ");
      break;
    case "taskDone": {
      const anchor = window.getSelection()?.anchorNode;
      const element =
        anchor instanceof Element
          ? anchor
          : anchor?.parentElement ?? null;
      const li = element?.closest("li.task-list-item");
      const input = li?.querySelector('input[type="checkbox"]');
      if (input instanceof HTMLInputElement) {
        input.checked = !input.checked;
      } else {
        document.execCommand("insertText", false, "- [x] ");
      }
      break;
    }
    case "indent":
      document.execCommand("indent");
      break;
    case "outdent":
      document.execCommand("outdent");
      break;
    case "h1":
      document.execCommand("formatBlock", false, "<h1>");
      break;
    case "h2":
      document.execCommand("formatBlock", false, "<h2>");
      break;
    case "h3":
      document.execCommand("formatBlock", false, "<h3>");
      break;
    case "ul":
      document.execCommand("insertUnorderedList");
      break;
    case "ol":
      document.execCommand("insertOrderedList");
      break;
    case "blockquote":
      document.execCommand("formatBlock", false, "<blockquote>");
      break;
    case "inlineCode": {
      const sel = previewSelectionText() || "代码";
      insertHtmlInPreview(`<code>${sel}</code>`);
      break;
    }
    case "codeBlock": {
      const sel = previewSelectionText() || "代码";
      insertHtmlInPreview(`<pre><code>${sel}</code></pre>`);
      break;
    }
    case "link": {
      const sel = previewSelectionText() || "链接文字";
      insertHtmlInPreview(`<a href="https://">${sel}</a>`);
      break;
    }
    case "image":
      insertHtmlInPreview('<img src="https://" alt="图片" />');
      break;
    case "table":
      insertHtmlInPreview(
        "<table><thead><tr><th>列1</th><th>列2</th></tr></thead><tbody><tr><td></td><td></td></tr></tbody></table>",
      );
      break;
    case "hr":
      document.execCommand("insertHorizontalRule");
      break;
    case "clearFormat":
      document.execCommand("removeFormat");
      break;
  }
}

export const FONT_TOOLBAR_ITEMS: Array<{
  action: FormatAction;
  icon: IconId;
  title: string;
}> = [
  { action: "bold", icon: "bold", title: "加粗" },
  { action: "italic", icon: "italic", title: "斜体" },
  { action: "strikethrough", icon: "strikethrough", title: "删除线" },
  { action: "underline", icon: "underline", title: "下划线" },
  { action: "highlight", icon: "highlight", title: "高亮" },
  { action: "caseTransform", icon: "case_transform", title: "大小写转换（大写→小写→首字母大写）" },
];

export const MARKDOWN_TOOLBAR_GROUPS: Array<{
  items: Array<{ action: FormatAction; icon: IconId; title: string }>;
}> = [
  {
    items: [
      { action: "indent", icon: "indent", title: "缩进" },
      { action: "outdent", icon: "outdent", title: "取消缩进" },
      { action: "taskDone", icon: "task_done", title: "切换任务已完成" },
    ],
  },
  {
    items: [
      { action: "h1", icon: "h1", title: "一级标题" },
      { action: "h2", icon: "h2", title: "二级标题" },
      { action: "h3", icon: "h3", title: "三级标题" },
    ],
  },
  {
    items: [
      { action: "ul", icon: "ul", title: "无序列表" },
      { action: "ol", icon: "ol", title: "有序列表" },
      { action: "blockquote", icon: "blockquote", title: "引用" },
    ],
  },
  {
    items: [
      { action: "inlineCode", icon: "inline_code", title: "行内代码" },
      { action: "codeBlock", icon: "code_block", title: "代码块" },
    ],
  },
  {
    items: [
      { action: "link", icon: "link", title: "链接" },
      { action: "image", icon: "image", title: "图片" },
      { action: "table", icon: "table", title: "表格" },
    ],
  },
  {
    items: [
      { action: "hr", icon: "hr", title: "分割线" },
      { action: "task", icon: "task", title: "插入任务行" },
      { action: "clearFormat", icon: "clear_format", title: "清除格式" },
    ],
  },
];
