import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const appSource = readFileSync("src/App.tsx", "utf8");
const capsuleHandler = appSource.slice(
  appSource.indexOf("const handleOpenCapsule"),
  appSource.indexOf("const handlePopoutTab"),
);
const popoutHandler = appSource.slice(
  appSource.indexOf("const handlePopoutTab"),
  appSource.indexOf("const handleOpenContainingFolder"),
);

test("Capsule 转换必须等待当前笔记保存完成", () => {
  assert.match(capsuleHandler, /await\s+flushSave\(\)/);
});

test("Popout 转换必须等待目标笔记保存完成", () => {
  assert.match(popoutHandler, /await\s+flushSave\(\)/);
  assert.match(popoutHandler, /await\s+flushTab\(/);
});
