import assert from "node:assert/strict";
import test from "node:test";

const {
  RAW_HTML_COMMENT_NODE_TYPE,
  isHtmlComment,
  transformRootHtmlComments,
} = await import("../src/rawHtmlComment.ts");

test("root HTML comments become raw block nodes without changing their source", () => {
  const tree = {
    type: "root",
    children: [
      { type: "html", value: "<!-- visual-editor-benchmark-0000 -->" },
      { type: "html", value: "<span>keep as inline HTML</span>" },
    ],
  };

  const transformed = transformRootHtmlComments(tree);

  assert.equal(transformed.children[0].type, RAW_HTML_COMMENT_NODE_TYPE);
  assert.equal(
    transformed.children[0].value,
    "<!-- visual-editor-benchmark-0000 -->",
  );
  assert.equal(transformed.children[1].type, "html");
});

test("only complete HTML comments are classified as raw comments", () => {
  assert.equal(isHtmlComment("<!-- comment -->"), true);
  assert.equal(isHtmlComment("<!-- multiline\ncomment -->"), true);
  assert.equal(isHtmlComment("<span>not a comment</span>"), false);
  assert.equal(isHtmlComment("<!-- unfinished"), false);
});

test("nested HTML comments remain in their parent until a block policy exists", () => {
  const tree = {
    type: "root",
    children: [
      {
        type: "blockquote",
        children: [{ type: "html", value: "<!-- nested comment -->" }],
      },
    ],
  };

  const transformed = transformRootHtmlComments(tree);

  assert.equal(transformed.children[0].children[0].type, "html");
});
