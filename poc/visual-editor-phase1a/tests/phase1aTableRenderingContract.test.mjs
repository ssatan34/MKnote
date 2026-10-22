import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const pocRoot = path.resolve(import.meta.dirname, "..");

test("large table rendering keeps offscreen tables out of the active layout", () => {
  const style = fs.readFileSync(path.join(pocRoot, "src/style.css"), "utf8");

  assert.match(style, /\.ProseMirror table\s*\{[^}]*content-visibility:\s*auto/s);
  assert.match(style, /\.ProseMirror table\s*\{[^}]*contain-intrinsic-size:\s*[^;}]+/s);
  assert.match(style, /\.ProseMirror table\s*\{[^}]*contain:\s*layout paint style/s);
  assert.match(style, /\.ProseMirror\s*>\s*p\s*\{[^}]*content-visibility:\s*auto/s);
});
