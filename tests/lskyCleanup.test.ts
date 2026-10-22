import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const cleanupPanelUrl = new URL("../src/components/LskyCleanupPanel.tsx", import.meta.url);
const settingsPanelUrl = new URL("../src/components/LskySettingsPanel.tsx", import.meta.url);

test("settings combines Lsky configuration and cleanup in one route", () => {
  assert.ok(existsSync(cleanupPanelUrl), "应保留图床清理面板");
  assert.ok(existsSync(settingsPanelUrl), "应实现统一的图床设置面板");
  const cleanupPanel = readFileSync(cleanupPanelUrl, "utf8");
  const settingsPanel = readFileSync(settingsPanelUrl, "utf8");
  const settings = readFileSync(
    new URL("../src/components/compact/UnifiedSettingsPanel.tsx", import.meta.url),
    "utf8",
  );

  assert.match(settings, /\| "lskySettings"/);
  assert.match(settings, /route: "lskySettings", label: "图床设置"/);
  assert.match(settings, /<ImageHostSettingsPanel/);
  assert.doesNotMatch(settings, /route: "lskyCleanup"/);
  assert.match(settingsPanel, /图床地址/);
  assert.match(settingsPanel, /账号/);
  assert.match(settingsPanel, /密码/);
  assert.match(settingsPanel, /策略 ID/);
  assert.match(settingsPanel, /测试连接/);
  assert.match(settingsPanel, /保存/);
  assert.match(settingsPanel, /<LskyCleanupPanel/);
  assert.match(cleanupPanel, /最近 30 分钟/);
  assert.match(cleanupPanel, /扫描图床/);
  assert.match(cleanupPanel, /待清理/);
  assert.match(cleanupPanel, /确认永久删除/);
  assert.match(cleanupPanel, /取消/);
});

test("Lsky configuration is persisted and connection-tested through Tauri commands", () => {
  const service = readFileSync(new URL("../src/services/configService.ts", import.meta.url), "utf8");
  const backend = readFileSync(new URL("../src-tauri/src/lib.rs", import.meta.url), "utf8");

  assert.match(service, /setImageHostConfig[\s\S]*?"set_image_host_config"/);
  assert.doesNotMatch(service, /setLskyConfig|set_lsky_config/);
  assert.match(service, /testLskyConnection[\s\S]*?"lsky_test_connection"/);
  assert.match(backend, /fn set_image_host_config\(/);
  assert.doesNotMatch(backend, /fn set_lsky_config\(/);
  assert.match(backend, /fn lsky_test_connection\(/);
});

test("scan and delete both flush the active note before invoking cleanup", () => {
  const app = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
  const service = readFileSync(new URL("../src/services/assetService.ts", import.meta.url), "utf8");

  assert.match(app, /handleLskyCleanupScan[\s\S]*?await flushSave\(\)[\s\S]*?scanLskyCleanup/);
  assert.match(app, /handleLskyCleanupDelete[\s\S]*?await flushSave\(\)[\s\S]*?deleteLskyCleanup/);
  assert.match(service, /scanLskyCleanup\(\)[\s\S]*?"scan_lsky_cleanup"/);
  assert.match(service, /deleteLskyCleanup\(keys: string\[\]\)[\s\S]*?"delete_lsky_cleanup"/);
});
