import type { Node } from "@milkdown/kit/prose/model";
import { Plugin } from "@milkdown/kit/prose/state";
import type { EditorState, Transaction } from "@milkdown/kit/prose/state";
import { $prose } from "@milkdown/kit/utils";

const TABLE_NODE_NAME = "table";
const TABLE_CELL_NODE_NAME = "table_cell";
const TABLE_ROW_NODE_NAME = "table_row";
const TABLE_HEADER_ROW_NODE_NAME = "table_header_row";
const TABLE_HEADER_ROW_NAMES = new Set([
  TABLE_ROW_NODE_NAME,
  TABLE_HEADER_ROW_NODE_NAME,
]);

const clampDocumentPosition = (state: EditorState, position: number): number =>
  Math.max(0, Math.min(position, state.doc.content.size));

const addTableAtPosition = (
  state: EditorState,
  position: number,
  tablePositions: Set<number>,
): void => {
  const resolved = state.doc.resolve(clampDocumentPosition(state, position));
  for (let depth = resolved.depth; depth > 0; depth -= 1) {
    if (resolved.node(depth).type.name !== TABLE_NODE_NAME) continue;
    tablePositions.add(resolved.before(depth));
    return;
  }
};

const mapToFinalDocumentPosition = (
  transactions: readonly Transaction[],
  transactionIndex: number,
  position: number,
): number => {
  let mappedPosition = position;
  for (
    let index = transactionIndex + 1;
    index < transactions.length;
    index += 1
  ) {
    mappedPosition = transactions[index]?.mapping.map(mappedPosition) ?? mappedPosition;
  }
  return mappedPosition;
};

/**
 * Finds only tables intersected by document-changing transaction ranges.
 * The GFM preset's alignment plugin scans every descendant after every edit;
 * this helper keeps the diagnostic replacement bounded to touched tables.
 */
export const collectChangedTablePositions = (
  transactions: readonly Transaction[],
  state: EditorState,
): ReadonlySet<number> => {
  const tablePositions = new Set<number>();

  transactions.forEach((transaction, transactionIndex) => {
    if (!transaction.docChanged) return;

    transaction.mapping.maps.forEach((stepMap) => {
      stepMap.forEach((_oldStart, _oldEnd, newStart, newEnd) => {
        const mappedStart = mapToFinalDocumentPosition(
          transactions,
          transactionIndex,
          newStart,
        );
        const mappedEnd = mapToFinalDocumentPosition(
          transactions,
          transactionIndex,
          newEnd,
        );

        for (const position of [
          mappedStart,
          mappedEnd,
          mappedStart + 1,
          mappedEnd - 1,
        ]) {
          addTableAtPosition(state, position, tablePositions);
        }
      });
    });
  });

  return tablePositions;
};

const getHeaderCell = (headerRow: Node, index: number): Node | null =>
  headerRow.maybeChild(index);

/**
 * Copies header alignment to body cells in the affected tables only.
 * Returning null for a clean table keeps ProseMirror from appending an empty
 * transaction, which is important for large documents with ordinary typing.
 */
export const alignChangedTableCells = (
  state: EditorState,
  tablePositions: ReadonlySet<number>,
): Transaction | null => {
  let transaction: Transaction | null = null;

  for (const tablePosition of tablePositions) {
    const table = state.doc.nodeAt(tablePosition);
    if (!table || table.type.name !== TABLE_NODE_NAME) continue;

    const headerRow = table.firstChild;
    if (!headerRow || !TABLE_HEADER_ROW_NAMES.has(headerRow.type.name)) continue;

    table.descendants((node, relativePosition, parent, index) => {
      if (
        node.type.name !== TABLE_CELL_NODE_NAME ||
        !parent ||
        parent.type.name !== TABLE_ROW_NODE_NAME
      ) {
        return;
      }

      const headerCell = getHeaderCell(headerRow, index);
      if (!headerCell || headerCell.attrs.alignment === node.attrs.alignment) {
        return;
      }

      transaction ??= state.tr;
      transaction.setNodeMarkup(tablePosition + 1 + relativePosition, undefined, {
        ...node.attrs,
        alignment: headerCell.attrs.alignment,
      });
    });
  }

  return transaction;
};

export const incrementalTableAlignPlugin = $prose(
  () =>
    new Plugin({
      appendTransaction: (transactions, _oldState, state) => {
        const tablePositions = collectChangedTablePositions(transactions, state);
        return alignChangedTableCells(state, tablePositions);
      },
    }),
);
