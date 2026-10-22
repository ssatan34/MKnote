import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const compactViewSource = readFileSync(
  new URL("../src/components/CompactView.tsx", import.meta.url),
  "utf8",
);
const appSource = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
const visualImageSource = readFileSync(
  new URL("../src/visual-editor/visualEditorImage.ts", import.meta.url),
  "utf8",
);
const visualAdapterSource = readFileSync(
  new URL("../src/visual-editor/visualEditorAdapter.ts", import.meta.url),
  "utf8",
);
const visualEditorCss = readFileSync(
  new URL("../src/components/VisualEditor.css", import.meta.url),
  "utf8",
);

test("粘贴先导入本地图片，再通知后台上传，预览态不使用无备份占位节点", () => {
  const start = compactViewSource.indexOf("const handlePaste");
  const end = compactViewSource.indexOf("document.addEventListener(\"paste\"", start);
  const source = compactViewSource.slice(start, end);
  assert.ok(source.indexOf("assetService.importClipboardImage") < source.indexOf("onImagePasted?.(rel"));
  assert.match(source, /await insertImageMarkdown\(rel\)/);
  assert.doesNotMatch(source, /createUploadingImageRef|directUpload/);
});

test("上传占位节点可以序列化、替换为远程图片并在失败时移除", async () => {
  const {
    createUploadingImageMarkdown,
    createUploadingImageRef,
    removeUploadingImageMarkdown,
    replaceUploadingImageMarkdown,
  } = await import("../src/utils/imageUploadPlaceholder.ts");
  const uploadId = "clipboard-42";
  const markdown = `# Note\n\n${createUploadingImageMarkdown(uploadId)}\n`;

  assert.equal(createUploadingImageRef(uploadId), "mk-uploading|clipboard-42");
  assert.equal(
    replaceUploadingImageMarkdown(markdown, uploadId, "https://cloud.example/image.png"),
    '# Note\n\n![图片](https://cloud.example/image.png "mk-hosted|https://cloud.example/image.png")\n',
  );
  assert.equal(removeUploadingImageMarkdown(markdown, uploadId), "# Note\n\n\n");
});

test("图床粘贴上传完成或失败后都要求刷新可视化编辑器", () => {
  assert.match(appSource, /replaceUploadingImageMarkdown/);
  assert.match(appSource, /removeUploadingImageMarkdown/);
  assert.match(appSource, /setContentRevision\(\(n\) => n \+ 1\)/);
  assert.match(appSource, /setError\(formatError\(error\)\)/);
});

test("上传占位引用在 Visual Editor 中渲染为无本地资源的上传图标", async () => {
  const { isSafeVisualImageSource, parseVisualImageMetadata } = await import(
    "../src/visual-editor/visualEditorImage.ts"
  );
  const metadata = parseVisualImageMetadata("mk-uploading|clipboard-42", "图片", "");

  assert.equal(isSafeVisualImageSource("mk-uploading|clipboard-42"), true);
  assert.equal(metadata.sourceKind, "uploading");
  assert.equal(metadata.localRel, "");
  assert.equal(metadata.hostedUrl, "");
  assert.match(visualImageSource, /isUploadingImageSource/);
  assert.match(visualAdapterSource, /mk-image-uploading/);
  assert.match(visualEditorCss, /mk-image-uploading-spin/);
});
