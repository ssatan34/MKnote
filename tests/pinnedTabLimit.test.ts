import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function read(path: string): string {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

const settingsPanel = read("src/components/compact/UnifiedSettingsPanel.tsx");
const rustBackend = read("src-tauri/src/lib.rs");
const tabLimitSection = settingsPanel.slice(
  settingsPanel.indexOf("function TabLimitPanel"),
  settingsPanel.indexOf("interface UnifiedSettingsPanelProps"),
);
const rustCommandSection = rustBackend.slice(
  rustBackend.indexOf("fn set_pinned_tab_limit"),
  rustBackend.indexOf("fn resolve_asset_path"),
);

test("置顶标签设置使用 1 到 10 的数字输入", () => {
  assert.match(tabLimitSection, /type="number"/);
  assert.match(tabLimitSection, /min=\{1\}/);
  assert.match(tabLimitSection, /max=\{10\}/);
  assert.match(tabLimitSection, /每次最多可以同时置顶的标签页数（1 – 10）/);
  assert.doesNotMatch(tabLimitSection, /tab-limit-option/);
});

test("Rust 设置命令接受的置顶标签上限为 10", () => {
  assert.match(rustCommandSection, /if limit < 1 \|\| limit > 10/);
  assert.match(rustCommandSection, /置顶标签数量需在 1 到 10 之间/);
});
