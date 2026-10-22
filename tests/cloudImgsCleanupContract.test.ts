import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const read = (path: string): string => (existsSync(path) ? readFileSync(path, "utf8") : "");

const cloudImgsSource = read("src-tauri/src/cloudimgs.rs");
const cleanupSource = read("src-tauri/src/cloudimgs_cleanup.rs");
const libSource = read("src-tauri/src/lib.rs");
const assetServiceSource = read("src/services/assetService.ts");
const appSource = read("src/App.tsx");
const compactViewSource = read("src/components/CompactView.tsx");
const unifiedSettingsSource = read("src/components/compact/UnifiedSettingsPanel.tsx");
const settingsSource = read("src/components/LskySettingsPanel.tsx");
const cleanupPanelSource = read("src/components/LskyCleanupPanel.tsx");

test("云图清理必须分页读取并限制在配置目录内", () => {
  assert.match(cloudImgsSource, /pub fn list_images/);
  assert.match(cloudImgsSource, /pageSize/);
  assert.match(cloudImgsSource, /normalize_directory/);
  assert.match(cloudImgsSource, /pub fn delete_image/);
  assert.match(cloudImgsSource, /\/api\/images/);
});

test("云图清理必须复用 Markdown 引用扫描、保护窗口和删除前复核", () => {
  assert.match(cleanupSource, /collect_markdown_references/);
  assert.match(cleanupSource, /build_cleanup_plan/);
  assert.match(cleanupSource, /CLEANUP_PROTECTION_MS/);
  assert.match(cleanupSource, /MAX_DELETE_BATCH/);
  assert.match(cleanupSource, /candidate_map/);
  assert.match(cleanupSource, /delete_image/);
});

test("云图清理命令必须从 Rust 接到 App 和设置界面", () => {
  assert.match(libSource, /cloudimgs_cleanup::scan_cloudimgs_cleanup/);
  assert.match(libSource, /cloudimgs_cleanup::delete_cloudimgs_cleanup/);
  assert.match(assetServiceSource, /scanCloudImgsCleanup/);
  assert.match(assetServiceSource, /deleteCloudImgsCleanup/);
  assert.match(appSource, /handleCloudImgsCleanupScan/);
  assert.match(appSource, /handleCloudImgsCleanupDelete/);
  assert.match(compactViewSource, /onCloudImgsCleanupScan/);
  assert.match(unifiedSettingsSource, /onCloudImgsCleanupScan/);
  assert.match(settingsSource, /onCloudImgsCleanupScan/);
});

test("云图清理界面必须明确删除后进入云图回收站", () => {
  assert.match(settingsSource, /provider === "cloudimgs"/);
  assert.match(cleanupPanelSource, /回收站/);
  assert.match(cleanupPanelSource, /30/);
});
