import { Fragment, type Node as ProseMirrorNode } from "@milkdown/kit/prose/model";
import type { EditorState, Transaction } from "@milkdown/kit/prose/state";

interface TextLine {
  from: number;
  to: number;
}

// Both soft Markdown line breaks and Shift+Enter are real lines. Layout wrapping isn't.
function textLines(node: ProseMirrorNode): TextLine[] {
  const lines: TextLine[] = [];
  let start = 0;
  node.forEach((child, offset) => {
    if (child.type.name === "hardbreak") {
      lines.push({ from: start, to: offset });
      start = offset + child.nodeSize;
    } else if (child.isText) {
      for (let index = 0; index < child.text!.length; index += 1) {
        if (child.text![index] !== "\n") continue;
        lines.push({ from: start, to: offset + index });
        start = offset + index + 1;
      }
    }
  });
  lines.push({ from: start, to: node.content.size });
  return lines;
}

export function selectedLinesToTasks(state: EditorState): Transaction {
  const { from, to } = state.selection;
  const { paragraph, bullet_list: bulletList, list_item: listItem } = state.schema.nodes;
  const tr = state.tr;
  if (from === to) return tr;

  function splitBlock(node: ProseMirrorNode, pos: number, item?: ProseMirrorNode): ProseMirrorNode[] {
    const lines = textLines(node);
    const selected = lines.map((line) => {
      const content = node.content.cut(line.from, line.to);
      const nonempty = content.content.some((child) => !child.isText || !!child.text?.trim());
      return nonempty && from <= pos + 1 + line.to && to > pos + 1 + line.from;
    });
    if (!selected.some(Boolean)) return [item ?? node];

    const blocks: ProseMirrorNode[] = [];
    for (let index = 0; index < lines.length; index += 1) {
      let end = index;
      // Keep consecutive unselected lines (and their original inline breaks) together.
      if (!selected[index]) {
        while (end + 1 < lines.length && !selected[end + 1]) end += 1;
      }
      const content = node.content.cut(lines[index].from, lines[end].to);
      if (item) {
        const attrs = selected[index] ? { ...item.attrs, checked: false } : item.attrs;
        blocks.push(listItem.create(attrs, paragraph.create(node.attrs, content, node.marks)));
      } else if (selected[index]) {
        const task = listItem.create({ checked: false }, paragraph.create(null, content));
        const previous = blocks[blocks.length - 1];
        if (previous?.type === bulletList) {
          blocks[blocks.length - 1] = previous.copy(previous.content.append(Fragment.from(task)));
        } else {
          blocks.push(bulletList.create(null, task));
        }
      } else {
        blocks.push(node.copy(content));
      }
      index = end;
    }
    if (item && item.childCount > 1) {
      const last = blocks.length - 1;
      blocks[last] = blocks[last].copy(blocks[last].content.append(item.content.cut(node.nodeSize)));
    }
    return blocks;
  }

  function rewrite(node: ProseMirrorNode, pos: number): ProseMirrorNode[] {
    if (pos >= to || pos + node.nodeSize <= from) return [node];
    if (node.type === listItem) {
      const first = node.firstChild!;
      const children = [first];
      node.forEach((child, offset, index) => {
        if (index > 0) children.push(...rewrite(child, pos + 1 + offset));
      });
      const item = node.copy(Fragment.fromArray(children));
      // Preserve existing task text/state while still visiting its nested list items.
      return node.attrs.checked != null ? [item] : splitBlock(first, pos + 1, item);
    } else if (node.type === paragraph || node.type.name === "heading") {
      return splitBlock(node, pos);
    }
    if (node.isLeaf) return [node];
    const children: ProseMirrorNode[] = [];
    node.forEach((child, offset) => children.push(...rewrite(child, pos + 1 + offset)));
    const content = Fragment.fromArray(children);
    return [node.type.validContent(content) ? node.copy(content) : node];
  }

  const replacements: { pos: number; node: ProseMirrorNode; next: ProseMirrorNode[] }[] = [];
  state.doc.forEach((node, pos) => {
    const next = rewrite(node, pos);
    if (next.length !== 1 || !next[0].eq(node)) replacements.push({ pos, node, next });
  });
  // Reverse order keeps original positions valid and produces one undo step.
  for (const { pos, node, next } of replacements.reverse()) {
    tr.replaceWith(pos, pos + node.nodeSize, next);
  }
  return tr;
}
