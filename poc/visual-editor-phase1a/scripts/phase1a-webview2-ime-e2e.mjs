/**
 * 在独立 Phase 1A Tauri harness 中验证真实 Windows Microsoft Pinyin 输入。
 *
 * 与 CDP keyboard.insertText 不同，本探针通过 Win32/SendKeys 将拼音按键
 * 送入最新启动的 harness 窗口；窗口、WebView2 用户数据和环境目录均为临时目录。
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawn, spawnSync } from "node:child_process";

import { captureReadyDiagnostics } from "./phase1a-ready-diagnostics.mjs";

const playwrightExports = await import("playwright");
const chromium = playwrightExports.chromium ?? playwrightExports.default?.chromium;
if (!chromium) throw new Error("Playwright chromium export is unavailable");

const pocRoot = path.resolve(import.meta.dirname, "..");
const repositoryRoot = path.resolve(pocRoot, "..", "..");
const tauriCommand = path.join(
  repositoryRoot,
  "node_modules",
  "@tauri-apps",
  "cli",
  "tauri.js",
);
const configPath = path.join(pocRoot, "src-tauri", "tauri.conf.json");
const artifactDir = path.join(pocRoot, "artifacts");
const reportPath = process.env.MKN_PHASE1A_IME_REPORT
  ? path.resolve(process.env.MKN_PHASE1A_IME_REPORT)
  : path.join(artifactDir, "phase1a-webview2-ime-e2e.json");
const screenshotPath = process.env.MKN_PHASE1A_IME_SCREENSHOT
  ? path.resolve(process.env.MKN_PHASE1A_IME_SCREENSHOT)
  : path.join(artifactDir, "phase1a-webview2-ime-e2e.png");
const cdpPort = Number(process.env.MKN_PHASE1A_IME_CDP_PORT ?? 9242);
const imeCdpTimeoutMs = Number(process.env.MKN_PHASE1A_IME_CDP_TIMEOUT_MS ?? 300000);
const imeDevPort = Number(process.env.MKN_PHASE1A_IME_DEV_PORT ?? 4173);
const imeKeyDelayMs = Number(process.env.MKN_PHASE1A_IME_KEY_DELAY_MS ?? 2);
const imeCommitDelayMs = Number(process.env.MKN_PHASE1A_IME_COMMIT_DELAY_MS ?? 250);
const imeReadyTimeoutMs = Number(
  process.env.MKN_PHASE1A_IME_READY_TIMEOUT_MS ?? 30000,
);
const imeScenario = process.env.MKN_PHASE1A_IME_SCENARIO ?? "full";
const benchmarkBytesRaw = process.env.MKN_PHASE1A_IME_BENCHMARK_BYTES;
const benchmarkBytes = benchmarkBytesRaw === undefined
  ? null
  : Number(benchmarkBytesRaw);
const benchmarkFixture = process.env.MKN_PHASE1A_IME_BENCHMARK_FIXTURE ?? "table";
const benchmarkTableCountRaw =
  process.env.MKN_PHASE1A_IME_BENCHMARK_TABLE_COUNT;
const benchmarkTableCount = benchmarkTableCountRaw === undefined
  ? null
  : Number(benchmarkTableCountRaw);
const benchmarkEditorProfile =
  process.env.MKN_PHASE1A_IME_EDITOR_PROFILE ?? "normal";
const benchmarkSizes = [100 * 1024, 500 * 1024];
const benchmarkFixtures = ["table", "paragraph", "single-table"];
const benchmarkTableCounts = [1, 16, 64, 256, 512, 1024, 2048, 5120];
const benchmarkEditorProfiles = [
  "normal",
  "no-gfm",
  "no-table-runtime",
  "no-table-align-runtime",
  "no-table-editing-runtime",
  "incremental-table-align-runtime",
  "virtualized-blocks",
];
if (!["full", "large-editor-input"].includes(imeScenario)) {
  throw new Error(`invalid MKN_PHASE1A_IME_SCENARIO: ${imeScenario}`);
}
if (
  benchmarkBytes !== null &&
  (!Number.isInteger(benchmarkBytes) || !benchmarkSizes.includes(benchmarkBytes))
) {
  throw new Error(
    `invalid MKN_PHASE1A_IME_BENCHMARK_BYTES: ${benchmarkBytesRaw}`,
  );
}
if (!benchmarkFixtures.includes(benchmarkFixture)) {
  throw new Error(
    `invalid MKN_PHASE1A_IME_BENCHMARK_FIXTURE: ${benchmarkFixture}`,
  );
}
if (
  benchmarkTableCount !== null &&
  (!Number.isInteger(benchmarkTableCount) ||
    !benchmarkTableCounts.includes(benchmarkTableCount))
) {
  throw new Error(
    `invalid MKN_PHASE1A_IME_BENCHMARK_TABLE_COUNT: ${benchmarkTableCountRaw}`,
  );
}
if (benchmarkTableCount !== null && benchmarkFixture !== "table") {
  throw new Error(
    "MKN_PHASE1A_IME_BENCHMARK_TABLE_COUNT requires table fixture",
  );
}
if (!benchmarkEditorProfiles.includes(benchmarkEditorProfile)) {
  throw new Error(
    `invalid MKN_PHASE1A_IME_EDITOR_PROFILE: ${benchmarkEditorProfile}`,
  );
}
if (imeScenario === "large-editor-input" && benchmarkBytes === null) {
  throw new Error(
    "MKN_PHASE1A_IME_BENCHMARK_BYTES is required for large-editor-input",
  );
}
const SCAN_SHIFT = 0x2a;
const VK_SHIFT = 0x10;
const SCAN_ENTER = 0x1c;
const SCAN_ESCAPE = 0x01;
const SCAN_DOWN = 0x50;
const SCAN_PAGEDOWN = 0x51;
if (!Number.isInteger(imeKeyDelayMs) || imeKeyDelayMs < 0) {
  throw new Error(`invalid MKN_PHASE1A_IME_KEY_DELAY_MS: ${imeKeyDelayMs}`);
}
if (!Number.isInteger(imeCommitDelayMs) || imeCommitDelayMs < 0) {
  throw new Error(`invalid MKN_PHASE1A_IME_COMMIT_DELAY_MS: ${imeCommitDelayMs}`);
}
if (!Number.isInteger(imeCdpTimeoutMs) || imeCdpTimeoutMs < 1000) {
  throw new Error(`invalid MKN_PHASE1A_IME_CDP_TIMEOUT_MS: ${imeCdpTimeoutMs}`);
}
if (!Number.isInteger(imeReadyTimeoutMs) || imeReadyTimeoutMs < 1000) {
  throw new Error(
    `invalid MKN_PHASE1A_IME_READY_TIMEOUT_MS: ${imeReadyTimeoutMs}`,
  );
}
const devServerConfig = JSON.stringify({
  build: {
    beforeDevCommand: `npm run dev -- --host 127.0.0.1 --port ${imeDevPort}`,
    devUrl: (() => {
      const params = new URLSearchParams();
      if (benchmarkBytes !== null) {
        params.set("benchmarkBytes", String(benchmarkBytes));
        params.set("benchmarkFixture", benchmarkFixture);
        params.set("benchmarkEditorProfile", benchmarkEditorProfile);
        if (benchmarkTableCount !== null) {
          params.set("benchmarkTableCount", String(benchmarkTableCount));
        }
      }
      const query = params.toString();
      return `http://127.0.0.1:${imeDevPort}${query ? `?${query}` : ""}`;
    })(),
  },
});
const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "mknote-phase1a-ime-"));
const webviewData = path.join(sandbox, "WebView2");
const appData = path.join(sandbox, "AppData");
const tempDir = path.join(sandbox, "Temp");
const cargoTarget = process.env.MKN_PHASE1A_IME_CARGO_TARGET_DIR
  ? path.resolve(process.env.MKN_PHASE1A_IME_CARGO_TARGET_DIR)
  : path.join(sandbox, "cargo-target");
const targetProcessName = "mknote-visual-editor-phase1a-harness";

for (const directory of [artifactDir, webviewData, appData, tempDir, cargoTarget]) {
  fs.mkdirSync(directory, { recursive: true });
}

const childOutput = [];
const results = {};
const browserEvents = {
  pageErrors: [],
  consoleErrors: [],
  requestFailures: [],
  responses: [],
};
let browser;
let appProcess;
let originalImeLayout;
let rendererCrashed = false;

class NotAvailableError extends Error {
  constructor(reason, detail = {}) {
    super(reason);
    this.name = "NotAvailableError";
    this.detail = detail;
  }
}

const wait = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

async function poll(callback, timeout = 8000, interval = 100) {
  const deadline = Date.now() + timeout;
  let lastError;

  while (Date.now() < deadline) {
    try {
      const value = await callback();
      if (value) return value;
    } catch (error) {
      lastError = error;
    }
    await wait(interval);
  }

  if (lastError) throw lastError;
  throw new Error(`condition was not met within ${timeout}ms`);
}

function runPowerShell(command) {
  return execFileSync(
    "powershell.exe",
    [
      "-NoProfile",
      "-NonInteractive",
      "-WindowStyle",
      "Hidden",
      "-Command",
      command,
    ],
    { encoding: "utf8", windowsHide: true },
  ).trim();
}

function sendMicrosoftPinyinKeys(keys, delayMs = 35) {
  const encodedKeys = Buffer.from(keys, "ascii").toString("base64");
  const command = `
$definition = @'
using System;
using System.Runtime.InteropServices;
public static class MknotePhase1aImeInput
{
    [DllImport("user32.dll")] public static extern uint SendInput(uint count, IntPtr inputs, int size);
    [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hwnd);
    [DllImport("user32.dll")] public static extern IntPtr LoadKeyboardLayout(string id, uint flags);
    [DllImport("user32.dll")] public static extern bool PostMessage(IntPtr hwnd, uint message, IntPtr wParam, IntPtr lParam);
    [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hwnd, out uint processId);
    [DllImport("user32.dll")] public static extern IntPtr GetKeyboardLayout(uint threadId);
}
'@
Add-Type -TypeDefinition $definition -ErrorAction Stop
$process = Get-Process -Name '${targetProcessName}' -ErrorAction SilentlyContinue |
    Where-Object { $_.MainWindowHandle -ne 0 } |
    Sort-Object StartTime -Descending |
    Select-Object -First 1
if (-not $process) { throw 'Phase 1A IME harness window was not found' }
$hwnd = $process.MainWindowHandle
$hkl = [MknotePhase1aImeInput]::LoadKeyboardLayout('00000804', 1)
if ($hkl -eq [IntPtr]::Zero) { throw 'Microsoft Pinyin keyboard layout 00000804 is unavailable' }
[void][MknotePhase1aImeInput]::PostMessage($hwnd, 0x0050, [IntPtr]::Zero, $hkl)
[void][MknotePhase1aImeInput]::SetForegroundWindow($hwnd)
Start-Sleep -Milliseconds 150
Add-Type -AssemblyName System.Windows.Forms
foreach ($key in [Convert]::FromBase64String('${encodedKeys}')) {
    [System.Windows.Forms.SendKeys]::SendWait(([char]$key).ToString())
    Start-Sleep -Milliseconds ${delayMs}
}
[void][MknotePhase1aImeInput]::SetForegroundWindow($hwnd)
$processId = [uint32]0
$threadId = [MknotePhase1aImeInput]::GetWindowThreadProcessId($hwnd, [ref]$processId)
Write-Output ([MknotePhase1aImeInput]::GetKeyboardLayout($threadId).ToInt64().ToString('X'))
`;
  return runPowerShell(command);
}

function sendMicrosoftPinyinContinuation(keys, delayMs = 35) {
  const encodedKeys = Buffer.from(keys, "ascii").toString("base64");
  const command = `
$ErrorActionPreference = 'Stop'
$definition = @'
using System;
using System.Runtime.InteropServices;
public static class MknotePhase1aImeContinuation
{
    [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hwnd);
}
'@
Add-Type -TypeDefinition $definition -ErrorAction Stop
$process = Get-Process -Name '${targetProcessName}' -ErrorAction SilentlyContinue |
    Where-Object { $_.MainWindowHandle -ne 0 } |
    Sort-Object StartTime -Descending |
    Select-Object -First 1
if (-not $process) { throw 'Phase 1A IME harness window was not found for continuation' }
[void][MknotePhase1aImeContinuation]::SetForegroundWindow($process.MainWindowHandle)
Start-Sleep -Milliseconds 50
Add-Type -AssemblyName System.Windows.Forms
foreach ($key in [Convert]::FromBase64String('${encodedKeys}')) {
  [System.Windows.Forms.SendKeys]::SendWait(([char]$key).ToString())
  Start-Sleep -Milliseconds ${delayMs}
}
`;
  return runPowerShell(command);
}

function sendMicrosoftPinyinStableKey(scanCode, delayMs = 35) {
  const command = scanCode === SCAN_ESCAPE
    ? `
Add-Type -AssemblyName System.Windows.Forms
[System.Windows.Forms.SendKeys]::SendWait('{ESC}')
Start-Sleep -Milliseconds ${delayMs}
`
    : `
Add-Type -AssemblyName System.Windows.Forms
[System.Windows.Forms.SendKeys]::SendWait('{ENTER}')
Start-Sleep -Milliseconds ${delayMs}
`;
  runPowerShell(command);
}

function sendMicrosoftPinyinEnter(delayMs = 35) {
  return sendMicrosoftPinyinScanCode(SCAN_ENTER, delayMs);
}

function sendMicrosoftPinyinScanCode(scanCode, delayMs = 35) {
  if (scanCode === SCAN_ESCAPE || scanCode === SCAN_ENTER) {
    sendMicrosoftPinyinStableKey(scanCode, delayMs);
    return;
  }

  const extendedKeyFlag =
    scanCode === SCAN_PAGEDOWN || scanCode === SCAN_DOWN ? 1 : 0;
  const virtualKey = scanCode === SCAN_SHIFT ? VK_SHIFT : 0;
  const useScanCode = scanCode !== SCAN_SHIFT;
  const command = `
$ErrorActionPreference = 'Stop'
$definition = @'
using System;
using System.Runtime.InteropServices;

[StructLayout(LayoutKind.Sequential)]
public struct MknotePhase1aKeyboardInput
{
 public ushort virtualKey;
 public ushort scanCode;
 public uint flags;
 public uint time;
 public IntPtr extraInfo;
}

[StructLayout(LayoutKind.Explicit)]
public struct MknotePhase1aInputUnion
{
 [FieldOffset(0)] public MknotePhase1aKeyboardInput keyboard;
}

[StructLayout(LayoutKind.Sequential)]
public struct MknotePhase1aInput
{
 public uint type;
 public MknotePhase1aInputUnion union;
}

public static class MknotePhase1aImeScanCode
{
 [DllImport("user32.dll")]
 public static extern bool SetForegroundWindow(IntPtr hwnd);

 [DllImport("user32.dll", SetLastError = true)]
 public static extern void keybd_event(byte virtualKey, byte scanCode, uint flags, UIntPtr extraInfo);

 [DllImport("user32.dll", SetLastError = true)]
 public static extern uint SendInput(uint count, MknotePhase1aInput[] inputs, int size);

 public static void Tap(IntPtr hwnd, ushort virtualKey, ushort scanCode, bool useScanCode)
 {
  SetForegroundWindow(hwnd);
  const uint KEYEVENTF_SCANCODE = 0x0008;
  const uint KEYEVENTF_KEYUP = 0x0002;

  if (!useScanCode)
  {
   var inputs = new MknotePhase1aInput[2];
   inputs[0].type = 1;
   inputs[0].union.keyboard.virtualKey = virtualKey;
   inputs[1].type = 1;
   inputs[1].union.keyboard.virtualKey = virtualKey;
   inputs[1].union.keyboard.flags = KEYEVENTF_KEYUP;
   var sent = SendInput(2, inputs, Marshal.SizeOf(typeof(MknotePhase1aInput)));
   if (sent != 2) throw new InvalidOperationException("SendInput did not complete virtual-key pair");
   return;
  }

  const uint KEYEVENTF_EXTENDEDKEY = ${extendedKeyFlag ? 0x0001 : 0};
 var flags = useScanCode ? KEYEVENTF_SCANCODE : 0;
 flags |= KEYEVENTF_EXTENDEDKEY;
 keybd_event((byte)virtualKey, (byte)scanCode, flags, UIntPtr.Zero);
 keybd_event((byte)virtualKey, (byte)scanCode, flags | KEYEVENTF_KEYUP, UIntPtr.Zero);
 }
}
'@
Add-Type -TypeDefinition $definition -ErrorAction Stop
$process = Get-Process -Name '${targetProcessName}' -ErrorAction SilentlyContinue |
 Where-Object { $_.MainWindowHandle -ne 0 } |
 Sort-Object StartTime -Descending |
 Select-Object -First 1
if (-not $process) { throw 'Phase 1A IME harness window was not found for scan code' }
Start-Sleep -Milliseconds 100
[MknotePhase1aImeScanCode]::Tap($process.MainWindowHandle, [uint16]${virtualKey}, [uint16]${scanCode}, ${useScanCode ? "$true" : "$false"})
Start-Sleep -Milliseconds ${delayMs}
`;
  return runPowerShell(command);
}

function getTargetKeyboardLayout() {
  const command = `
$definition = @'
using System;
using System.Runtime.InteropServices;
public static class MknotePhase1aImeLayoutRead
{
    [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hwnd, out uint processId);
    [DllImport("user32.dll")] public static extern IntPtr GetKeyboardLayout(uint threadId);
}
'@
Add-Type -TypeDefinition $definition -ErrorAction Stop
$process = Get-Process -Name '${targetProcessName}' -ErrorAction SilentlyContinue |
    Where-Object { $_.MainWindowHandle -ne 0 } |
    Sort-Object StartTime -Descending |
    Select-Object -First 1
if (-not $process) { throw 'Phase 1A IME harness window was not found for layout read' }
$processId = [uint32]0
$threadId = [MknotePhase1aImeLayoutRead]::GetWindowThreadProcessId($process.MainWindowHandle, [ref]$processId)
Write-Output ([MknotePhase1aImeLayoutRead]::GetKeyboardLayout($threadId).ToInt64().ToString('X'))
`;
  return runPowerShell(command);
}

function sendControlKey(key) {
  const command = `
$process = Get-Process -Name '${targetProcessName}' -ErrorAction SilentlyContinue |
    Where-Object { $_.MainWindowHandle -ne 0 } |
    Sort-Object StartTime -Descending |
    Select-Object -First 1
if (-not $process) { throw 'Phase 1A IME harness window was not found for undo/redo' }
Add-Type -AssemblyName System.Windows.Forms
[void][System.Windows.Forms.SendKeys]::SendWait('^${key}')
`;
  return runPowerShell(command);
}

function loadTargetKeyboardLayout(layoutHex) {
  const layoutId = layoutHex.padStart(8, "0").slice(-4);
  const command = `
$definition = @'
using System;
using System.Runtime.InteropServices;
public static class MknotePhase1aImeLayoutRestore
{
    [DllImport("user32.dll")] public static extern IntPtr LoadKeyboardLayout(string id, uint flags);
    [DllImport("user32.dll")] public static extern bool PostMessage(IntPtr hwnd, uint message, IntPtr wParam, IntPtr lParam);
    [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hwnd);
}
'@
Add-Type -TypeDefinition $definition -ErrorAction Stop
$process = Get-Process -Name '${targetProcessName}' -ErrorAction SilentlyContinue |
    Where-Object { $_.MainWindowHandle -ne 0 } |
    Sort-Object StartTime -Descending |
    Select-Object -First 1
if ($process) {
    $hkl = [MknotePhase1aImeLayoutRestore]::LoadKeyboardLayout('0000${layoutId}', 1)
    if ($hkl -eq [IntPtr]::Zero) {
        Write-Output 'not-available:layout-not-installed'
        exit 0
    }
    [void][MknotePhase1aImeLayoutRestore]::PostMessage($process.MainWindowHandle, 0x0050, [IntPtr]::Zero, $hkl)
    [void][MknotePhase1aImeLayoutRestore]::SetForegroundWindow($process.MainWindowHandle)
    Write-Output 'available'
} else {
    Write-Output 'not-available:harness-window-not-found'
}
`;
  return runPowerShell(command);
}

function restoreTargetKeyboardLayout(layoutHex) {
  loadTargetKeyboardLayout(layoutHex);
}

async function waitForCdp() {
  await poll(async () => {
    try {
      const response = await fetch(`http://127.0.0.1:${cdpPort}/json/list`);
      return response.ok;
    } catch {
      return false;
    }
  }, imeCdpTimeoutMs, 250);
}

async function waitForReady(page) {
  const status = page.locator("#editor-status");
  try {
    await status.waitFor({ state: "visible", timeout: imeReadyTimeoutMs });
    await poll(
      async () => (await status.getAttribute("data-state")) === "ready",
      imeReadyTimeoutMs,
    );
    await page
      .locator(".ProseMirror")
      .waitFor({ state: "visible", timeout: imeReadyTimeoutMs });
  } catch (error) {
    try {
      error.readyDiagnostics = await captureReadyDiagnostics(page, browserEvents);
    } catch (diagnosticError) {
      error.readyDiagnostics = {
        classification: "diagnostic-capture-failed",
        error: String(
          diagnosticError?.stack ?? diagnosticError?.message ?? diagnosticError,
        ),
      };
    }
    throw error;
  }
}

async function clearEditor(page) {
  const editor = page.locator(".ProseMirror");
  await editor.click();
  await page.keyboard.press("Control+A");
  await page.keyboard.press("Backspace");
  await poll(async () => (await editor.innerText()).trim().length === 0);
}

async function editorText(page) {
  return page.locator(".ProseMirror").innerText();
}

async function startImeTrace(page) {
  await page.evaluate(() => {
    const editor = document.querySelector(".ProseMirror");
    if (!editor) throw new Error("IME trace editor is missing");
    const events = [
      "compositionstart",
      "compositionupdate",
      "compositionend",
      "keydown",
      "keyup",
      "beforeinput",
      "input",
    ];
    const trace = [];
    const listeners = events.map((type) => {
      const listener = (event) => {
        trace.push({
          type,
          key: event instanceof KeyboardEvent ? event.key : undefined,
          data: "data" in event ? event.data : undefined,
          inputType: event instanceof InputEvent ? event.inputType : undefined,
          isComposing: "isComposing" in event ? event.isComposing : undefined,
        });
      };
      editor.addEventListener(type, listener);
      return [type, listener];
    });
    window.__mknoteImeTrace = trace;
    window.__mknoteImeTraceCleanup = () => {
      for (const [type, listener] of listeners) {
        editor.removeEventListener(type, listener);
      }
    };
  });
}

async function finishImeTrace(page) {
  return page.evaluate(() => {
    window.__mknoteImeTraceCleanup?.();
    return window.__mknoteImeTrace ?? [];
  });
}

async function captureLargeEditorSnapshot(page) {
  return page.evaluate(() => {
    const root = document.querySelector(".ProseMirror");
    if (!(root instanceof HTMLElement)) {
      throw new Error("large editor input snapshot root missing");
    }

    const directBlocks = Array.from(root.children);
    const visibleDirectBlockCount = directBlocks.filter(
      (block) =>
        block instanceof HTMLElement &&
        getComputedStyle(block).display !== "none" &&
        block.getClientRects().length > 0,
    ).length;
    const selection = document.getSelection();
    const activeElement = document.activeElement;

    return {
      containsChinese: root.textContent?.includes("你好") ?? false,
      documentVisibility: document.visibilityState,
      hasFocus: document.hasFocus(),
      activeElementTag: activeElement?.tagName ?? null,
      activeElementClass:
        activeElement instanceof HTMLElement ? activeElement.className : null,
      contentEditable: root.contentEditable,
      rootConnected: root.isConnected,
      rootChildCount: root.children.length,
      descendantElementCount: root.querySelectorAll("*").length,
      tableCount: root.querySelectorAll("table").length,
      tableRowCount: root.querySelectorAll("tr").length,
      tableCellCount: root.querySelectorAll("td, th").length,
      visibleDirectBlockCount,
      hiddenDirectBlockCount: directBlocks.length - visibleDirectBlockCount,
      textContentLength: root.textContent?.length ?? 0,
      selection: selection
        ? {
            anchorNode: selection.anchorNode?.nodeName ?? null,
            anchorOffset: selection.anchorOffset,
            focusNode: selection.focusNode?.nodeName ?? null,
            focusOffset: selection.focusOffset,
          }
        : null,
    };
  });
}

function countImeEvents(trace) {
  return trace.reduce((counts, event) => {
    counts[event.type] = (counts[event.type] ?? 0) + 1;
    return counts;
  }, {});
}

async function tryCaptureLargeEditorSnapshot(page) {
  try {
    return await captureLargeEditorSnapshot(page);
  } catch {
    return null;
  }
}

async function tryFinishImeTrace(page) {
  try {
    return await finishImeTrace(page);
  } catch {
    return [];
  }
}

async function runLargeEditorInput(page) {
  const editor = page.locator(".ProseMirror");
  await page.bringToFront();
  await editor.click({ position: { x: 40, y: 24 } });
  await startImeTrace(page);
  const beforeInputSnapshot = await captureLargeEditorSnapshot(page);

  const startedAt = Date.now();
  let layout = null;
  try {
    layout = sendMicrosoftPinyinKeys("nihao", imeKeyDelayMs);
    sendMicrosoftPinyinContinuation(" ", imeKeyDelayMs);
    await poll(
      async () =>
        page.evaluate(() =>
          document.querySelector(".ProseMirror")?.textContent?.includes("你好"),
        ),
      15000,
    );

  } catch (error) {
    if (/Target crashed/i.test(String(error?.message ?? error))) {
      rendererCrashed = true;
    }
    const trace = await tryFinishImeTrace(page);
    const detail = {
      phase: "large-editor-input",
      layout,
      elapsedMs: Date.now() - startedAt,
      rendererCrashed,
      pageClosed: page.isClosed(),
      beforeInputSnapshot,
      afterInputSnapshot: await tryCaptureLargeEditorSnapshot(page),
      eventCounts: countImeEvents(trace),
      trace,
    };
    const wrappedError = new Error(
      `large editor OS input failed: ${JSON.stringify(detail)}`,
      { cause: error },
    );
    wrappedError.detail = detail;
    throw wrappedError;
  }

  const osInputToObservedTextMs = Date.now() - startedAt;
  const trace = await finishImeTrace(page);
  const legacySnapshot = await page.evaluate(() => {
    const root = document.querySelector(".ProseMirror");
    if (!(root instanceof HTMLElement)) {
      throw new Error("large editor input snapshot root is missing");
    }

    const directBlocks = Array.from(root.children);
    const visibleDirectBlockCount = directBlocks.filter(
      (block) =>
        block instanceof HTMLElement &&
        getComputedStyle(block).display !== "none" &&
        block.getClientRects().length > 0,
    ).length;

    return {
      containsChinese: root.textContent?.includes("你好") ?? false,
      rootChildCount: root.children.length,
      descendantElementCount: root.querySelectorAll("*").length,
      visibleDirectBlockCount,
      hiddenDirectBlockCount: directBlocks.length - visibleDirectBlockCount,
      textContentLength: root.textContent?.length ?? 0,
    };
  });
  const eventCounts = trace.reduce((counts, event) => {
    counts[event.type] = (counts[event.type] ?? 0) + 1;
    return counts;
  }, {});

  const snapshot = {
    ...legacySnapshot,
    ...(await captureLargeEditorSnapshot(page)),
  };
  if (!snapshot.containsChinese || (eventCounts.input ?? 0) === 0) {
    throw new Error(
      `large editor OS input mismatch: ${JSON.stringify({
        layout,
        snapshot,
        eventCounts,
      })}`,
    );
  }

  return {
    layout,
    osInputToObservedTextMs,
    snapshot,
    eventCounts,
    trace: trace.map(({ type, key, inputType, isComposing }) => ({
      type,
      key,
      inputType,
      isComposing,
    })),
  };
}

async function resetImeEditor(page) {
  await page.bringToFront();
  try {
    sendMicrosoftPinyinScanCode(SCAN_ESCAPE, imeKeyDelayMs);
  } catch {
    // The first reset can run before the WebView2 focus is fully established.
  }
  await clearEditor(page);
  await wait(imeCommitDelayMs);
}

async function ensureChinesePinyin(page) {
  let lastText = "";
  for (let attempt = 0; attempt < 2; attempt += 1) {
    await resetImeEditor(page);
    const layout = sendMicrosoftPinyinKeys("nihao", imeKeyDelayMs);
    sendMicrosoftPinyinContinuation(" ", imeKeyDelayMs);
    try {
      await poll(async () => (await editorText(page)).includes("你好"), 3000);
      await resetImeEditor(page);
      return layout;
    } catch {
      lastText = await editorText(page);
      sendMicrosoftPinyinScanCode(SCAN_SHIFT, imeKeyDelayMs);
    }
  }
  throw new Error(`Microsoft Pinyin Chinese mode unavailable: ${lastText}`);
}

async function switchPinyinToEnglish(page) {
  await ensureChinesePinyin(page);
  const englishLayoutStatus = loadTargetKeyboardLayout("00000409");
  if (englishLayoutStatus !== "available") {
    throw new NotAvailableError(
      "Microsoft English keyboard layout 00000409 is unavailable",
      { layout: "00000409", status: englishLayoutStatus },
    );
  }
  await wait(imeCommitDelayMs);
  sendMicrosoftPinyinContinuation("abc", imeKeyDelayMs);
  await wait(imeCommitDelayMs);
  const text = await editorText(page);
  if (text.trim() !== "abc") {
    throw new NotAvailableError(
      "Microsoft English keyboard layout 00000409 did not produce English text",
      { layout: "00000409", text },
    );
  }
  return {
    method: "keyboard-layout-00000409",
    toggle: () => restoreTargetKeyboardLayout("00000804"),
    text,
    observed: [{ method: "keyboard-layout-00000409", text }],
  };
}

async function check(name, action) {
  try {
    results[name] = { pass: true, status: "passed", detail: await action() };
  } catch (error) {
    if (error instanceof NotAvailableError) {
      results[name] = {
        pass: false,
        status: "not-available",
        reason: error.message,
        detail: error.detail,
      };
      return;
    }
    results[name] = {
      pass: false,
      status: "failed",
      error: String(error?.stack ?? error?.message ?? error),
      ...(error?.detail ? { detail: error.detail } : {}),
    };
  }
}

function stopHarness() {
  if (appProcess?.pid) {
    spawnSync("taskkill", ["/PID", String(appProcess.pid), "/T", "/F"], {
      stdio: "ignore",
      windowsHide: true,
    });
  }
  // The Tauri CLI may exit while Cargo remains alive. Kill only this harness
  // image so a failed probe cannot leak a WebView2 window into the next run.
  spawnSync(
    "taskkill",
    ["/IM", `${targetProcessName}.exe`, "/T", "/F"],
    { stdio: "ignore", windowsHide: true },
  );
}

async function removeSandbox() {
  let lastError;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
      fs.rmSync(sandbox, { recursive: true, force: true, maxRetries: 1 });
      return;
    } catch (error) {
      lastError = error;
      await wait(250);
    }
  }
  results.cleanup = {
    pass: false,
    error: String(lastError?.message ?? lastError),
  };
}

try {
  appProcess = spawn(
    process.execPath,
    [
      tauriCommand,
      "dev",
      "--config",
      configPath,
      "--config",
      devServerConfig,
    ],
    {
      cwd: pocRoot,
      env: {
        ...process.env,
        APPDATA: path.join(appData, "Roaming"),
        LOCALAPPDATA: path.join(appData, "Local"),
        TEMP: tempDir,
        TMP: tempDir,
        WEBVIEW2_USER_DATA_FOLDER: webviewData,
        WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${cdpPort}`,
        CARGO_TARGET_DIR: cargoTarget,
      },
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    },
  );
  appProcess.stdout?.on("data", (chunk) => childOutput.push(String(chunk)));
  appProcess.stderr?.on("data", (chunk) => childOutput.push(String(chunk)));

  await waitForCdp();
  browser = await chromium.connectOverCDP(`http://127.0.0.1:${cdpPort}`);
  const context = browser.contexts()[0];
  const page = await poll(() => context.pages()[0] ?? false, 15000, 100);
  page.on("crash", () => {
    rendererCrashed = true;
  });
  page.on("pageerror", (error) => {
    if (browserEvents.pageErrors.length < 50) {
      browserEvents.pageErrors.push(String(error?.stack ?? error?.message ?? error));
    }
  });
  page.on("console", (message) => {
    if (
      (message.type() === "error" || message.type() === "warning") &&
      browserEvents.consoleErrors.length < 50
    ) {
      browserEvents.consoleErrors.push({
        type: message.type(),
        text: message.text(),
        location: message.location(),
      });
    }
  });
  page.on("requestfailed", (request) => {
    if (browserEvents.requestFailures.length < 50) {
      browserEvents.requestFailures.push({
        method: request.method(),
        url: request.url(),
        failure: request.failure(),
      });
    }
  });
  page.on("response", (response) => {
    const url = response.url();
    if (
      browserEvents.responses.length < 100 &&
      (url.includes("/src/main.ts") ||
        url.includes("/@vite/") ||
        url.endsWith("/"))
    ) {
      browserEvents.responses.push({
        url,
        status: response.status(),
        statusText: response.statusText(),
      });
    }
  });
  await waitForReady(page);

  results["webview2-ready"] = {
    pass: true,
    detail: {
      cdpPort,
      devPort: imeDevPort,
      targetProcessName,
      url: page.url(),
      userAgent: await page.evaluate(() => navigator.userAgent),
    },
  };

  originalImeLayout = getTargetKeyboardLayout();

  if (imeScenario === "large-editor-input") {
    await check("real-os-input-large-editor", () => runLargeEditorInput(page));
  } else {
  await check("real-microsoft-pinyin-composition", async () => {
    await ensureChinesePinyin(page);
    const layout = sendMicrosoftPinyinKeys("nihao", imeKeyDelayMs);
    const duringComposition = await editorText(page);
    await wait(imeCommitDelayMs);
    sendMicrosoftPinyinContinuation(" ", imeKeyDelayMs);
    await poll(async () => (await editorText(page)).includes("你好"), 8000);
    const committed = await editorText(page);
    sendControlKey("z");
    await poll(async () => !(await editorText(page)).includes("你好"), 5000);
    const afterUndo = await editorText(page);
    sendControlKey("y");
    await poll(async () => (await editorText(page)).includes("你好"), 5000);
    const afterRedo = await editorText(page);

    if (!committed.includes("你好") || afterUndo.includes("你好") || !afterRedo.includes("你好")) {
      throw new Error(
        `IME transaction mismatch: ${JSON.stringify({ layout, duringComposition, committed, afterUndo, afterRedo })}`,
      );
    }
    return { layout, duringComposition, committed, afterUndo, afterRedo };
  });

  await check("real-microsoft-pinyin-commit-keys", async () => {
    await ensureChinesePinyin(page);
    const spaceLayout = sendMicrosoftPinyinKeys("nihao", imeKeyDelayMs);
    sendMicrosoftPinyinContinuation(" ", imeKeyDelayMs);
    await poll(async () => (await editorText(page)).includes("你好"), 8000);
    const afterSpace = await editorText(page);

    await resetImeEditor(page);
    await startImeTrace(page);
    const enterLayout = sendMicrosoftPinyinKeys("zhongguo", imeKeyDelayMs);
    await page.bringToFront();
    sendMicrosoftPinyinEnter(imeKeyDelayMs);
    await wait(imeCommitDelayMs * 2);
    const afterEnter = await editorText(page);
    const trace = await finishImeTrace(page);
    const enterKeySeen = trace.some(
      (event) => event.type === "keydown" && event.key === "Enter",
    );
    const compositionEnded = trace.some(
      (event) => event.type === "compositionend",
    );

    if (
      !afterSpace.includes("你好") ||
      /\bnihao\b/i.test(afterSpace) ||
      !enterKeySeen ||
      !compositionEnded
    ) {
      throw new Error(
        `IME commit-key mismatch: ${JSON.stringify({
          spaceLayout,
          enterLayout,
          afterSpace,
          afterEnter,
          enterKeySeen,
          compositionEnded,
          trace,
        })}`,
      );
    }

    return {
      spaceLayout,
      enterLayout,
      afterSpace,
      afterEnter,
      enterKeySeen,
      compositionEnded,
      trace,
    };
  });

  await check("real-microsoft-pinyin-candidate-paging", async () => {
    await ensureChinesePinyin(page);
    const firstCandidateLayout = sendMicrosoftPinyinKeys("shi", imeKeyDelayMs);
    await wait(imeCommitDelayMs);
    sendMicrosoftPinyinContinuation(" ", imeKeyDelayMs);
    await wait(imeCommitDelayMs * 2);
    const firstCandidate = await editorText(page);

    const pagingAttempts = [
      {
        method: "page-down",
        action: () => sendMicrosoftPinyinScanCode(SCAN_PAGEDOWN, imeKeyDelayMs),
      },
      {
        method: "down-arrow",
        action: () => sendMicrosoftPinyinScanCode(SCAN_DOWN, imeKeyDelayMs),
      },
  ];
  const observed = [];
  let pagedCandidateLayout = "";
  let pagedCandidate = "";
  let confirmedPaging = null;

    for (const attempt of pagingAttempts) {
      await resetImeEditor(page);
      pagedCandidateLayout = sendMicrosoftPinyinKeys("shi", imeKeyDelayMs);
      await wait(imeCommitDelayMs);
      await page.bringToFront();
      attempt.action();
      await wait(imeCommitDelayMs);
      sendMicrosoftPinyinContinuation(" ", imeKeyDelayMs);
      await wait(imeCommitDelayMs * 2);
    const candidateText = await editorText(page);
    const candidateChanged =
      candidateText.trim() &&
      candidateText !== firstCandidate &&
      !/\bshi\b/i.test(candidateText);
    observed.push({
      method: attempt.method,
      text: candidateText,
      candidateChanged,
    });
    if (candidateChanged) {
      pagedCandidate = candidateText;
      confirmedPaging = { method: attempt.method, text: candidateText };
      break;
    }
  }

  if (!confirmedPaging) {
    throw new NotAvailableError(
      "Microsoft Pinyin candidate paging not-available: no paging key changed the candidate",
      {
        firstCandidateLayout,
        pagedCandidateLayout,
        firstCandidate,
        observed,
      },
    );
  }

    return { firstCandidateLayout, pagedCandidateLayout, firstCandidate, pagedCandidate, observed };
  });

  await check("real-microsoft-pinyin-language-switch", async () => {
    const englishMode = await switchPinyinToEnglish(page);
    const englishText = englishMode.text;
    englishMode.toggle();
    sendMicrosoftPinyinContinuation("nihao ", imeKeyDelayMs);
    await poll(
      async () => (await editorText(page)).includes("你好"),
      8000,
    );
    const mixedText = await editorText(page);

    if (
      englishText.trim() !== "abc" ||
      !mixedText.includes("abc") ||
      (mixedText.match(/你好/g) ?? []).length < 1 ||
      /\bnihao\b/i.test(mixedText)
    ) {
      throw new Error(
        `IME language-switch mismatch: ${JSON.stringify({
          method: englishMode.method,
          observed: englishMode.observed,
          englishText,
          mixedText,
        })}`,
      );
    }

    return {
      method: englishMode.method,
      observed: englishMode.observed,
      englishText,
      mixedText,
    };
  });

  await check("real-microsoft-pinyin-punctuation", async () => {
    await ensureChinesePinyin(page);
    const layout = sendMicrosoftPinyinKeys("nihao", imeKeyDelayMs);
    sendMicrosoftPinyinContinuation(" ", imeKeyDelayMs);
    await poll(async () => (await editorText(page)).includes("你好"), 8000);
    sendMicrosoftPinyinContinuation(",", imeKeyDelayMs);
    await poll(async () => (await editorText(page)).includes("，"), 8000);
    const text = await editorText(page);

    if (!text.includes("你好，") || text.includes("你好,")) {
      throw new Error(
        `IME punctuation mismatch: ${JSON.stringify({ layout, text })}`,
      );
    }

    return { layout, text };
  });

  await check("real-microsoft-pinyin-mouse-selection-replacement", async () => {
    await ensureChinesePinyin(page);
    const layout = sendMicrosoftPinyinKeys("nihao shijie ", imeKeyDelayMs);
    await poll(async () => (await editorText(page)).includes("你好世界"), 8000);

    const paragraph = page
      .locator(".ProseMirror p")
      .filter({ hasText: "你好世界" })
      .first();
    const box = await paragraph.boundingBox();
    if (!box || box.width < 12 || box.height < 8) {
      throw new Error(`selection target has no usable bounds: ${JSON.stringify(box)}`);
    }

    await page.bringToFront();
    const y = box.y + box.height / 2;
    await page.mouse.move(box.x + box.width - 3, y);
    await page.mouse.down();
    await page.mouse.move(box.x + 3, y, { steps: 8 });
    await page.mouse.up();
    const selected = await page.evaluate(() => window.getSelection()?.toString() ?? "");
    if (selected.replace(/\s/g, "") !== "你好世界") {
      throw new Error(
        `mouse selection mismatch: ${JSON.stringify({ layout, selected })}`,
      );
    }

    sendMicrosoftPinyinContinuation("nihao ", imeKeyDelayMs);
    await poll(async () => (await editorText(page)).includes("你好"), 8000);
    const replaced = await editorText(page);
    if (!replaced.includes("你好") || replaced.includes("世界")) {
      throw new Error(
        `mouse replacement mismatch: ${JSON.stringify({ layout, selected, replaced })}`,
      );
    }

    return { layout, selected, replaced };
  });

  await check("real-microsoft-pinyin-1000-composition", async () => {
    await ensureChinesePinyin(page);
    const expectedCount = 1000;
    const layout = sendMicrosoftPinyinKeys("ni ".repeat(expectedCount), imeKeyDelayMs);
    await wait(2500);
    const text = await editorText(page);
    const actualCount = (text.match(/你/g) ?? []).length;
    if (actualCount !== expectedCount || /\bni\b/i.test(text)) {
      throw new Error(
        `1000 composition mismatch: ${JSON.stringify({ layout, expectedCount, actualCount, textLength: text.length })}`,
      );
    }
    return {
      layout,
      expectedCount,
      actualCount,
      textLength: text.length,
      imeKeyDelayMs,
    };
  });

  }

  if (rendererCrashed || page.isClosed()) {
    results.screenshot = {
      pass: false,
      status: "not-available",
      reason: "renderer-crashed",
    };
  } else {
    try {
      await page.screenshot({ path: screenshotPath, fullPage: false });
    } catch (error) {
      if (rendererCrashed || /Target crashed/i.test(String(error?.message ?? error))) {
        rendererCrashed = true;
        results.screenshot = {
          pass: false,
          status: "not-available",
          reason: "renderer-crashed",
        };
      } else {
        throw error;
      }
    }
  }
} catch (error) {
  results.fatal = {
    pass: false,
    error: String(error?.stack ?? error?.message ?? error),
    ...(error?.readyDiagnostics
      ? { readyDiagnostics: error.readyDiagnostics }
      : {}),
    harnessOutput: childOutput.join("").slice(-8000),
  };
} finally {
  if (originalImeLayout) {
    try {
      restoreTargetKeyboardLayout(originalImeLayout);
    } catch (error) {
      results.imeRestore = { pass: false, error: String(error?.message ?? error) };
    }
  }
  if (browser) await browser.close().catch(() => {});
  stopHarness();
  await removeSandbox();
}

fs.writeFileSync(
  reportPath,
  JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      harness: configPath,
      protocol: {
        scenario: imeScenario,
        benchmarkBytes,
        benchmarkFixture,
        benchmarkTableCount,
        benchmarkEditorProfile,
        cdpPort,
        devPort: imeDevPort,
        keyDelayMs: imeKeyDelayMs,
        readyTimeoutMs: imeReadyTimeoutMs,
      },
      runtime: { rendererCrashed },
      results,
    },
    null,
    2,
  ),
  "utf8",
);

const failed = Object.values(results).filter((result) => result.pass === false).length;
console.log(
  JSON.stringify(
    { report: reportPath, screenshot: screenshotPath, results, failed },
    null,
    2,
  ),
);
process.exitCode = failed === 0 ? 0 : 1;
