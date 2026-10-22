import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  isSafeVisualImageSource,
  parseVisualImageMetadata,
  serializeVisualImageTitle,
} from "../src/visual-editor/visualEditorImage.ts";

const adapterSource = readFileSync("src/visual-editor/visualEditorAdapter.ts", "utf8");
const sessionSource = readFileSync("src/visual-editor/visualEditorSession.ts", "utf8");
const tauriConfig = JSON.parse(readFileSync("src-tauri/tauri.conf.json", "utf8"));

test("visual 图片节点必须把既有 Markdown 图片映射到九项正式元数据", () => {
  assert.deepEqual(
    parseVisualImageMetadata("File/assets/local.png", "本地图片", ""),
    {
      src: "File/assets/local.png",
      alt: "本地图片",
      title: "",
      sourceKind: "local",
      localRel: "File/assets/local.png",
      originalLocalRel: "",
      hostedUrl: "",
      width: 0,
      doodledUrl: "",
    },
  );

  assert.deepEqual(
    parseVisualImageMetadata(
      "https://cdn.example.com/hosted.png",
      "图床图片",
      "mk-hosted|https://cdn.example.com/hosted.png",
    ),
    {
      src: "https://cdn.example.com/hosted.png",
      alt: "图床图片",
      title: "mk-hosted|https://cdn.example.com/hosted.png",
      sourceKind: "hosted",
      localRel: "",
      originalLocalRel: "",
      hostedUrl: "https://cdn.example.com/hosted.png",
      width: 0,
      doodledUrl: "",
    },
  );

  assert.deepEqual(
    parseVisualImageMetadata(
      "File/assets/original.png",
      "涂鸦",
      "mk-doodled|https://cdn.example.com/doodle.png",
    ),
    {
      src: "File/assets/original.png",
      alt: "涂鸦",
      title: "mk-doodled|https://cdn.example.com/doodle.png",
      sourceKind: "doodled",
      localRel: "File/assets/original.png",
      originalLocalRel: "File/assets/original.png",
      hostedUrl: "",
      width: 0,
      doodledUrl: "https://cdn.example.com/doodle.png",
    },
  );

  assert.equal(
    serializeVisualImageTitle(
      parseVisualImageMetadata("File/assets/wide.png", "宽图", "w:640px"),
    ),
    "w:640px",
  );
});

test("visual 图片源只允许本地资产、HTTP(S) 和白名单栅格 Data URL", () => {
  for (const source of [
    "File/assets/local.png",
    "asset://localhost/File/assets/local.png",
    "https://images.example.com/photo.png",
    "data:image/png;base64,iVBORw0KGgo=",
  ]) {
    assert.equal(isSafeVisualImageSource(source), true, source);
  }

  for (const source of [
    "",
    "   ",
    "javascript:alert(1)",
    "data:image/svg+xml,<svg onload=alert(1)></svg>",
    "data:text/html,<script>alert(1)</script>",
    "//untrusted.example/image.png",
  ]) {
    assert.equal(isSafeVisualImageSource(source), false, source);
  }
});

test("visual adapter 必须使用扩展图片 schema 和带 payload 的插入命令", () => {
  assert.match(adapterSource, /imageSchema\.extendSchema/);
  assert.match(adapterSource, /visualImageSchema/);
  assert.match(adapterSource, /insertImageCommand/);
  assert.match(adapterSource, /sourceKind/);
  assert.match(adapterSource, /originalLocalRel/);
  assert.match(adapterSource, /hostedUrl/);
  assert.match(adapterSource, /doodledUrl/);
  assert.match(sessionSource, /type\s*:\s*"insert-image"/);
});

test("visual 图片节点允许安全的 HTTPS 图床资源通过 Tauri CSP", () => {
  assert.match(tauriConfig.app.security.csp["img-src"], /https:/);
});

test("图片宽度辅助逻辑允许动态 style 属性但不放宽脚本策略", () => {
  assert.match(tauriConfig.app.security.csp["style-src-attr"], /unsafe-inline/);
  assert.doesNotMatch(tauriConfig.app.security.csp["style-src-attr"], /unsafe-eval/);
});
