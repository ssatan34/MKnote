import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const smokeScript = readFileSync("scripts/smoke-release.ps1", "utf8");
const systemSource = readFileSync("src-tauri/src/system.rs", "utf8");

test("托盘退出必须先请求前端 flush，不能直接绕过保存退出", () => {
  const trayHandler = systemSource.slice(
    systemSource.indexOf(".on_menu_event"),
    systemSource.indexOf(".on_tray_icon_event"),
  );

  assert.match(trayHandler, /"quit"\s*=>[\s\S]*mknote:request-quit/);
  assert.doesNotMatch(trayHandler, /"quit"\s*=>\s*app\.exit\(0\)/);
});

test("Release smoke 提供退出保存失败的真实窗口入口", () => {
  assert.match(smokeScript, /\[switch\]\$VerifyExitSaveFailure/);
  assert.match(smokeScript, /function Test-ExitSaveFailure/);
  assert.match(smokeScript, /exitSave/);
  assert.match(smokeScript, /windowRemainsVisible/);
});

test("Release smoke 提供隔离的真实 CAS 外部冲突注入入口", () => {
  assert.match(smokeScript, /\[switch\]\$VerifyExternalConflict/);
  assert.match(smokeScript, /function Test-ExternalConflict/);
  assert.match(smokeScript, /function Get-WindowUiText/);
  assert.match(smokeScript, /Start-Sleep -Milliseconds 900/);
  assert.match(smokeScript, /diskIsExternalOnly/);
  assert.match(smokeScript, /uiShowsConflict/);
  assert.match(smokeScript, /外部修改\|拒绝覆盖\|保存\.\*失败/);
  assert.match(smokeScript, /externalConflict/);
});

test("Release smoke 提供显式保存延迟和失败注入入口", () => {
  assert.match(smokeScript, /\[int\]\$SaveDelayMs/);
  assert.match(smokeScript, /\[switch\]\$VerifySaveFailure/);
  assert.match(smokeScript, /MKN_TEST_SAVE_DELAY_MS/);
  assert.match(smokeScript, /MKN_TEST_SAVE_FAILURE/);
  assert.match(smokeScript, /function Test-SaveFailure/);
  assert.match(smokeScript, /diskHasMarker/);
  assert.match(smokeScript, /uiShowsSaveError/);
});

test("Release smoke 覆盖 Capsule、Popout 与 Private 的保存故障路径", () => {
  assert.match(smokeScript, /\[switch\]\$VerifyCapsuleSave/);
  assert.match(smokeScript, /\[switch\]\$VerifyPopoutSave/);
  assert.match(smokeScript, /\[switch\]\$VerifyPrivateSave/);
  assert.match(smokeScript, /function Test-CapsuleSaveFailure/);
  assert.match(smokeScript, /function Test-PopoutSaveFailure/);
  assert.match(smokeScript, /function Test-PrivateSaveFailure/);
  assert.match(smokeScript, /capsuleSave/);
  assert.match(smokeScript, /popoutSave/);
  assert.match(smokeScript, /privateSave/);
});

test("Private smoke 必须通过隐藏路径验证保存失败后的窗口状态", () => {
  assert.doesNotMatch(smokeScript, /Prepare-PrivateSmokeData/);
  assert.doesNotMatch(smokeScript, /restarting private smoke process/);
  assert.match(smokeScript, /Click-WindowPointWithCtrl \$Main 0\.90 0\.96/);
  assert.match(smokeScript, /Click-WindowPoint \$Main 0\.95 0\.04/);
  assert.match(smokeScript, /windowRemainsVisible/);
  assert.match(smokeScript, /-and \$windowRemainsVisible/);
});

test("Release smoke 必须在启动前拒绝已有单实例进程", () => {
  const guardIndex = smokeScript.indexOf("Get-ExistingMknoteProcess");
  const startIndex = smokeScript.indexOf("$proc = Start-Process");

  assert.ok(guardIndex >= 0, "smoke script must define the existing-process guard");
  assert.ok(guardIndex < startIndex, "existing-process guard must run before Start-Process");
  assert.match(smokeScript, /Get-Process -Name ['\"]md-sticky-note['\"],['\"]MarkdownStickyNote['\"]/);
  assert.match(smokeScript, /Existing MKnote process detected/);
});
