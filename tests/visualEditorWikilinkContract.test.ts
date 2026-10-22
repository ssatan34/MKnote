import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import {
  formatVisualWikilink,
  parseVisualWikilink,
  splitVisualWikilinkText,
} from "../src/visual-editor/visualEditorWikilink.ts";

const repositoryRoot = process.cwd();

test("Wikilink parser preserves target, alias, and original Markdown source", () => {
  const parsed = parseVisualWikilink("[[项目计划|计划别名]]");
  assert.deepEqual(parsed, {
    target: "项目计划",
    alias: "计划别名",
    source: "[[项目计划|计划别名]]",
  });
  assert.equal(formatVisualWikilink(parsed!), "[[项目计划|计划别名]]");
  assert.equal(parseVisualWikilink("[[项目计划]]")?.alias, "");
  assert.equal(parseVisualWikilink("[[|空目标]]"), null);
});

test("Wikilink text splitting leaves ordinary text and invalid syntax unchanged", () => {
  assert.deepEqual(splitVisualWikilinkText("参见 [[项目计划]]，以及 [[项目计划|计划别名]]。"), [
    { kind: "text", value: "参见 " },
    {
      kind: "wikilink",
      link: { target: "项目计划", alias: "", source: "[[项目计划]]" },
    },
    { kind: "text", value: "，以及 " },
    {
      kind: "wikilink",
      link: { target: "项目计划", alias: "计划别名", source: "[[项目计划|计划别名]]" },
    },
    { kind: "text", value: "。" },
  ]);
  assert.deepEqual(splitVisualWikilinkText("未闭合 [[项目计划"), [
    { kind: "text", value: "未闭合 [[项目计划" },
  ]);
});

test("visual Beta owns Wikilink rendering, navigation, serialization, and Release persistence", () => {
  const adapter = readFileSync(
    join(repositoryRoot, "src", "visual-editor", "visualEditorAdapter.ts"),
    "utf8",
  );
  const visualEditor = readFileSync(
    join(repositoryRoot, "src", "components", "VisualEditor.tsx"),
    "utf8",
  );
  const editorPane = readFileSync(
    join(repositoryRoot, "src", "components", "compact", "EditorPane.tsx"),
    "utf8",
  );
  const productionProbe = readFileSync(
    join(repositoryRoot, "scripts", "visual-editor-phase2-production-e2e.mjs"),
    "utf8",
  );

  assert.match(adapter, /wikilinkSchema/);
  assert.match(adapter, /wikilinkRemark/);
  assert.match(adapter, /data-wikilink-target/);
  assert.match(adapter, /onWikilinkNavigate/);
  assert.match(visualEditor, /onWikilinkNavigate/);
  assert.match(editorPane, /onWikilinkNavigate/);
  assert.ok(productionProbe.includes("visual-wikilink-persistence"));
  assert.ok(productionProbe.includes('data-type="wikilink"'));
});

test("visual Wikilink navigation preserves the current view mode for uncached notes", () => {
  const app = readFileSync(join(repositoryRoot, "src", "App.tsx"), "utf8");
  assert.match(
    app,
    /setViewMode\(options\.forceEditMode \? "edit" : options\.session\?\.viewMode \?\? viewModeRef\.current\);/,
  );
});
