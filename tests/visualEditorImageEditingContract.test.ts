import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const visualEditorSource = readFileSync(new URL("../src/components/VisualEditor.tsx", import.meta.url), "utf8");
const editorPaneSource = readFileSync(new URL("../src/components/compact/EditorPane.tsx", import.meta.url), "utf8");
const compactViewSource = readFileSync(new URL("../src/components/CompactView.tsx", import.meta.url), "utf8");
const modalSource = readFileSync(new URL("../src/components/ImageDoodleModal.tsx", import.meta.url), "utf8");
const appSource = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");

test("Visual Editor 图片点击必须重新打开图片编辑入口", () => {
  assert.match(visualEditorSource, /onImageDoodle/);
  assert.match(visualEditorSource, /closest(?:<[^>]+>)?\(["']img["']\)/);
  assert.match(visualEditorSource, /data-mk-hosted-url/);
  assert.match(visualEditorSource, /preventDefault\(\)/);
});

test("EditorPane 与 CompactView 必须把图片编辑事件传给涂鸦弹窗", () => {
  assert.match(editorPaneSource, /onImageDoodle/);
  assert.match(editorPaneSource, /<VisualEditor[\s\S]*onImageDoodle=\{onImageDoodle\}/);
  assert.match(compactViewSource, /const openImageDoodle = useCallback/);
  assert.match(compactViewSource, /setDoodleOpen\(true\)/);
  assert.match(compactViewSource, /onImageDoodle=\{openImageDoodle\}/);
});

test("云图图片保存必须直接上传画布字节，不导入或覆盖本地资源", () => {
  const hostedSaveStart = modalSource.indexOf("if (hostedUrl && onHostedSaved)");
  const localImportStart = modalSource.indexOf("assetService.importClipboardImage");
  const localOverwriteStart = modalSource.indexOf("assetService.overwriteAsset");

  assert.ok(hostedSaveStart >= 0, "必须有云图直传分支");
  assert.ok(localImportStart > hostedSaveStart, "云图直传分支必须先于本地导入");
  assert.ok(localOverwriteStart > hostedSaveStart, "云图直传分支必须先于本地覆盖");
  assert.match(modalSource.slice(hostedSaveStart, localImportStart), /onHostedSaved\(\s*hostedUrl/);
  assert.match(modalSource, /onHostedSaved\?/);
});

test("App 必须把云图涂鸦结果上传后替换远程引用并刷新编辑器", () => {
  assert.match(appSource, /const handleHostedImageEdited/);
  assert.match(appSource, /assetService\.uploadImage\(filename, Array\.from\(imageData\)\)/);
  assert.match(appSource, /replaceHostedImageMarkdown/);
  assert.match(appSource, /setContentRevision\(\(n\) => n \+ 1\)/);
  assert.match(compactViewSource, /onHostedImageEdited/);
  assert.match(compactViewSource, /onHostedSaved=\{onHostedImageEdited\}/);
});
