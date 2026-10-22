import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("底部删除按钮使用内联两次点击确认并复用 Quick Todo 图标", () => {
  const source = readFileSync(
    new URL("../src/components/compact/StatusBarNoteActions.tsx", import.meta.url),
    "utf8",
  );

  assert.match(source, /<DeleteButton[\s\S]*?onClick=\{handleDeleteClick\}/);
  assert.match(source, /onDeleteCurrentNote\(\);/);
  assert.match(source, /iconSize=\{11\}/);
  assert.match(source, /setTimeout\(\(\) => setDeleteConfirming\(false\), 5000\)/);
  assert.match(source, /document\.addEventListener\("pointerdown", resetOnOutsidePointerDown, true\)/);
  assert.match(source, /data-delete-action/);
  assert.match(source, /<Icon name="confirm" size=\{16\}/);
  assert.doesNotMatch(source, /delete-note-confirm/);

  const css = readFileSync(new URL("../src/App.css", import.meta.url), "utf8");
  assert.match(css, /\.delete-note-confirm\.statusbar-popover-up\s*\{[\s\S]*?top:\s*auto;[\s\S]*?bottom:\s*calc\(100% \+ 8px\);/);
});

test("底部工具栏在开机自启和上传思源之间触发 S3 双向同步", () => {
  const statusBar = readFileSync(
    new URL("../src/components/compact/CompactStatusBar.tsx", import.meta.url),
    "utf8",
  );
  const compactView = readFileSync(
    new URL("../src/components/CompactView.tsx", import.meta.url),
    "utf8",
  );
  const app = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
  const sync = readFileSync(new URL("../src-tauri/src/sync.rs", import.meta.url), "utf8");

  const manualSyncIndex = statusBar.indexOf("statusbar-btn--manual-sync");
  const autostartIndex = statusBar.indexOf('name="autostart"');
  const siyuanActionsIndex = statusBar.indexOf("<StatusBarNoteActions");
  assert.ok(autostartIndex >= 0 && autostartIndex < manualSyncIndex);
  assert.ok(manualSyncIndex >= 0 && manualSyncIndex < siyuanActionsIndex);
  assert.match(statusBar, /name="sync_manual"/);
  assert.match(statusBar, /disabled=\{manualSyncBusy \|\| !syncEnabled \|\| !syncInitialized\}/);
  assert.match(compactView, /onManualSync: \(\) => void/);
  assert.match(compactView, /onManualSync=\{onManualSync\}/);
  assert.match(app, /const handleManualSync = async \(\) => \{/);
  assert.match(app, /await syncService\.tick\(/);
  assert.match(app, /onManualSync=\{\(\) => void handleManualSync\(\)\}/);
  assert.match(sync, /Self::DefaultNote,\s*Self::QuickTodoDefault,\s*Self::QuickPocketDefault/);
  assert.match(sync, /config\s*\.quick_todos\s*\.iter\(\)/);
  assert.match(sync, /config\s*\.quick_pockets\s*\.iter\(\)/);
});

test("S3 同步冲突提供保留本地和采用云端两个解决按钮", () => {
  const panel = readFileSync(
    new URL("../src/components/MessageHubSettingsPanel.tsx", import.meta.url),
    "utf8",
  );
  const app = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
  const service = readFileSync(new URL("../src/services/syncService.ts", import.meta.url), "utf8");

  assert.match(panel, /保留本地并上传/);
  assert.match(panel, /采用云端版本/);
  assert.match(panel, /onSyncResolveConflicts/);
  assert.match(app, /handleSyncResolveConflicts/);
  assert.match(service, /sync_resolve_conflicts/);
});
