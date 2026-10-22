import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const appSource = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
const start = appSource.indexOf("const handleImagePasted");
const end = appSource.indexOf("const handleDoodleSaved", start);
const handleImagePastedSource = appSource.slice(start, end);

test("clipboard image upload failures remain visible and remove transient placeholders", () => {
  assert.ok(start >= 0 && end > start, "应能定位图片粘贴上传处理函数");
  assert.match(
    handleImagePastedSource,
    /\.catch\(\(error\) => \{\s*setError\(formatError\(error\)\);/s,
  );
  assert.match(handleImagePastedSource, /removeUploadingImageMarkdown/);
  assert.doesNotMatch(handleImagePastedSource, /上传失败静默/);
});
