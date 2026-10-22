import assert from "node:assert/strict";
import test from "node:test";
import { Schema } from "@milkdown/kit/prose/model";
import { EditorState, Plugin, TextSelection } from "@milkdown/kit/prose/state";
import { setCellAttr } from "@milkdown/kit/prose/tables";

const { alignChangedTableCells, collectChangedTablePositions } =
  await import("../src/tableAlignmentRuntime.ts");

const schema = new Schema({
  nodes: {
    doc: { content: "block+" },
    paragraph: { content: "inline*", group: "block" },
    text: { group: "inline" },
      table: {
        content: "table_header_row table_row+",
        group: "block",
        tableRole: "table",
      },
      table_header_row: {
        content: "table_header+",
        tableRole: "row",
      },
      table_row: {
        content: "(table_header | table_cell)+",
        tableRole: "row",
      },
      table_header: {
        content: "block+",
        attrs: { alignment: { default: null } },
        tableRole: "header_cell",
      },
      table_cell: {
        content: "block+",
        attrs: { alignment: { default: null } },
        tableRole: "cell",
      },
  },
});

const paragraph = (text) =>
  schema.nodes.paragraph.create(null, text ? schema.text(text) : null);

const makeDocument = () =>
  schema.nodes.doc.create(null, [
    paragraph("outside"),
    schema.nodes.table.create(null, [
      schema.nodes.table_header_row.create(null, [
        schema.nodes.table_header.create(
          { alignment: "center" },
          paragraph("header"),
        ),
        schema.nodes.table_header.create(
          { alignment: "right" },
          paragraph("value"),
        ),
      ]),
      schema.nodes.table_row.create(null, [
        schema.nodes.table_cell.create(
          { alignment: null },
          paragraph("body"),
        ),
        schema.nodes.table_cell.create(
          { alignment: "left" },
          paragraph("body 2"),
        ),
      ]),
    ]),
    paragraph("after"),
  ]);

const findNodePosition = (doc, nodeName, occurrence = 0) => {
  let found = null;
  let seen = 0;
  doc.descendants((node, pos) => {
    if (node.type.name !== nodeName) return;
    if (seen === occurrence) found = pos;
    seen += 1;
  });
  assert.notEqual(found, null, `missing ${nodeName} ${occurrence}`);
  return found;
};

test("changed table positions include a touched cell but skip an unrelated paragraph", () => {
  const state = EditorState.create({ doc: makeDocument() });
  const bodyCellPos = findNodePosition(state.doc, "table_cell");
  const tablePos = findNodePosition(state.doc, "table");

  const tableEdit = state.tr.insertText("!", bodyCellPos + 3);
  const tableState = state.apply(tableEdit);
  assert.deepEqual(
    [...collectChangedTablePositions([tableEdit], tableState)],
    [tablePos],
  );

  const outsideEdit = state.tr.insertText("!", 2);
  const outsideState = state.apply(outsideEdit);
  assert.deepEqual(
    [...collectChangedTablePositions([outsideEdit], outsideState)],
    [],
  );
});

test("alignment repair only changes body cells in the affected table", () => {
  const state = EditorState.create({ doc: makeDocument() });
  const bodyCellPos = findNodePosition(state.doc, "table_cell");
  const tablePos = findNodePosition(state.doc, "table");
  const edit = state.tr.insertText("!", bodyCellPos + 3);
  const nextState = state.apply(edit);

  const repair = alignChangedTableCells(
    nextState,
    collectChangedTablePositions([edit], nextState),
  );
  assert.ok(repair, "a mismatched body alignment should produce a repair transaction");

  const repaired = nextState.apply(repair);
  const bodyCells = [];
  repaired.doc.descendants((node) => {
    if (node.type.name === "table_cell") bodyCells.push(node);
  });
  assert.deepEqual(
    bodyCells.map((node) => node.attrs.alignment),
    ["center", "right"],
  );
  assert.equal(repaired.doc.nodeAt(tablePos)?.type.name, "table");
});

test("header alignment changes are propagated to body cells in the same table", () => {
  const state = EditorState.create({ doc: makeDocument() });
  const headerCellPos = findNodePosition(state.doc, "table_header");
  const headerCell = state.doc.nodeAt(headerCellPos);
  const edit = state.tr.setNodeMarkup(headerCellPos, undefined, {
    ...headerCell.attrs,
    alignment: "right",
  });
  const nextState = state.apply(edit);
  const repair = alignChangedTableCells(
    nextState,
    collectChangedTablePositions([edit], nextState),
  );

  assert.ok(repair, "a changed header alignment should produce a repair transaction");
  const repaired = nextState.apply(repair);
  const bodyCells = [];
  repaired.doc.descendants((node) => {
    if (node.type.name === "table_cell") bodyCells.push(node);
  });
  assert.deepEqual(
    bodyCells.map((node) => node.attrs.alignment),
    ["right", "right"],
  );
});

test("setAlign command transactions identify the touched table", () => {
  const doc = makeDocument();
  const state = EditorState.create({
    doc,
    selection: TextSelection.create(
      doc,
      findNodePosition(doc, "table_header") + 2,
    ),
  });
  assert.equal(state.selection.$from.node(2).type.spec.tableRole, "row");
  const tablePosition = findNodePosition(state.doc, "table");
  let dispatched = null;
  const handled = setCellAttr("alignment", "right")(state, (transaction) => {
    dispatched = transaction;
  });

  assert.equal(handled, true);
  assert.ok(dispatched, "setAlign must dispatch a document transaction");
  const nextState = state.apply(dispatched);
  assert.deepEqual(
    [...collectChangedTablePositions([dispatched], nextState)],
    [tablePosition],
  );
  const repair = alignChangedTableCells(
    nextState,
    collectChangedTablePositions([dispatched], nextState),
  );
  assert.ok(repair, "setAlign must produce an incremental alignment repair");
});

test("incremental alignment plugin applies a setAlign transaction", () => {
  const doc = makeDocument();
  const alignmentPlugin = new Plugin({
    appendTransaction: (transactions, _oldState, state) =>
      alignChangedTableCells(
        state,
        collectChangedTablePositions(transactions, state),
      ),
  });
  const state = EditorState.create({
    doc,
    selection: TextSelection.create(
      doc,
      findNodePosition(doc, "table_header") + 2,
    ),
    plugins: [alignmentPlugin],
  });
  let dispatched = null;
  assert.equal(
    setCellAttr("alignment", "left")(state, (transaction) => {
      dispatched = transaction;
    }),
    true,
  );
  const applied = state.applyTransaction(dispatched).state;
  const bodyCells = [];
  applied.doc.descendants((node) => {
    if (node.type.name === "table_cell") bodyCells.push(node);
  });
  assert.deepEqual(
    bodyCells.map((node) => node.attrs.alignment),
    ["left", "right"],
  );
});

test("an inserted table row is included in alignment repair", () => {
  const state = EditorState.create({ doc: makeDocument() });
  const tablePos = findNodePosition(state.doc, "table");
  const table = state.doc.nodeAt(tablePos);
  const insertedRow = schema.nodes.table_row.create(null, [
    schema.nodes.table_cell.create({ alignment: null }, paragraph("new")),
    schema.nodes.table_cell.create({ alignment: "left" }, paragraph("row")),
  ]);
  const edit = state.tr.insert(tablePos + table.nodeSize - 1, insertedRow);
  const nextState = state.apply(edit);
  const changedTables = collectChangedTablePositions([edit], nextState);
  const repair = alignChangedTableCells(nextState, changedTables);

  assert.deepEqual([...changedTables], [tablePos]);
  assert.ok(repair, "a newly inserted row should be aligned from the header");
  const repaired = nextState.apply(repair);
  const bodyCells = [];
  repaired.doc.descendants((node) => {
    if (node.type.name === "table_cell") bodyCells.push(node);
  });
  assert.deepEqual(
    bodyCells.map((node) => node.attrs.alignment),
    ["center", "right", "center", "right"],
  );
});

test("alignment repair returns no transaction for a clean table or a selection-only transaction", () => {
  const state = EditorState.create({ doc: makeDocument() });
  const tablePos = findNodePosition(state.doc, "table");
  const bodyCellPos = findNodePosition(state.doc, "table_cell");
  const edit = state.tr.insertText("!", bodyCellPos + 3);
  const nextState = state.apply(edit);
  const repair = alignChangedTableCells(
    nextState,
    collectChangedTablePositions([edit], nextState),
  );
  assert.ok(repair);
  const cleanState = nextState.apply(repair);
  assert.equal(alignChangedTableCells(cleanState, new Set([tablePos])), null);

  const selectionOnly = cleanState.tr.setSelection(cleanState.selection);
  const selectionState = cleanState.apply(selectionOnly);
  assert.deepEqual(
    [...collectChangedTablePositions([selectionOnly], selectionState)],
    [],
  );
});
