import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { parseArgs } from "../scripts/phase1a-t5-owner-launch.mjs";

const launcherPath = new URL(
  "../scripts/phase1a-t5-owner-launch.mjs",
  import.meta.url,
);

test("T5 Owner 启动器默认使用独立端口和隔离数据目录", () => {
  const launcher = fs.readFileSync(launcherPath, "utf8");

  assert.match(launcher, /DEFAULT_DEV_PORT\s*=\s*4205/);
  assert.match(launcher, /DEFAULT_CDP_PORT\s*=\s*9265/);
  assert.match(launcher, /STARTUP_TIMEOUT_MS\s*=\s*300000/);
  assert.match(launcher, /devPort\s*===\s*4173/);
  assert.match(launcher, /WEBVIEW2_USER_DATA_FOLDER/);
  assert.match(launcher, /CARGO_TARGET_DIR/);
  assert.match(launcher, /APPDATA/);
  assert.match(launcher, /LOCALAPPDATA/);
});

test("T5 Owner 启动器只启动 Phase 1A harness，不接入生产保存链", () => {
  const launcher = fs.readFileSync(launcherPath, "utf8");

  assert.match(launcher, /src-tauri[\\/]tauri\.conf\.json/);
  assert.match(launcher, /pocRoot/);
  assert.match(launcher, /ownerEvidence:\s*"pending"/);
  assert.doesNotMatch(launcher, /useQueuedNoteWriter/);
  assert.doesNotMatch(launcher, /EditorPane/);
  assert.doesNotMatch(launcher, /notesService/);
});

test("T5 Owner 启动器不自动执行编辑操作或伪造 Owner 结论", () => {
  const launcher = fs.readFileSync(launcherPath, "utf8");

  assert.match(launcher, /Playwright|playwright/i);
  assert.match(launcher, /不自动|manual|手工|Owner/);
  assert.doesNotMatch(launcher, /page\.keyboard\.press/);
  assert.doesNotMatch(launcher, /insertText/);
  assert.doesNotMatch(launcher, /ownerEvidence:\s*"pass"/);
});

test("T5 Owner 启动器拒绝 Owner 端口并接受显式隔离端口", () => {
  assert.throws(
    () => parseArgs(["--dev-port", "4173"], {}),
    /4173/,
  );
  assert.deepEqual(
    parseArgs(
      ["--dev-port", "4206", "--cdp-port", "9266", "--run-id", "owner-test"],
      {},
    ),
    {
      help: false,
      devPort: 4206,
      cdpPort: 9266,
      runId: "owner-test",
    },
  );
});
