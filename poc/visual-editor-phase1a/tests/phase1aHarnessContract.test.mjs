import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const pocRoot = path.resolve(import.meta.dirname, "..");
const tauriRoot = path.join(pocRoot, "src-tauri");

const read = (relativePath) =>
  fs.readFileSync(path.join(pocRoot, relativePath), "utf8");

test("Phase 1A Tauri harness is visibly isolated from production", () => {
  const config = JSON.parse(read("src-tauri/tauri.conf.json"));
  const libSource = read("src-tauri/src/lib.rs");
  const viteConfig = read("vite.config.ts");

  assert.equal(config.identifier, "com.sin.mknote.visual-editor-phase1a");
  assert.equal(config.build.frontendDist, "../dist");
  assert.equal(config.bundle.active, false);
  assert.equal(config.app.windows[0].visible, true);
  assert.equal(config.app.windows[0].label, "phase1a");
  assert.match(libSource, /tauri::Builder::default\(\)/);
  assert.doesNotMatch(
    libSource,
    /read_note|write_note|useQueuedNoteWriter|EditorPane|notesService/,
  );
  assert.match(viteConfig, /src-tauri/);
  assert.match(viteConfig, /ignored/);
});

test("Phase 1A WebView2 probe can avoid a manually running frontend port", () => {
  const webviewProbe = read("scripts/phase1a-webview2-e2e.mjs");

  assert.match(webviewProbe, /MKN_PHASE1A_DEV_PORT/);
  assert.match(webviewProbe, /beforeDevCommand/);
  assert.match(webviewProbe, /devUrl/);
  assert.match(webviewProbe, /CARGO_TARGET_DIR/);
  assert.match(webviewProbe, /MKN_PHASE1A_CDP_TIMEOUT_MS/);
});

test("Phase 1A real IME probe is explicit and remains isolated", () => {
  const packageJson = JSON.parse(read("package.json"));
  const imeProbe = read("scripts/phase1a-webview2-ime-e2e.mjs");

  assert.equal(
    packageJson.scripts["test:webview2:ime"],
    "node scripts/phase1a-webview2-ime-e2e.mjs",
  );
  assert.match(imeProbe, /LoadKeyboardLayout/);
  assert.match(imeProbe, /SendKeys.*SendWait/);
  assert.match(imeProbe, /mknote-visual-editor-phase1a-harness/);
  assert.match(imeProbe, /WEBVIEW2_USER_DATA_FOLDER/);
  assert.match(imeProbe, /MKN_PHASE1A_IME_DEV_PORT/);
  assert.match(imeProbe, /MKN_PHASE1A_IME_KEY_DELAY_MS/);
  assert.match(imeProbe, /MKN_PHASE1A_IME_COMMIT_DELAY_MS/);
  assert.match(imeProbe, /MKN_PHASE1A_IME_CDP_TIMEOUT_MS/);
  assert.match(imeProbe, /tauriCommand/);
  assert.match(imeProbe, /devServerConfig/);
  assert.match(imeProbe, /devUrl/);
  assert.match(imeProbe, /beforeDevCommand/);
  assert.match(imeProbe, /--config/);
  assert.match(imeProbe, /CARGO_TARGET_DIR/);
  assert.match(imeProbe, /real-microsoft-pinyin-1000-composition/);
});
test("Phase 1A IME commit keeps the same focused composition session", () => {
  const imeProbe = read("scripts/phase1a-webview2-ime-e2e.mjs");

  // Pressing the commit key must not reinitialize the keyboard layout or steal
  // focus: doing so cancels the composition in Microsoft Pinyin.
  assert.match(
    imeProbe,
    /function sendMicrosoftPinyinContinuation\(keys, delayMs = 35\)/,
  );
  assert.match(
    imeProbe,
    /sendMicrosoftPinyinContinuation\(" ", imeKeyDelayMs\)/,
  );
});

test("Phase 1A IME continuation restores the harness foreground window", () => {
 const imeProbe = read("scripts/phase1a-webview2-ime-e2e.mjs");
 const continuationStart = imeProbe.indexOf(
  "function sendMicrosoftPinyinContinuation",
 );
 const continuationEnd = imeProbe.indexOf(
  "function sendMicrosoftPinyinStableKey",
  continuationStart,
 );
 const continuation = imeProbe.slice(continuationStart, continuationEnd);

 assert.match(continuation, /Get-Process -Name '\$\{targetProcessName\}'/);
 assert.match(continuation, /SetForegroundWindow/);
});

test("Phase 1A IME probe allows a large-editor readiness timeout", () => {
 const imeProbe = read("scripts/phase1a-webview2-ime-e2e.mjs");

 assert.match(imeProbe, /MKN_PHASE1A_IME_READY_TIMEOUT_MS/);
 assert.match(imeProbe, /imeReadyTimeoutMs/);
});

test("Phase 1A IME probe covers the Gate B real-input scenarios", () => {
  const imeProbe = read("scripts/phase1a-webview2-ime-e2e.mjs");

  assert.match(
    imeProbe,
    /function sendMicrosoftPinyinScanCode\(scanCode, delayMs = 35\)/,
  );
  assert.match(imeProbe, /function sendMicrosoftPinyinEnter\(delayMs = 35\)/);
  assert.match(imeProbe, /SCAN_ENTER/);
  assert.match(imeProbe, /SCAN_DOWN/);
  assert.match(imeProbe, /SCAN_PAGEDOWN/);
  assert.match(imeProbe, /SCAN_SHIFT/);
  assert.match(imeProbe, /real-microsoft-pinyin-commit-keys/);
  assert.match(imeProbe, /real-microsoft-pinyin-candidate-paging/);
  assert.match(imeProbe, /real-microsoft-pinyin-language-switch/);
  assert.match(imeProbe, /real-microsoft-pinyin-punctuation/);
  assert.match(imeProbe, /real-microsoft-pinyin-mouse-selection-replacement/);
  assert.match(imeProbe, /sendMicrosoftPinyinScanCode\(SCAN_PAGEDOWN/);
  assert.match(imeProbe, /sendMicrosoftPinyinScanCode\(SCAN_DOWN/);
  assert.match(imeProbe, /sendMicrosoftPinyinEnter\(imeKeyDelayMs\)/);
  assert.match(imeProbe, /sendMicrosoftPinyinScanCode\(SCAN_SHIFT/);
  assert.match(imeProbe, /page\.mouse\.down\(\)/);
  assert.match(imeProbe, /page\.mouse\.up\(\)/);
});

test("Phase 1A IME probe classifies unavailable capabilities with a reason", () => {
  const imeProbe = read("scripts/phase1a-webview2-ime-e2e.mjs");

  assert.match(imeProbe, /NotAvailableError/);
  assert.match(imeProbe, /status: "not-available"/);
  assert.match(imeProbe, /reason/);
  assert.match(imeProbe, /00000409/);
  assert.match(imeProbe, /English keyboard layout/);
});

test("Phase 1A IME probe can target a large editor without clearing it", () => {
  const imeProbe = read("scripts/phase1a-webview2-ime-e2e.mjs");

  assert.match(imeProbe, /MKN_PHASE1A_IME_SCENARIO/);
  assert.match(imeProbe, /large-editor-input/);
  assert.match(imeProbe, /MKN_PHASE1A_IME_BENCHMARK_BYTES/);
  assert.match(imeProbe, /MKN_PHASE1A_IME_BENCHMARK_FIXTURE/);
  assert.match(imeProbe, /MKN_PHASE1A_IME_BENCHMARK_TABLE_COUNT/);
  assert.match(imeProbe, /benchmarkTableCount/);
  assert.match(imeProbe, /MKN_PHASE1A_IME_EDITOR_PROFILE/);
  assert.match(imeProbe, /no-table-runtime/);
  assert.match(imeProbe, /no-table-editing-runtime/);
  assert.match(imeProbe, /MKN_PHASE1A_IME_REPORT/);
  assert.match(imeProbe, /real-os-input-large-editor/);
  assert.match(imeProbe, /page\.on\("crash"/);
  assert.match(imeProbe, /rendererCrashed/);
  assert.match(imeProbe, /textContent/);
  const largeEditorInputFunction = imeProbe.slice(
    imeProbe.indexOf("async function runLargeEditorInput"),
    imeProbe.indexOf("async function resetImeEditor"),
  );
  assert.doesNotMatch(
    largeEditorInputFunction,
    /clearEditor\(page\)/,
  );
});

test("Phase 1A large-editor probe preserves a pre-crash DOM and event snapshot", () => {
  const imeProbe = read("scripts/phase1a-webview2-ime-e2e.mjs");

  assert.match(imeProbe, /beforeInputSnapshot/);
  assert.match(imeProbe, /renderer-crashed/);
  assert.match(imeProbe, /eventCounts/);
  assert.match(imeProbe, /snapshot/);
});

test("Phase 1A candidate paging requires a confirmed paging-key change", () => {
  const imeProbe = read("scripts/phase1a-webview2-ime-e2e.mjs");

  assert.match(imeProbe, /confirmedPaging/);
  assert.match(imeProbe, /candidate paging.*not-available/i);
  assert.doesNotMatch(imeProbe, /method: "equals-key"/);
});

test("Phase 1A scan-code injection uses a complete Win32 key event", () => {
  const imeProbe = read("scripts/phase1a-webview2-ime-e2e.mjs");

  assert.match(imeProbe, /keybd_event/);
  assert.match(imeProbe, /KEYEVENTF_SCANCODE/);
  assert.match(imeProbe, /KEYEVENTF_KEYUP/);
  assert.match(imeProbe, /extendedKeyFlag[\s\S]*SCAN_DOWN/i);
  assert.match(imeProbe, /VK_SHIFT/);
});

test("Phase 1A Shift injection uses a virtual-key SendInput pair", () => {
  const imeProbe = read("scripts/phase1a-webview2-ime-e2e.mjs");

  assert.match(
    imeProbe,
    /public static class MknotePhase1aImeScanCode[\s\S]*SendInput\([\s\S]*useScanCode/,
  );
  assert.match(imeProbe, /virtualKey/);
  assert.match(imeProbe, /KEYEVENTF_KEYUP/);
});

test("Phase 1A scan-code injection fails fast when SendInput is incomplete", () => {
  const imeProbe = read("scripts/phase1a-webview2-ime-e2e.mjs");

  assert.match(imeProbe, /\$ErrorActionPreference = ['\"]Stop['\"]/);
  assert.match(imeProbe, /SendInput did not complete virtual-key pair/);
});

test("Phase 1A reset key uses the stable focused-window path", () => {
  const imeProbe = read("scripts/phase1a-webview2-ime-e2e.mjs");

  assert.match(imeProbe, /function sendMicrosoftPinyinStableKey/);
  assert.match(imeProbe, /\]::SendWait\('\{ESC\}'\)/);
});

test("Phase 1A commit key uses the stable focused-window path", () => {
  const imeProbe = read("scripts/phase1a-webview2-ime-e2e.mjs");

  assert.match(
    imeProbe,
    /function sendMicrosoftPinyinStableKey\(scanCode, delayMs = 35\)/,
  );
  assert.match(imeProbe, /\]::SendWait\('\{ENTER\}'\)/);
});

test("Phase 1A Playwright E2E can avoid a manually running frontend port", () => {
  const playwrightConfig = read("playwright.config.ts");

  assert.match(playwrightConfig, /MKN_PHASE1A_E2E_PORT/);
  assert.match(playwrightConfig, /reuseExistingServer: false/);
});

test("Phase 1A WebView2 probe can exercise the incremental table profile", () => {
  const webviewProbe = read("scripts/phase1a-webview2-e2e.mjs");

  assert.match(webviewProbe, /MKN_PHASE1A_E2E_BENCHMARK_BYTES/);
  assert.match(webviewProbe, /MKN_PHASE1A_E2E_EDITOR_PROFILE/);
  assert.match(webviewProbe, /incremental-table-align-runtime/);
  assert.match(webviewProbe, /textAlign/);
  assert.match(webviewProbe, /下方插入行/);
  assert.match(webviewProbe, /删除当前列/);
  assert.match(webviewProbe, /删除当前行/);
});
