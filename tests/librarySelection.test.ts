import assert from "node:assert/strict";
import test from "node:test";
import { getFolderSelection, isFolderSelectionActive } from "../src/utils/librarySelection.ts";

test("选择文件夹时清除颜色筛选", () => {
  assert.deepEqual(getFolderSelection("folder:work"), {
    zone: "folder:work",
    color: null,
  });
});

test("标签筛选激活时不显示文件夹选中态", () => {
  assert.equal(isFolderSelectionActive(null), true);
  assert.equal(isFolderSelectionActive("紧急"), false);
});
