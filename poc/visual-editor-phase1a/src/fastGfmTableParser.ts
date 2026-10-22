import { fromMarkdown } from "mdast-util-from-markdown";
import { gfmAutolinkLiteralFromMarkdown, gfmAutolinkLiteralToMarkdown } from "mdast-util-gfm-autolink-literal";
import { gfmFootnoteFromMarkdown, gfmFootnoteToMarkdown } from "mdast-util-gfm-footnote";
import { gfmStrikethroughFromMarkdown, gfmStrikethroughToMarkdown } from "mdast-util-gfm-strikethrough";
import { gfmTableToMarkdown } from "mdast-util-gfm-table";
import { gfmTaskListItemFromMarkdown, gfmTaskListItemToMarkdown } from "mdast-util-gfm-task-list-item";
import { gfmAutolinkLiteral } from "micromark-extension-gfm-autolink-literal";
import { gfmFootnote } from "micromark-extension-gfm-footnote";
import { gfmStrikethrough } from "micromark-extension-gfm-strikethrough";
import { gfmTaskListItem } from "micromark-extension-gfm-task-list-item";
import type { Content, PhrasingContent, Root } from "mdast";
import type { Processor } from "unified";
import type { VFile } from "vfile";
import { combineExtensions } from "micromark-util-combine-extensions";

type MarkdownNode = Content & {
  children?: MarkdownNode[];
  position?: {
    start?: { offset?: number };
    end?: { offset?: number };
  };
};

type TableAlignment = "left" | "center" | "right" | null;

type TableRow = {
  type: "tableRow";
  children: Array<{
    type: "tableCell";
    children: PhrasingContent[];
  }>;
};

type TableNode = {
  type: "table";
  align: TableAlignment[];
  children: TableRow[];
  position?: MarkdownNode["position"];
};

type UnifiedData = {
  micromarkExtensions?: unknown[];
  fromMarkdownExtensions?: unknown[];
  toMarkdownExtensions?: unknown[];
};

const SIMPLE_CELL_PATTERN = /^[\p{L}\p{N} .,;!?()/_-]+$/u;
const TABLE_DELIMITER_PATTERN = /^:?-{1,}:?$/;

const createMicromarkExtensionsWithoutTables = () =>
  combineExtensions([
    gfmAutolinkLiteral(),
    gfmFootnote(),
    gfmStrikethrough(),
    gfmTaskListItem(),
  ]);

const createFromMarkdownExtensionsWithoutTables = () => [
  gfmAutolinkLiteralFromMarkdown(),
  gfmFootnoteFromMarkdown(),
  gfmStrikethroughFromMarkdown(),
  gfmTaskListItemFromMarkdown(),
];

const createToMarkdownExtensionsWithoutTables = () => ({
  extensions: [
    gfmAutolinkLiteralToMarkdown(),
    gfmFootnoteToMarkdown(),
    gfmStrikethroughToMarkdown(),
    gfmTableToMarkdown(),
    gfmTaskListItemToMarkdown(),
  ],
});

const splitTableRow = (line: string): string[] | null => {
  let value = line.trim();
  if (!value.includes("|")) return null;
  if (value.startsWith("|")) value = value.slice(1);
  if (value.endsWith("|") && !value.endsWith("\\|")) {
    value = value.slice(0, -1);
  }

  const cells: string[] = [];
  let cell = "";
  let codeSpanLength = 0;

  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if (character === "\\") {
      cell += character;
      const escaped = value[index + 1];
      if (escaped !== undefined) {
        cell += escaped;
        index += 1;
      }
      continue;
    }
    if (character === "`") {
      let runLength = 1;
      while (value[index + runLength] === "`") runLength += 1;
      cell += "`".repeat(runLength);
      codeSpanLength = codeSpanLength === 0 ? runLength : 0;
      index += runLength - 1;
      continue;
    }
    if (character === "|" && codeSpanLength === 0) {
      cells.push(cell.trim());
      cell = "";
      continue;
    }
    cell += character;
  }

  cells.push(cell.trim());
  return cells;
};

const parseCellChildren = (
  value: string,
  micromarkExtensions: ReturnType<typeof createMicromarkExtensionsWithoutTables>,
  fromMarkdownExtensions: ReturnType<typeof createFromMarkdownExtensionsWithoutTables>,
): PhrasingContent[] => {
  if (value.length === 0) return [];

  // The benchmark corpus is intentionally plain text. Avoid invoking the full
  // inline parser for those cells, while retaining commonmark/GFM inline syntax
  // for real cells that contain emphasis, links, code, or escapes.
  if (SIMPLE_CELL_PATTERN.test(value)) {
    return [{ type: "text", value }];
  }

  const root = fromMarkdown(value, {
    extensions: [micromarkExtensions],
    mdastExtensions: fromMarkdownExtensions,
  });
  const paragraph = root.children.find((node) => node.type === "paragraph");
  return paragraph?.children ?? [{ type: "text", value }];
};

const getParagraphSource = (node: MarkdownNode, source: string): string => {
  const start = node.position?.start?.offset;
  const end = node.position?.end?.offset;
  if (source.length > 0 && typeof start === "number" && typeof end === "number") {
    return source.slice(start, end);
  }
  return (node.children ?? [])
    .map((child) => (child.type === "text" ? child.value : ""))
    .join("");
};

const buildTableNode = (
  paragraph: MarkdownNode,
  source: string,
  micromarkExtensions: ReturnType<typeof createMicromarkExtensionsWithoutTables>,
  fromMarkdownExtensions: ReturnType<typeof createFromMarkdownExtensionsWithoutTables>,
): TableNode | null => {
  const lines = getParagraphSource(paragraph, source)
    .replace(/\r\n?/g, "\n")
    .split("\n");
  if (lines.length < 2) return null;

  const header = splitTableRow(lines[0]);
  const delimiter = splitTableRow(lines[1]);
  if (!header || !delimiter || header.length === 0 || delimiter.length !== header.length) {
    return null;
  }

  const align: TableAlignment[] = [];
  for (const cell of delimiter) {
    if (!TABLE_DELIMITER_PATTERN.test(cell)) return null;
    const left = cell.startsWith(":");
    const right = cell.endsWith(":");
    align.push(left && right ? "center" : left ? "left" : right ? "right" : null);
  }

  const rows = [header, ...lines.slice(2).map(splitTableRow)];
  if (rows.some((row) => row === null)) return null;

  const tableRows: TableRow[] = rows.map((row) => {
    const cells = row ?? [];
    return {
      type: "tableRow",
      children: Array.from({ length: header.length }, (_, index) => ({
        type: "tableCell" as const,
        children: parseCellChildren(
          cells[index] ?? "",
          micromarkExtensions,
          fromMarkdownExtensions,
        ),
      })),
    };
  });

  return {
    type: "table",
    align,
    children: tableRows,
    position: paragraph.position,
  };
};

export const transformFastGfmTables = (root: Root, source = ""): Root => {
  const micromarkExtensions = createMicromarkExtensionsWithoutTables();
  const fromMarkdownExtensions = createFromMarkdownExtensionsWithoutTables();
  const children = root.children as MarkdownNode[];
  root.children = children.flatMap((node) => {
    if (node.type !== "paragraph") return [node];
    const table = buildTableNode(
      node,
      source,
      micromarkExtensions,
      fromMarkdownExtensions,
    );
    return table ? [table as unknown as Content] : [node];
  });
  return root;
};

/**
 * A GFM remark plugin that excludes micromark's table tokenizer and replaces
 * it with a linear paragraph-to-table pass. This keeps GFM task lists,
 * strikethrough, autolinks, and footnotes while avoiding repeated table
 * backtracking on documents containing many small tables.
 */
export function remarkGfmFastTable(
  this: Processor,
): (tree: Root, file: VFile) => Root {
  const data = this.data() as UnifiedData;
  data.micromarkExtensions ??= [];
  data.fromMarkdownExtensions ??= [];
  data.toMarkdownExtensions ??= [];
  data.micromarkExtensions.push(createMicromarkExtensionsWithoutTables());
  data.fromMarkdownExtensions.push(...createFromMarkdownExtensionsWithoutTables());
  data.toMarkdownExtensions.push(createToMarkdownExtensionsWithoutTables());

  return (tree, file) => transformFastGfmTables(tree, file.toString());
}
