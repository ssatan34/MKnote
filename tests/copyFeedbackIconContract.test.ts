import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const componentSource = readFileSync("src/components/CopyFeedbackIcon.tsx", "utf8");
const styleSource = readFileSync("src/components/CopyFeedbackIcon.css", "utf8");

test("非 React 代码块工具栏图标不注入 CSP 禁止的 inline style", () => {
  const svgFactory = componentSource.slice(
    componentSource.indexOf("export function copyFeedbackIconSvg"),
  );

  assert.doesNotMatch(svgFactory, /style=/);
  assert.match(svgFactory, /data-copy-feedback-size=/);
  assert.match(styleSource, /attr\(data-copy-feedback-size\s+px/);
});
