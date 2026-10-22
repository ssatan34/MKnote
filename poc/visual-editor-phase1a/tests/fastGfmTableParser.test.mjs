import assert from "node:assert/strict";
import test from "node:test";
import { remark } from "remark";
import remarkParse from "remark-parse";
import remarkStringify from "remark-stringify";
import { buildBenchmarkMarkdown } from "../src/benchmarkMode.ts";

const { remarkGfmFastTable } = await import("../src/fastGfmTableParser.ts");

function parse(markdown) {
  const processor = remark()
    .use(remarkParse)
    .use(remarkGfmFastTable);
  const tree = processor.parse(markdown);
  return { processor, tree: processor.runSync(tree, markdown) };
}

test("fast GFM table parser preserves alignment and inline cell syntax", () => {
  const { tree } = parse(
    [
      "| Name | Notes | Cost |",
      "| --- | :---: | ---: |",
      "| **A** | `a\\|b` | 1 |",
    ].join("\n"),
  );

  assert.equal(tree.children[0].type, "table");
  assert.deepEqual(tree.children[0].align, [null, "center", "right"]);
  assert.equal(tree.children[0].children.length, 2);
  assert.equal(tree.children[0].children[1].children[0].children[0].type, "strong");
  assert.equal(tree.children[0].children[1].children[1].children[0].type, "inlineCode");
});

test("fast GFM table parser keeps other GFM constructs enabled", () => {
  const { tree } = parse("- [x] done\n- ~~obsolete~~");
  const [list] = tree.children;

  assert.equal(list.type, "list");
  assert.equal(list.children[0].checked, true);
  assert.equal(list.children[1].children[0].children[0].type, "delete");
});

test("invalid delimiter rows remain ordinary Markdown", () => {
  const { tree } = parse("| one | two |\n| nope | nope |\n| three | four |");

  assert.equal(tree.children[0].type, "paragraph");
});

test("fast GFM tables round-trip through remark serialization", () => {
  const processor = remark()
    .use(remarkParse)
    .use(remarkGfmFastTable)
    .use(remarkStringify);
  const markdown = "| A | B |\n| --- | --- |\n| 1 | 2 |";
  const tree = processor.runSync(processor.parse(markdown));

  assert.match(processor.stringify(tree), /\| A \| B \|/);
  assert.match(processor.stringify(tree), /\| -+ \| -+ \|/);
});

test("fast GFM table parser handles the official 100 KiB fixture", () => {
  const { tree } = parse(buildBenchmarkMarkdown(102400, "table"));
  const tables = tree.children.filter((node) => node.type === "table");

  assert.equal(tables.length, 1024);
  assert.equal(
    tables.reduce((count, table) => count + table.children.length, 0),
    2048,
  );
});
