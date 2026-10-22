import assert from "node:assert/strict";
import test from "node:test";
import { resolveImageHostProvider } from "../src/utils/imageHost.ts";

test("显式选择云图时使用 cloudimgs 提供商", () => {
  assert.equal(
    resolveImageHostProvider({ image_host_provider: "cloudimgs", lsky_enabled: false }),
    "cloudimgs",
  );
});

test("旧配置启用兰空且没有提供商字段时继续使用兰空", () => {
  assert.equal(resolveImageHostProvider({ lsky_enabled: true }), "lsky");
});

test("显式选择不使用图床时覆盖旧的兰空启用标记", () => {
  assert.equal(
    resolveImageHostProvider({ image_host_provider: "none", lsky_enabled: true }),
    "none",
  );
});

test("未知提供商不会意外触发上传", () => {
  assert.equal(
    resolveImageHostProvider({ image_host_provider: "unknown", lsky_enabled: true }),
    "none",
  );
});

test("关闭图床覆盖云图与旧兰空配置，重新开启恢复提供商", () => {
  for (const provider of ["lsky", "cloudimgs"]) {
    const config = { image_host_provider: provider, lsky_enabled: true, image_host_enabled: false };
    assert.equal(resolveImageHostProvider(config), "none");
    assert.equal(resolveImageHostProvider({ ...config, image_host_enabled: true }), provider);
  }
  assert.equal(resolveImageHostProvider({ lsky_enabled: true, image_host_enabled: false }), "none");
});
