/** 将 textarea 焦点置于文本末尾（切换标签页后恢复编辑位置）。 */
export function focusTextareaAtEnd(el: HTMLTextAreaElement | null | undefined): void {
  if (!el) return;
  const end = el.value.length;
  el.focus();
  el.setSelectionRange(end, end);
}

/** 将 contentEditable 焦点置于内容末尾。 */
export function focusContentEditableAtEnd(el: HTMLElement | null | undefined): void {
  if (!el) return;
  el.focus();
  const selection = window.getSelection();
  if (!selection) return;
  const range = document.createRange();
  range.selectNodeContents(el);
  range.collapse(false);
  selection.removeAllRanges();
  selection.addRange(range);
}

export type CaretRange = { start: number; end: number };

export function getTextareaCaret(el: HTMLTextAreaElement): CaretRange {
  return { start: el.selectionStart, end: el.selectionEnd };
}

export function setTextareaCaret(el: HTMLTextAreaElement, start: number, end: number): void {
  const len = el.value.length;
  const s = Math.max(0, Math.min(start, len));
  const e = Math.max(s, Math.min(end, len));
  el.focus();
  el.setSelectionRange(s, e);
}

function textOffsetBefore(root: Node, targetNode: Node, targetOffset: number): number {
  // ProseMirror 的全选边界可能落在根元素上（例如 div:0 -> div:1），
  // 不能只遍历文本节点，否则起点也会被误判为全文末尾。
  const range = document.createRange();
  try {
    range.setStart(root, 0);
    range.setEnd(targetNode, targetOffset);
    return range.toString().length;
  } catch {
    // 选区短暂脱离编辑器时保留原有的安全兜底，避免工具栏操作抛错。
    return root.textContent?.length ?? 0;
  } finally {
    range.detach();
  }
}

export function getContentEditableCaret(root: HTMLElement): CaretRange {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) {
    return { start: 0, end: 0 };
  }
  const range = sel.getRangeAt(0);
  const start = textOffsetBefore(root, range.startContainer, range.startOffset);
  const end = range.collapsed
    ? start
    : textOffsetBefore(root, range.endContainer, range.endOffset);
  return { start, end };
}

export function setContentEditableCaret(root: HTMLElement, start: number, end: number): void {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node: Node | null;
  let count = 0;
  let startNode: Node | null = null;
  let startOff = 0;
  let endNode: Node | null = null;
  let endOff = 0;

  while ((node = walker.nextNode())) {
    const len = node.textContent?.length ?? 0;
    if (!startNode && count + len >= start) {
      startNode = node;
      startOff = Math.max(0, start - count);
    }
    if (count + len >= end) {
      endNode = node;
      endOff = Math.max(0, end - count);
      break;
    }
    count += len;
  }

  root.focus();
  const selection = window.getSelection();
  if (!selection) return;

  if (!startNode) {
    const range = document.createRange();
    range.selectNodeContents(root);
    range.collapse(start >= (root.textContent?.length ?? 0));
    selection.removeAllRanges();
    selection.addRange(range);
    return;
  }

  const range = document.createRange();
  range.setStart(startNode, startOff);
  range.setEnd(endNode ?? startNode, endNode ? endOff : startOff);
  selection.removeAllRanges();
  selection.addRange(range);
}
