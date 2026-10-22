import type { Node as MarkdownNode } from "@milkdown/transformer";
import { $nodeSchema, $remark } from "@milkdown/kit/utils";
import type { Root } from "mdast";

export const RAW_HTML_COMMENT_NODE_TYPE = "rawHtmlComment";

const HTML_COMMENT_PATTERN = /^<!--[\s\S]*-->$/;

type CommentMarkdownNode = MarkdownNode & {
  children?: CommentMarkdownNode[];
  type: string;
  value?: unknown;
};

export function isHtmlComment(value: string): boolean {
  return HTML_COMMENT_PATTERN.test(value.trim());
}

/**
 * 顶层注释不能继续落入空 paragraph，否则 ProseMirror 会为光标插入额外
 * separator img。把它保留为 block 原子节点，既不展示原文，也不丢失序列化值。
 */
export function transformRootHtmlComments<T extends CommentMarkdownNode>(
  tree: T,
): T {
  if (tree.type !== "root" || !tree.children) return tree;

  tree.children = tree.children.map((child) => {
    if (
      child.type === "html" &&
      typeof child.value === "string" &&
      isHtmlComment(child.value)
    ) {
      return { ...child, type: RAW_HTML_COMMENT_NODE_TYPE };
    }
    return child;
  });

  return tree;
}

export const rawHtmlCommentRemark = $remark(
  "rawHtmlCommentRemark",
  () => () => {
    return (tree: Root): void => {
      transformRootHtmlComments(tree as CommentMarkdownNode);
    };
  },
);

export const rawHtmlCommentSchema = $nodeSchema(
  RAW_HTML_COMMENT_NODE_TYPE,
  () => ({
    group: "block",
    atom: true,
    selectable: false,
    attrs: {
      value: {
        default: "",
        validate: "string",
      },
    },
    toDOM: (node) => [
      "div",
      {
        "aria-hidden": "true",
        "data-type": RAW_HTML_COMMENT_NODE_TYPE,
        "data-value": node.attrs.value,
        style: "display: none",
      },
    ],
    parseDOM: [
      {
        tag: `div[data-type="${RAW_HTML_COMMENT_NODE_TYPE}"]`,
        getAttrs: (dom) => ({
          value: dom.getAttribute("data-value") ?? "",
        }),
      },
    ],
    parseMarkdown: {
      match: ({ type }) => type === RAW_HTML_COMMENT_NODE_TYPE,
      runner: (state, node, type) => {
        state.addNode(type, {
          value: typeof node.value === "string" ? node.value : "",
        });
      },
    },
    toMarkdown: {
      match: (node) => node.type.name === RAW_HTML_COMMENT_NODE_TYPE,
      runner: (state, node) => {
        state.addNode("html", undefined, node.attrs.value);
      },
    },
  }),
);
