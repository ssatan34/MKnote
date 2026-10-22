import {
  commandsCtx,
  defaultValueCtx,
  editorViewCtx,
  Editor,
  parserCtx,
  rootCtx,
  remarkStringifyOptionsCtx,
  serializerCtx,
} from "@milkdown/kit/core";
import type { Node as MarkdownNode } from "@milkdown/transformer";
import { DOMSerializer, type Node as ProseMirrorNode } from "@milkdown/kit/prose/model";
import type { EditorView, NodeView, ViewMutationRecord } from "@milkdown/kit/prose/view";
import { clipboard } from "@milkdown/kit/plugin/clipboard";
import { history, redoCommand, undoCommand } from "@milkdown/kit/plugin/history";
import { listener, listenerCtx } from "@milkdown/kit/plugin/listener";
import { toggleMark } from "@milkdown/kit/prose/commands";
import {
  commonmark,
  createCodeBlockCommand,
  imageAttr,
  imageSchema,
  insertHrCommand,
  liftListItemCommand,
  sinkListItemCommand,
  toggleInlineCodeCommand,
  toggleLinkCommand,
  toggleEmphasisCommand,
  toggleStrongCommand,
  wrapInBlockquoteCommand,
  wrapInBulletListCommand,
  wrapInHeadingCommand,
  wrapInOrderedListCommand,
} from "@milkdown/kit/preset/commonmark";
import {
  addColAfterCommand,
  addRowAfterCommand,
  deleteSelectedCellsCommand,
  gfm,
  insertTableCommand,
  selectColCommand,
  selectRowCommand,
  setAlignCommand,
  toggleStrikethroughCommand,
} from "@milkdown/kit/preset/gfm";
import { addRowAfter, goToNextCell, isInTable, selectedRect } from "@milkdown/kit/prose/tables";
import { EditorState, Plugin, TextSelection } from "@milkdown/kit/prose/state";
import { $command, $markSchema, $nodeSchema, $prose, $remark } from "@milkdown/kit/utils";
import type { Root } from "mdast";
import type { VisualEditorAdapter, VisualEditorCommand, VisualEditorSelection } from "./visualEditorSession.ts";
import {
  findVisualTextRanges,
  selectNextVisualRange,
  type VisualTextNode,
} from "./visualEditorSearch.ts";
import {
  parseVisualImageMetadata,
  serializeVisualImageSource,
  serializeVisualImageTitle,
  type VisualImageInput,
  type VisualImageMetadata,
} from "./visualEditorImage.ts";
import {
  formatVisualWikilink,
  parseVisualWikilink,
  splitVisualWikilinkText,
  VISUAL_WIKILINK_NODE_TYPE,
} from "./visualEditorWikilink.ts";
import { headingCollapsePlugin } from "./headingCollapse.ts";
import { selectedLinesToTasks } from "./visualEditorTasks.ts";
import { isUploadingImageSource } from "../utils/imageUploadPlaceholder.ts";
import { assetService } from "../services/assetService";

// Display URLs belong to the DOM only; keep Markdown paths in the document.
const localImageNodeView = $prose(() => new Plugin({
  props: {
    nodeViews: {
      image(node, view) {
        const { dom } = DOMSerializer.renderSpec(
          view.dom.ownerDocument,
          node.type.spec.toDOM!(node),
        );
        let destroyed = false;
        const metadata = node.attrs as VisualImageMetadata;
        if (dom instanceof HTMLImageElement && metadata.localRel) {
          // Avoid requesting the unavailable host while resolving the local backup.
          dom.removeAttribute("src");
          void assetService.resolveDisplayUrl(metadata.localRel).then((url) => {
            if (!destroyed) dom.src = url;
          }).catch(() => {
            if (!destroyed) dom.src = metadata.hostedUrl || metadata.src;
          });
        }
        return {
          dom,
          ignoreMutation: (mutation) => mutation.type === "attributes",
          destroy: () => { destroyed = true; },
        };
      },
    },
  },
}));

const visualImageSchema = imageSchema.extendSchema((previous) => (ctx) => {
  const base = previous(ctx);
  return {
    ...base,
    attrs: {
      ...base.attrs,
      sourceKind: { default: "local", validate: "string" },
      localRel: { default: "", validate: "string" },
      originalLocalRel: { default: "", validate: "string" },
      hostedUrl: { default: "", validate: "string" },
      width: { default: 0, validate: "number" },
      doodledUrl: { default: "", validate: "string" },
    },
      parseDOM: [
        {
          tag: "span[data-mk-uploading]",
          getAttrs: (dom) => {
            if (!(dom instanceof HTMLElement)) return false;
            const source = dom.getAttribute("data-mk-uploading") ?? "";
            if (!isUploadingImageSource(source)) return false;
            return parseVisualImageMetadata(
              source,
              dom.getAttribute("aria-label") ?? "图片",
              "",
            );
          },
        },
        {
          tag: "img[src]",
          getAttrs: (dom) => {
            if (!(dom instanceof HTMLElement)) return false;
            const src = dom.getAttribute("src") ?? "";
            const localRel = dom.getAttribute("data-mk-rel") ?? "";
            const metadata = parseVisualImageMetadata(
              localRel || src,
              dom.getAttribute("alt") ?? "",
              dom.getAttribute("title") ?? "",
            );
            return {
              ...metadata,
              src,
              localRel: localRel || metadata.localRel,
            };
          },
        },
      ],
      toDOM: (node) => {
        const metadata = node.attrs as VisualImageMetadata;
        if (isUploadingImageSource(metadata.src)) {
          return [
            "span",
            {
              class: "mk-image-uploading",
              "data-mk-uploading": metadata.src,
              role: "status",
              "aria-label": "正在上传图片",
              contenteditable: "false",
            },
            ["span", { "aria-hidden": "true" }, "↑"],
          ];
        }
        const attrs = {
          ...ctx.get(imageAttr.key)(node),
          src: metadata.src,
          alt: metadata.alt,
          title: metadata.title,
        } as Record<string, string>;
        if (metadata.sourceKind) attrs["data-mk-source-kind"] = metadata.sourceKind;
        if (metadata.localRel) attrs["data-mk-rel"] = metadata.localRel;
        if (metadata.originalLocalRel) attrs["data-mk-original-local-rel"] = metadata.originalLocalRel;
        if (metadata.hostedUrl) attrs["data-mk-hosted-url"] = metadata.hostedUrl;
        if (metadata.width > 0) attrs["data-mk-width"] = String(metadata.width);
        if (metadata.doodledUrl) attrs["data-mk-doodled"] = metadata.doodledUrl;
        return ["img", attrs];
    },
    parseMarkdown: {
      match: ({ type }) => type === "image",
      runner: (state, node, type) => {
        const metadata = parseVisualImageMetadata(
          String(node.url ?? ""),
          String(node.alt ?? ""),
          typeof node.title === "string" ? node.title : "",
        );
        state.addNode(type, metadata);
      },
    },
    toMarkdown: {
      match: (node) => node.type.name === "image",
      runner: (state, node) => {
        const metadata = node.attrs as VisualImageMetadata;
        state.addNode("image", undefined, undefined, {
          title: serializeVisualImageTitle(metadata),
          url: serializeVisualImageSource(metadata),
          alt: metadata.alt,
        });
      },
    },
  };
});

interface VisualWikilinkMarkdownNode extends MarkdownNode {
  type: string;
  value?: unknown;
  target?: unknown;
  alias?: unknown;
  source?: unknown;
  children?: VisualWikilinkMarkdownNode[];
}

function transformVisualWikilinkNode(
  node: VisualWikilinkMarkdownNode,
): VisualWikilinkMarkdownNode[] {
  if (node.type === "text" && typeof node.value === "string") {
    return splitVisualWikilinkText(node.value).map((part) => {
      if (part.kind === "text") return { ...node, value: part.value };
      return {
        type: VISUAL_WIKILINK_NODE_TYPE,
        target: part.link.target,
        alias: part.link.alias,
        source: part.link.source,
      };
    });
  }

  if (node.children) {
    node.children = node.children.flatMap(transformVisualWikilinkNode);
  }
  return [node];
}

export const wikilinkRemark = $remark(
  "visualWikilinkRemark",
  () => () => {
    return (tree: Root): void => {
      const root = tree as VisualWikilinkMarkdownNode;
      if (root.children) root.children = root.children.flatMap(transformVisualWikilinkNode);
    };
  },
);

export const wikilinkSchema = $nodeSchema(VISUAL_WIKILINK_NODE_TYPE, () => ({
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,
  attrs: {
    target: { default: "", validate: "string" },
    alias: { default: "", validate: "string" },
    source: { default: "", validate: "string" },
  },
  toDOM: (node) => {
    const target = String(node.attrs.target ?? "");
    const alias = String(node.attrs.alias ?? "");
    const source = String(node.attrs.source ?? formatVisualWikilink({ target, alias }));
    return [
      "span",
      {
        class: "mknote-wikilink",
        "data-type": "wikilink",
        "data-wikilink-target": target,
        "data-wikilink-source": source,
        role: "link",
        tabindex: "0",
      },
      alias || target,
    ];
  },
  parseDOM: [
    {
      tag: "span[data-type=\"wikilink\"]",
      getAttrs: (dom) => {
        const source = dom.getAttribute("data-wikilink-source") ?? "";
        const parsed = parseVisualWikilink(source);
        if (parsed) return parsed;
        const target = dom.getAttribute("data-wikilink-target")?.trim() ?? "";
        if (!target) return false;
        return {
          target,
          alias: dom.textContent?.trim() ?? "",
          source: formatVisualWikilink({ target, alias: dom.textContent?.trim() ?? "" }),
        };
      },
    },
  ],
  parseMarkdown: {
    match: ({ type }) => type === VISUAL_WIKILINK_NODE_TYPE,
    runner: (state, node, type) => {
      const markdownNode = node as VisualWikilinkMarkdownNode;
      const target = String(markdownNode.target ?? "").trim();
      const alias = String(markdownNode.alias ?? "").trim();
      const source = String(markdownNode.source ?? formatVisualWikilink({ target, alias }));
      state.addNode(type, { target, alias, source });
    },
  },
  toMarkdown: {
    match: (node) => node.type.name === VISUAL_WIKILINK_NODE_TYPE,
    runner: (state, node) => {
      const target = String(node.attrs.target ?? "");
      const alias = String(node.attrs.alias ?? "");
      const source = String(node.attrs.source ?? formatVisualWikilink({ target, alias }));
      state.addNode("text", [], source);
    },
  },
}));

const VISUAL_UNDERLINE_MARK = "visualUnderline";
const VISUAL_HIGHLIGHT_MARK = "visualHighlight";

interface VisualInlineMarkdownNode extends MarkdownNode {
  type: string;
  value?: unknown;
  children?: VisualInlineMarkdownNode[];
  isMark?: boolean;
}

function isUnderlineOpenNode(node: VisualInlineMarkdownNode): boolean {
  return node.type === "html" && /^<u(?:\s[^>]*)?>$/i.test(String(node.value ?? "").trim());
}

function isUnderlineCloseNode(node: VisualInlineMarkdownNode): boolean {
  return node.type === "html" && /^<\/u>$/i.test(String(node.value ?? "").trim());
}

function splitVisualHighlightText(node: VisualInlineMarkdownNode): VisualInlineMarkdownNode[] {
  if (node.type !== "text" || typeof node.value !== "string") return [node];
  const parts = node.value.split(/(==[^=\r\n]+==)/g);
  return parts.filter(Boolean).map((part) => {
    if (part.startsWith("==") && part.endsWith("==") && part.length > 4) {
      return {
        type: VISUAL_HIGHLIGHT_MARK,
        children: [{ type: "text", value: part.slice(2, -2) }],
      };
    }
    return { ...node, value: part };
  });
}

function expandVisualSerializedMark(node: VisualInlineMarkdownNode): VisualInlineMarkdownNode[] {
  const children = node.children?.flatMap(expandVisualSerializedMark) ?? [];
  if (node.type !== "html" || node.isMark !== true) {
    return node.children ? [{ ...node, children }] : [node];
  }

  const marker = String(node.value ?? "");
  const closing = marker === "<u>" ? "</u>" : marker === "==" ? "==" : "";
  if (!closing) return node.children ? [{ ...node, children }] : [node];
  return [
    { type: "html", value: marker },
    ...children,
    { type: "html", value: closing },
  ];
}

function transformVisualInlineChildren(
  children: VisualInlineMarkdownNode[],
): VisualInlineMarkdownNode[] {
  const transformed = children.flatMap((child) => {
    if (child.type === "html" && child.isMark === true) return expandVisualSerializedMark(child);
    return transformVisualInlineNode(child);
  });
  const result: VisualInlineMarkdownNode[] = [];

  for (let index = 0; index < transformed.length; index += 1) {
    const child = transformed[index];
    if (!isUnderlineOpenNode(child)) {
      result.push(child);
      continue;
    }

    const closeIndex = transformed.findIndex(
      (candidate, candidateIndex) => candidateIndex > index && isUnderlineCloseNode(candidate),
    );
    if (closeIndex < 0) {
      result.push(child);
      continue;
    }

    result.push({
      type: VISUAL_UNDERLINE_MARK,
      children: transformed.slice(index + 1, closeIndex),
    });
    index = closeIndex;
  }

  return result;
}

function transformVisualInlineNode(node: VisualInlineMarkdownNode): VisualInlineMarkdownNode[] {
  if (node.type === "text") return splitVisualHighlightText(node);
  if (node.type === "inlineCode" || node.type === "code") return [node];
  if (!node.children) return [node];
  return [{ ...node, children: transformVisualInlineChildren(node.children) }];
}

export const visualInlineMarkupRemark = $remark(
  "visualInlineMarkupRemark",
  () => () => (tree: Root): void => {
    const root = tree as VisualInlineMarkdownNode;
    if (root.children) root.children = transformVisualInlineChildren(root.children);
  },
);

export const visualUnderlineSchema = $markSchema(VISUAL_UNDERLINE_MARK, () => ({
  parseDOM: [{ tag: "u" }],
  toDOM: () => ["u", 0],
  parseMarkdown: {
    match: ({ type }) => type === VISUAL_UNDERLINE_MARK,
    runner: (state, node, markType) => {
      state.openMark(markType);
      state.next(node.children);
      state.closeMark(markType);
    },
  },
  toMarkdown: {
    match: (mark) => mark.type.name === VISUAL_UNDERLINE_MARK,
    runner: (state, mark) => {
      state.withMark(mark, "html", "<u>");
    },
  },
}));

export const visualHighlightSchema = $markSchema(VISUAL_HIGHLIGHT_MARK, () => ({
  parseDOM: [{ tag: "mark" }],
  toDOM: () => ["mark", 0],
  parseMarkdown: {
    match: ({ type }) => type === VISUAL_HIGHLIGHT_MARK,
    runner: (state, node, markType) => {
      state.openMark(markType);
      state.next(node.children);
      state.closeMark(markType);
    },
  },
  toMarkdown: {
    match: (mark) => mark.type.name === VISUAL_HIGHLIGHT_MARK,
    runner: (state, mark) => {
      state.withMark(mark, "html", "==");
    },
  },
}));

const toggleVisualUnderlineCommand = $command(
  "ToggleVisualUnderline",
  (ctx) => () => toggleMark(visualUnderlineSchema.type(ctx)),
);

const toggleVisualHighlightCommand = $command(
  "ToggleVisualHighlight",
  (ctx) => () => toggleMark(visualHighlightSchema.type(ctx)),
);

const insertImageCommand = $command(
  "InsertVisualImage",
  (ctx) =>
    (payload: VisualImageInput = { src: "", alt: "图片" }) =>
      (state, dispatch) => {
        if (!dispatch) return true;
        const metadata = parseVisualImageMetadata(payload.src, payload.alt ?? "", payload.title ?? "");
        const node = visualImageSchema.type(ctx).create(metadata);
        dispatch(state.tr.replaceSelectionWith(node).scrollIntoView());
        return true;
      },
);

interface CurrentListItem {
  node: ProseMirrorNode;
  pos: number;
}

function getCurrentListItem(view: EditorView): CurrentListItem | null {
  const { $from } = view.state.selection;
  for (let depth = $from.depth; depth > 0; depth -= 1) {
    const node = $from.node(depth);
    if (node.type.name === "list_item") {
      return { node, pos: $from.before(depth) };
    }
  }
  return null;
}

function setCurrentTaskState(view: EditorView, checked: boolean): boolean {
  const current = getCurrentListItem(view);
  if (!current) return false;
  view.dispatch(
    view.state.tr
      .setNodeMarkup(current.pos, undefined, { ...current.node.attrs, checked })
      .scrollIntoView(),
  );
  return true;
}

function createVisualListItemNodeView(
  node: ProseMirrorNode,
  view: EditorView,
  getPos: () => number | undefined,
): NodeView {
  let currentNode = node;
  const dom = document.createElement("li");
  const contentDOM = document.createElement("div");
  const isTask = node.attrs.checked !== null && node.attrs.checked !== undefined;
  const checkbox = isTask ? document.createElement("input") : null;

  dom.dataset.label = String(node.attrs.label ?? "");
  dom.dataset.listType = String(node.attrs.listType ?? "bullet");
  dom.dataset.spread = String(node.attrs.spread ?? true);
  if (isTask) {
    dom.dataset.itemType = "task";
    dom.dataset.checked = String(node.attrs.checked === true);
    checkbox!.type = "checkbox";
    checkbox!.checked = node.attrs.checked === true;
    checkbox!.setAttribute("aria-label", "切换任务状态");
    checkbox!.setAttribute("data-mk-task-checkbox", "true");
    checkbox!.contentEditable = "false";
    checkbox!.addEventListener("change", () => {
      const pos = getPos();
      if (pos === undefined) return;
      view.dispatch(
        view.state.tr
          .setNodeMarkup(pos, undefined, { ...currentNode.attrs, checked: checkbox!.checked })
          .scrollIntoView(),
      );
      view.focus();
    });
    dom.append(checkbox!);
  }
  dom.append(contentDOM);

  return {
    dom,
    contentDOM,
    update(nextNode) {
      if (nextNode.type !== currentNode.type) return false;
      const nextIsTask = nextNode.attrs.checked !== null && nextNode.attrs.checked !== undefined;
      if (nextIsTask !== Boolean(checkbox)) return false;
      currentNode = nextNode;
      dom.dataset.label = String(nextNode.attrs.label ?? "");
      dom.dataset.listType = String(nextNode.attrs.listType ?? "bullet");
      dom.dataset.spread = String(nextNode.attrs.spread ?? true);
      if (checkbox) {
        dom.dataset.itemType = "task";
        dom.dataset.checked = String(nextNode.attrs.checked === true);
        checkbox.checked = nextNode.attrs.checked === true;
      }
      return true;
    },
    stopEvent(event) {
      return event.target === checkbox;
    },
    ignoreMutation(mutation: ViewMutationRecord) {
      return Boolean(checkbox && mutation.type === "attributes" && mutation.target === checkbox);
    },
  };
}

function createVisualHardbreakNodeView(node: ProseMirrorNode): NodeView {
  const dom = document.createElement("br");
  dom.dataset.type = "hardbreak";
  return {
    dom,
    update(nextNode) {
      return nextNode.type === node.type;
    },
    ignoreMutation: () => true,
  };
}

function createVisualCodeBlockNodeView(node: ProseMirrorNode): NodeView {
  let currentNode = node;
  let collapsed = false;
  const dom = document.createElement("div");
  const toolbar = document.createElement("div");
  const language = document.createElement("span");
  const copyButton = document.createElement("button");
  const collapseButton = document.createElement("button");
  const pre = document.createElement("pre");
  const contentDOM = document.createElement("code");

  dom.className = "mk-code-block";
  toolbar.className = "mk-code-toolbar";
  language.className = "mk-code-language";
  copyButton.className = "mk-code-copy";
  collapseButton.className = "mk-code-collapse";
  copyButton.type = "button";
  collapseButton.type = "button";
  copyButton.textContent = "复制";
  collapseButton.textContent = "收起";
  copyButton.setAttribute("aria-label", "复制代码");
  collapseButton.setAttribute("aria-label", "收起代码块");
  pre.className = "mk-code-pre";
  pre.append(contentDOM);
  toolbar.append(language, copyButton, collapseButton);
  dom.append(toolbar, pre);

  const updateLanguage = (nextNode: ProseMirrorNode): void => {
    const value = typeof nextNode.attrs.language === "string" ? nextNode.attrs.language.trim() : "";
    language.textContent = value || "代码";
    dom.dataset.language = value;
  };
  const updateCollapsed = (): void => {
    dom.classList.toggle("mk-code-collapsed", collapsed);
    dom.dataset.collapsed = String(collapsed);
    pre.hidden = collapsed;
    pre.style.display = collapsed ? "none" : "";
    collapseButton.textContent = collapsed ? "展开" : "收起";
    collapseButton.setAttribute("aria-label", collapsed ? "展开代码块" : "收起代码块");
    collapseButton.setAttribute("aria-expanded", String(!collapsed));
  };

  updateLanguage(node);
  updateCollapsed();

  copyButton.addEventListener("mousedown", (event) => event.preventDefault());
  copyButton.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    const writeText = navigator.clipboard?.writeText;
    if (!writeText) {
      copyButton.textContent = "复制失败";
      return;
    }
    void navigator.clipboard.writeText(currentNode.textContent).then(
      () => {
        copyButton.textContent = "已复制";
        window.setTimeout(() => {
          copyButton.textContent = "复制";
        }, 1200);
      },
      () => {
        copyButton.textContent = "复制失败";
      },
    );
  });
  collapseButton.addEventListener("mousedown", (event) => event.preventDefault());
  collapseButton.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    collapsed = !collapsed;
    updateCollapsed();
  });

  return {
    dom,
    contentDOM,
    update(nextNode) {
      if (nextNode.type !== currentNode.type) return false;
      currentNode = nextNode;
      updateLanguage(nextNode);
      return true;
    },
    stopEvent(event) {
      return event.target instanceof Element && toolbar.contains(event.target);
    },
    ignoreMutation(mutation) {
      return (
        toolbar.contains(mutation.target) ||
        mutation.target === pre ||
        (mutation.type === "attributes" && mutation.target === dom)
      );
    },
  };
}

const listItemNodeView = $prose(
  () =>
    new Plugin({
      props: {
        nodeViews: {
          list_item: (node, view, getPos) => createVisualListItemNodeView(node, view, getPos),
          code_block: (node) => createVisualCodeBlockNodeView(node),
          hardbreak: (node) => createVisualHardbreakNodeView(node),
        },
      },
    }),
);

let pendingCaretClick: { x: number; y: number } | null = null;

const caretClickSelection = $prose(
  () =>
    new Plugin({
      props: {
        handleDOMEvents: {
          mousedown: (_view, event) => {
            if (
              event.button !== 0 ||
              event.detail > 1 ||
              event.shiftKey ||
              event.ctrlKey ||
              event.metaKey ||
              event.altKey
            ) {
              pendingCaretClick = null;
              return false;
            }
            const target = event.target;
            if (
              target instanceof Element &&
              target.closest(
                "button, input, textarea, select, option, img, [contenteditable='false'], [data-type='wikilink'], .mk-code-copy, .mk-code-collapse, .ProseMirror-separator",
              )
            ) {
              pendingCaretClick = null;
              return false;
            }
            pendingCaretClick = { x: event.clientX, y: event.clientY };
            return false;
          },
          mouseup: (view, event) => {
            const pending = pendingCaretClick;
            pendingCaretClick = null;
            if (
              !pending ||
              event.button !== 0 ||
              event.detail > 1 ||
              event.shiftKey ||
              event.ctrlKey ||
              event.metaKey ||
              event.altKey
            ) {
              return false;
            }
            const target = event.target;
            if (
              target instanceof Element &&
              target.closest(
                "button, input, textarea, select, option, img, [contenteditable='false'], [data-type='wikilink'], .mk-code-copy, .mk-code-collapse, .ProseMirror-separator",
              )
            ) {
              return false;
            }
            if (
              Math.abs(pending.x - event.clientX) > 4 ||
              Math.abs(pending.y - event.clientY) > 4
            ) {
              return false;
            }
            const position = view.posAtCoords({ left: event.clientX, top: event.clientY });
            if (!position) return false;
            if (position.inside > -1 && view.state.doc.nodeAt(position.inside)?.isAtom) return false;
            const selection = TextSelection.near(view.state.doc.resolve(position.pos));
            if (!view.state.selection.eq(selection)) {
              view.dispatch(view.state.tr.setSelection(selection).scrollIntoView());
            }
            view.focus();
            event.preventDefault();
            return true;
          },
        },
      },
    }),
);

function cycleVisualCase(text: string): string {
  if (!text || !/[a-zA-Z\u00C0-\u024F]/.test(text)) return text;
  if (text === text.toUpperCase()) return text.toLowerCase();
  if (text === text.toLowerCase()) {
    return text.replace(/\S+/g, (word) => {
      const lower = word.toLowerCase();
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    });
  }
  return text.toUpperCase();
}

function replaceVisualSelection(view: EditorView, transform: (text: string) => string): boolean {
  const { from, to } = view.state.selection;
  if (from === to) return false;
  const selected = view.state.doc.textBetween(from, to, "\n", "\n");
  const replacement = transform(selected);
  view.dispatch(view.state.tr.insertText(replacement, from, to).scrollIntoView());
  view.focus();
  return true;
}

function clearVisualSelectionFormatting(view: EditorView): boolean {
  const { from, to } = view.state.selection;
  if (from === to) return false;

  let transaction = view.state.tr;
  for (const markType of Object.values(view.state.schema.marks)) {
    transaction = transaction.removeMark(from, to, markType);
  }
  transaction = transaction.setStoredMarks([]).scrollIntoView();
  view.dispatch(transaction);
  view.focus();
  return true;
}

function normalizeVisualTaskMarkdown(markdown: string): string {
  // remark-stringify 默认使用 `*`，项目既有 Markdown 写回契约统一使用 `-`。
  return markdown.replace(/^([ \t]*)\*([ \t]+)\[([ xX])\]([ \t]+)/gm, "$1-$2[$3]$4");
}

const tableKeyboard = $prose(
  () =>
    new Plugin({
      props: {
        handleKeyDown: (view, event) => {
          if (event.key !== "Tab") return false;

          const direction = event.shiftKey ? -1 : 1;
          if (goToNextCell(direction)(view.state, view.dispatch)) {
            event.preventDefault();
            return true;
          }

          if (!event.shiftKey && addRowAfter(view.state, view.dispatch)) {
            goToNextCell(1)(view.state, view.dispatch);
            event.preventDefault();
            return true;
          }

          return false;
        },
      },
    }),
);

export interface VisualEditorRuntime {
  loadMarkdown(markdown: string): void | Promise<void>;
  getMarkdown(): string;
  focus(): void;
  getSelection(): VisualEditorSelection;
  replaceSelection(text: string): void;
  findNext(query: string): boolean;
  replaceCurrent(text: string): boolean;
  replaceAll(query: string, replacement: string): number;
  executeCommand(command: VisualEditorCommand): boolean;
  undo(): boolean;
  redo(): boolean;
  subscribe(listener: (markdown: string) => void): () => void;
  destroy(): void;
}

export interface VisualEditorAdapterOptions {
  onWikilinkNavigate?: (target: string) => void;
}

export function createVisualEditorAdapter(runtime: VisualEditorRuntime): VisualEditorAdapter {
  let destroyed = false;

  return {
    async loadMarkdown(markdown) {
      if (destroyed) throw new Error("VisualEditorAdapter 已销毁");
      await runtime.loadMarkdown(markdown);
    },
    getMarkdown() {
      if (destroyed) throw new Error("VisualEditorAdapter 已销毁");
      return runtime.getMarkdown();
    },
    focus() {
      if (!destroyed) runtime.focus();
    },
    getSelection() {
      if (destroyed) return { from: 0, to: 0 };
      return runtime.getSelection();
    },
    replaceSelection(text) {
      if (!destroyed) runtime.replaceSelection(text);
    },
    findNext(query) {
      return !destroyed && runtime.findNext(query);
    },
    replaceCurrent(text) {
      return !destroyed && runtime.replaceCurrent(text);
    },
    replaceAll(query, replacement) {
      return destroyed ? 0 : runtime.replaceAll(query, replacement);
    },
    executeCommand(command) {
      return !destroyed && runtime.executeCommand(command);
    },
    undo() {
      return !destroyed && runtime.undo();
    },
    redo() {
      return !destroyed && runtime.redo();
    },
    subscribe(listener) {
      if (destroyed) return () => undefined;
      const unsubscribe = runtime.subscribe((markdown) => {
        if (!destroyed) listener(markdown);
      });
      return () => unsubscribe();
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      runtime.destroy();
    },
  };
}

export async function createMilkdownVisualEditorAdapter(
  root: HTMLElement,
  initialMarkdown = "",
  options: VisualEditorAdapterOptions = {},
): Promise<VisualEditorAdapter> {
  const listeners = new Set<(markdown: string) => void>();
  let currentMarkdown = initialMarkdown;
  let editor: Editor | null = null;

  const milkdown = Editor.make()
    .config((ctx) => {
      ctx.set(rootCtx, root);
      ctx.set(defaultValueCtx, initialMarkdown);
      ctx.update(remarkStringifyOptionsCtx, (options) => {
        const defaultHtmlHandler = options.handlers?.html;
        return {
          ...options,
          handlers: {
            ...options.handlers,
            html: (node, parent, state, info) => {
              if (node.isMark === true && (node.value === "<u>" || node.value === "==")) {
                const closing = node.value === "<u>" ? "</u>" : "==";
                const content = node.children?.length
                  ? state.containerPhrasing(node, {
                      ...info,
                      before: String(node.value),
                      after: closing,
                    })
                  : "";
                return `${node.value}${content}${closing}`;
              }
              return defaultHtmlHandler ? defaultHtmlHandler(node, parent, state, info) : String(node.value ?? "");
            },
          },
        };
      });
      ctx.get(listenerCtx).markdownUpdated((listenerContext) => {
        // Milkdown's delayed listener may still hold a transaction from the
        // previous tab. Publish the current document, never that stale payload.
        const view = listenerContext.get(editorViewCtx);
        const normalized = normalizeVisualTaskMarkdown(listenerContext.get(serializerCtx)(view.state.doc));
        if (normalized === currentMarkdown) return;
        currentMarkdown = normalized;
        for (const listener of listeners) listener(normalized);
      });
    })
    .use(wikilinkSchema)
    .use(wikilinkRemark)
    .use(visualUnderlineSchema)
    .use(visualHighlightSchema)
    .use(commonmark)
    .use(visualImageSchema)
    .use(localImageNodeView)
    .use(insertImageCommand)
    .use(toggleVisualUnderlineCommand)
    .use(toggleVisualHighlightCommand)
    .use(gfm)
    .use(visualInlineMarkupRemark)
    .use(listItemNodeView)
    .use(caretClickSelection)
    .use(headingCollapsePlugin)
    .use(tableKeyboard)
    .use(history)
    .use(clipboard)
    .use(listener);

  await milkdown.create();
  editor = milkdown;

  const activateWikilink = (event: MouseEvent | KeyboardEvent): void => {
    if (event instanceof KeyboardEvent && event.key !== "Enter" && event.key !== " ") return;
    const target = event.target;
    if (!(target instanceof Element)) return;
    const link = target.closest<HTMLElement>('[data-type="wikilink"]');
    if (!link || !root.contains(link)) return;
    const wikilinkTarget = link.getAttribute("data-wikilink-target")?.trim();
    if (!wikilinkTarget) return;
    event.preventDefault();
    options.onWikilinkNavigate?.(wikilinkTarget);
  };
  root.addEventListener("click", activateWikilink);
  root.addEventListener("keydown", activateWikilink);

  const runtime: VisualEditorRuntime = {
    loadMarkdown(markdown) {
      if (markdown === currentMarkdown) return;
      editor?.action((ctx) => {
        const view = ctx.get(editorViewCtx);
        const doc = ctx.get(parserCtx)(markdown);
        const state = EditorState.create({
          schema: view.state.schema,
          doc,
          plugins: view.state.plugins,
        });
        view.updateState(state);
        currentMarkdown = normalizeVisualTaskMarkdown(markdown);
      });
      currentMarkdown = normalizeVisualTaskMarkdown(markdown);
    },
    getMarkdown() {
      if (!editor) return "";
      return editor.action((ctx) => {
        const view = ctx.get(editorViewCtx);
        return normalizeVisualTaskMarkdown(ctx.get(serializerCtx)(view.state.doc));
      });
    },
    focus() {
      editor?.action((ctx) => ctx.get(editorViewCtx).focus());
    },
    getSelection() {
      if (!editor) return { from: 0, to: 0 };
      return editor.action((ctx) => {
        const { from, to } = ctx.get(editorViewCtx).state.selection;
        return { from, to };
      });
    },
    replaceSelection(text) {
      editor?.action((ctx) => {
        const view = ctx.get(editorViewCtx);
        view.dispatch(view.state.tr.insertText(text).scrollIntoView());
        view.focus();
      });
    },
    findNext(query) {
      if (!editor || !query) return false;
      return editor.action((ctx) => {
        const view = ctx.get(editorViewCtx);
        const textNodes: VisualTextNode[] = [];
        view.state.doc.nodesBetween(0, view.state.doc.content.size, (node, pos) => {
          if (node.isText && node.text) textNodes.push({ from: pos, text: node.text });
        });
        const ranges = findVisualTextRanges(textNodes, query);
        const next = selectNextVisualRange(ranges, view.state.selection);
        if (!next) return false;
        view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, next.from, next.to)).scrollIntoView());
        view.focus();
        return true;
      });
    },
    replaceCurrent(text) {
      if (!editor) return false;
      return editor.action((ctx) => {
        const view = ctx.get(editorViewCtx);
        if (view.state.selection.empty) return false;
        view.dispatch(view.state.tr.insertText(text).scrollIntoView());
        view.focus();
        return true;
      });
    },
    replaceAll(query, replacement) {
      if (!editor || !query) return 0;
      return editor.action((ctx) => {
        const view = ctx.get(editorViewCtx);
        const textNodes: VisualTextNode[] = [];
        view.state.doc.nodesBetween(0, view.state.doc.content.size, (node, pos) => {
          if (node.isText && node.text) textNodes.push({ from: pos, text: node.text });
        });
        const ranges = findVisualTextRanges(textNodes, query);
        if (ranges.length === 0) return 0;
        let transaction = view.state.tr;
        for (const range of [...ranges].reverse()) {
          transaction = transaction.insertText(replacement, range.from, range.to);
        }
        view.dispatch(transaction.scrollIntoView());
        view.focus();
        return ranges.length;
      });
    },
      executeCommand(command) {
        if (!editor) return false;
        return editor.action((ctx) => {
          const commands = ctx.get(commandsCtx);
          const view = ctx.get(editorViewCtx);
          if (typeof command === "object" && command.type === "insert-image") {
            return commands.call(insertImageCommand.key, command.image);
          }
          switch (command) {
            case "bold":
              return commands.call(toggleStrongCommand.key);
            case "italic":
              return commands.call(toggleEmphasisCommand.key);
            case "strikethrough":
              return commands.call(toggleStrikethroughCommand.key);
            case "underline":
              return commands.call(toggleVisualUnderlineCommand.key);
            case "highlight":
              return commands.call(toggleVisualHighlightCommand.key);
            case "heading-1":
              return commands.call(wrapInHeadingCommand.key, 1);
            case "heading-2":
              return commands.call(wrapInHeadingCommand.key, 2);
            case "heading-3":
              return commands.call(wrapInHeadingCommand.key, 3);
            case "bullet-list":
              return commands.call(wrapInBulletListCommand.key);
            case "ordered-list":
              return commands.call(wrapInOrderedListCommand.key);
            case "blockquote":
              return commands.call(wrapInBlockquoteCommand.key);
            case "inline-code":
              return commands.call(toggleInlineCodeCommand.key);
            case "code-block":
              return commands.call(createCodeBlockCommand.key);
            case "task": {
              if (!view.state.selection.empty) {
                const tr = selectedLinesToTasks(view.state);
                if (tr.docChanged) view.dispatch(tr.scrollIntoView());
                return true;
              }
              if (!getCurrentListItem(view) && !commands.call(wrapInBulletListCommand.key)) return false;
              return setCurrentTaskState(view, false);
            }
            case "task-done": {
              const current = getCurrentListItem(view);
              if (current?.node.attrs.checked !== null && current?.node.attrs.checked !== undefined) {
                return setCurrentTaskState(view, current.node.attrs.checked !== true);
              }
              if (!current && !commands.call(wrapInBulletListCommand.key)) return false;
              return setCurrentTaskState(view, true);
            }
            case "indent":
              return commands.call(sinkListItemCommand.key);
            case "outdent":
              return commands.call(liftListItemCommand.key);
            case "case-transform":
              return replaceVisualSelection(view, cycleVisualCase);
            case "clear-format":
              return clearVisualSelectionFormatting(view);
            case "link":
              if (view.state.selection.empty) return false;
              return commands.call(toggleLinkCommand.key, { href: "https://" });
            case "insert-divider":
              return commands.call(insertHrCommand.key);
            case "insert-table":
              return commands.call(insertTableCommand.key, { row: 2, col: 2 });
            case "add-table-row":
              return commands.call(addRowAfterCommand.key);
            case "add-table-column":
              return commands.call(addColAfterCommand.key);
            case "delete-table-row": {
              if (!isInTable(view.state)) return false;
              const rowIndex = selectedRect(view.state).top;
              commands.call(selectRowCommand.key, { index: rowIndex });
              return commands.call(deleteSelectedCellsCommand.key);
            }
            case "delete-table-column": {
              if (!isInTable(view.state)) return false;
              const columnIndex = selectedRect(view.state).left;
              commands.call(selectColCommand.key, { index: columnIndex });
              return commands.call(deleteSelectedCellsCommand.key);
          }
          case "align-table-left":
            return commands.call(setAlignCommand.key, "left");
          case "align-table-center":
            return commands.call(setAlignCommand.key, "center");
            case "align-table-right":
              return commands.call(setAlignCommand.key, "right");
            default:
              return false;
          }
        }) ?? false;
      },
    undo() {
      return editor?.action((ctx) => ctx.get(commandsCtx).call(undoCommand.key)) ?? false;
    },
    redo() {
      return editor?.action((ctx) => ctx.get(commandsCtx).call(redoCommand.key)) ?? false;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    destroy() {
      listeners.clear();
      root.removeEventListener("click", activateWikilink);
      root.removeEventListener("keydown", activateWikilink);
      const currentEditor = editor;
      editor = null;
      if (currentEditor) void currentEditor.destroy();
    },
  };

  return createVisualEditorAdapter(runtime);
}
