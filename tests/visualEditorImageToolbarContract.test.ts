import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const compactViewSource = readFileSync("src/components/CompactView.tsx", "utf8");

test("预览态图片工具栏必须把导入资源交给 Visual Editor 图片命令", () => {
  assert.match(
    compactViewSource,
    /executeCommand\(\{\s*type:\s*["']insert-image["'][\s\S]*?src:\s*relPath/s,
  );
  assert.match(compactViewSource, /pendingVisualImageRef/);
  assert.match(compactViewSource, /await handleTogglePreview\(\)/);
});
