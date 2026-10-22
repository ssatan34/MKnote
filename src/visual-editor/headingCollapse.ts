import { EditorState, Plugin, PluginKey } from "@milkdown/kit/prose/state";
import { Decoration, DecorationSet, type EditorView } from "@milkdown/kit/prose/view";
import { $prose } from "@milkdown/kit/utils";

export interface HeadingCollapseBlock {
  pos: number;
  nodeSize: number;
  type: string;
  level?: number;
}

export interface HeadingContentRange {
  from: number;
  to: number;
}

function isHeadingBlock(block: HeadingCollapseBlock): boolean {
  return block.type === "heading" && Number.isInteger(block.level);
}

/**
 * 计算标题折叠后需要隐藏的同级文档块。
 * 标题的内容区一直延伸到下一个同级或更高级标题；低级标题及其内容属于当前区段。
 */
export function getCollapsedHeadingContentRanges(
  blocks: readonly HeadingCollapseBlock[],
  collapsedPositions: ReadonlySet<number>,
): HeadingContentRange[] {
  const ranges: HeadingContentRange[] = [];
  let activeCollapsedLevel: number | null = null;

  for (const block of blocks) {
    if (isHeadingBlock(block)) {
      const level = block.level as number;
      if (activeCollapsedLevel !== null && level <= activeCollapsedLevel) {
        activeCollapsedLevel = null;
      }

      if (activeCollapsedLevel !== null) {
        ranges.push({ from: block.pos, to: block.pos + block.nodeSize });
        continue;
      }

      if (collapsedPositions.has(block.pos)) {
        activeCollapsedLevel = level;
      }
      continue;
    }

    if (activeCollapsedLevel !== null) {
      ranges.push({ from: block.pos, to: block.pos + block.nodeSize });
    }
  }

  return ranges;
}

interface HeadingCollapsePluginState {
  collapsed: Set<number>;
}

interface HeadingCollapseMeta {
  toggle?: number;
}

const headingCollapseKey = new PluginKey<HeadingCollapsePluginState>("mknote-heading-collapse");

function collectTopLevelBlocks(state: EditorState): HeadingCollapseBlock[] {
  const blocks: HeadingCollapseBlock[] = [];
  state.doc.forEach((node, pos) => {
    blocks.push({
      pos,
      nodeSize: node.nodeSize,
      type: node.type.name,
      level: node.type.name === "heading" ? Number(node.attrs.level) : undefined,
    });
  });
  return blocks;
}

function createHeadingCollapseButton(
  view: EditorView,
  pos: number,
  level: number,
  collapsed: boolean,
): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "mk-heading-collapse-toggle";
  button.contentEditable = "false";
  button.dataset.headingLevel = String(level);
  button.dataset.collapsed = String(collapsed);
  button.setAttribute("aria-expanded", String(!collapsed));
  button.setAttribute("aria-label", collapsed ? "展开标题内容" : "折叠标题内容");
  button.title = collapsed ? "展开标题内容" : "折叠标题内容";

  const stopSelection = (event: Event): void => {
    event.preventDefault();
    event.stopPropagation();
  };
  button.addEventListener("mousedown", stopSelection);
  button.addEventListener("click", (event) => {
    stopSelection(event);
    view.dispatch(view.state.tr.setMeta(headingCollapseKey, { toggle: pos } satisfies HeadingCollapseMeta));
    view.focus();
  });
  return button;
}

export const headingCollapsePlugin = $prose(
  () =>
    new Plugin<HeadingCollapsePluginState>({
      key: headingCollapseKey,
      state: {
        init: () => ({ collapsed: new Set<number>() }),
        apply(transaction, previous) {
          const collapsed = new Set<number>();
          for (const pos of previous.collapsed) {
            const mapped = transaction.mapping.mapResult(pos, -1);
            if (!mapped.deleted) collapsed.add(mapped.pos);
          }

          const meta = transaction.getMeta(headingCollapseKey) as HeadingCollapseMeta | undefined;
          if (typeof meta?.toggle === "number") {
            if (collapsed.has(meta.toggle)) collapsed.delete(meta.toggle);
            else collapsed.add(meta.toggle);
          }
          return { collapsed };
        },
      },
      props: {
        decorations(state) {
          const pluginState = headingCollapseKey.getState(state) ?? { collapsed: new Set<number>() };
          const decorations: Decoration[] = [];
          const blocks = collectTopLevelBlocks(state);

          for (const block of blocks) {
            if (!isHeadingBlock(block)) continue;
            const level = block.level as number;
            const collapsed = pluginState.collapsed.has(block.pos);
            decorations.push(
              Decoration.widget(
                block.pos + 1,
                (view) => createHeadingCollapseButton(view, block.pos, level, collapsed),
                { side: -1 },
              ),
            );
          }

          for (const range of getCollapsedHeadingContentRanges(blocks, pluginState.collapsed)) {
            decorations.push(
              Decoration.node(range.from, range.to, {
                class: "mk-heading-section-hidden",
                "aria-hidden": "true",
              }),
            );
          }

          return DecorationSet.create(state.doc, decorations);
        },
      },
    }),
);
