/**
 * Phase 0 WebView2 补充探针：鼠标选区、图片粘贴和 Popout 窗口。
 *
 * 该脚本只复制 Release 到临时目录，并使用隔离的用户数据和笔记目录。
 * 它不接管生产保存，也不改变生产编辑器实现。
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawn } from "node:child_process";

const playwrightModule = process.env.MKN_PLAYWRIGHT_MODULE ?? "playwright";
const playwrightExports = await import(playwrightModule);
const chromium = playwrightExports.chromium ?? playwrightExports.default?.chromium;
if (!chromium) {
  throw new Error(`Playwright module does not expose chromium: ${playwrightModule}`);
}

const root = process.cwd();
const executable = path.join(root, "src-tauri", "target", "release", "md-sticky-note.exe");
const artifactDir = path.join(root, ".codex-smoke");
const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "mknote-webview2-extra-"));
const appRoot = path.join(sandbox, "App");
const appData = path.join(sandbox, "AppData", "Roaming");
const localAppData = path.join(sandbox, "AppData", "Local");
const tempDir = path.join(sandbox, "Temp");
const notePath = path.join(appRoot, "File", "default", "default-note.md");
const reportPath = path.join(artifactDir, "visual-editor-webview2-extra-e2e.json");
const screenshotPath = path.join(artifactDir, "visual-editor-webview2-extra-e2e.png");
const port = Number(process.env.MKN_WEBVIEW2_EXTRA_CDP_PORT ?? 9239);
const rasterPngBase64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

for (const directory of [path.dirname(notePath), appData, localAppData, tempDir, artifactDir]) {
  fs.mkdirSync(directory, { recursive: true });
}
fs.copyFileSync(executable, path.join(appRoot, "md-sticky-note.exe"));
fs.writeFileSync(notePath, "Phase 0 extra probe\n", "utf8");

const results = {};
let browser;
let processHandle;

async function check(name, action) {
  try {
    results[name] = { pass: true, detail: await action() };
  } catch (error) {
    results[name] = { pass: false, error: String(error?.message ?? error) };
  }
}

async function enterPreview(page) {
  const preview = page.locator('[data-testid="mknote-preview-editor"]');
  if (await preview.isVisible().catch(() => false)) return;
  const toggle = page.locator('button[aria-label="预览"]');
  await toggle.waitFor({ state: "visible", timeout: 15000 });
  await toggle.click();
  await preview.waitFor({ state: "visible", timeout: 15000 });
}

async function editorText(page) {
  return page.locator('[data-testid="mknote-preview-editor"]').innerText();
}

async function replaceEditorText(page, text) {
  const editor = page.locator('[data-testid="mknote-preview-editor"]');
  await editor.click();
  await page.keyboard.press("Control+A");
  await page.keyboard.type(text);
  await page.waitForTimeout(120);
}

async function writeHtmlClipboard(page, html, plainText) {
  await page.evaluate(async ({ html: htmlValue, plain }) => {
    await navigator.clipboard.write([
      new ClipboardItem({
        "text/html": new Blob([htmlValue], { type: "text/html" }),
        "text/plain": new Blob([plain], { type: "text/plain" }),
      }),
    ]);
  }, { html, plain: plainText });
}

async function writeImageClipboard(page) {
  await page.evaluate(async (base64) => {
    const binary = atob(base64);
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    const blob = new Blob([bytes], { type: "image/png" });
    await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
  }, rasterPngBase64);
}

function sendMicrosoftPinyinKeys(keys, delayMs = 35) {
  const encodedKeys = Buffer.from(keys, "ascii").toString("base64");
  const script = `
$definition = @'
using System;
using System.Runtime.InteropServices;
public static class MknoteImeInput {
  [StructLayout(LayoutKind.Sequential)]
  public struct KEYBDINPUT {
    public ushort wVk;
    public ushort wScan;
    public uint dwFlags;
    public uint time;
    public UIntPtr dwExtraInfo;
  }
  [StructLayout(LayoutKind.Sequential)]
  public struct INPUT {
    public uint type;
    public KEYBDINPUT ki;
  }
  [DllImport("user32.dll")] public static extern uint SendInput(uint count, INPUT[] inputs, int size);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hwnd);
  [DllImport("user32.dll")] public static extern IntPtr LoadKeyboardLayout(string id, uint flags);
  [DllImport("user32.dll")] public static extern bool PostMessage(IntPtr hwnd, uint message, IntPtr wParam, IntPtr lParam);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hwnd, out uint processId);
  [DllImport("user32.dll")] public static extern IntPtr GetKeyboardLayout(uint threadId);
  public static void KeyDown(ushort key) {
    var input = new INPUT { type = 1, ki = new KEYBDINPUT { wVk = key } };
    SendInput(1, new[] { input }, Marshal.SizeOf(typeof(INPUT)));
  }
  public static void KeyUp(ushort key) {
    var input = new INPUT { type = 1, ki = new KEYBDINPUT { wVk = key, dwFlags = 2 } };
    SendInput(1, new[] { input }, Marshal.SizeOf(typeof(INPUT)));
  }
  public static void Tap(ushort key) { KeyDown(key); KeyUp(key); }
}
'@
Add-Type -TypeDefinition $definition -ErrorAction Stop
$process = Get-Process -Name 'md-sticky-note' -ErrorAction SilentlyContinue |
  Where-Object { $_.MainWindowHandle -ne 0 } | Select-Object -First 1
if (-not $process) { throw 'MDnote main window was not found' }
$hwnd = $process.MainWindowHandle
$hkl = [MknoteImeInput]::LoadKeyboardLayout('00000804', 1)
if ($hkl -eq [IntPtr]::Zero) { throw 'Microsoft Pinyin keyboard layout 00000804 is unavailable' }
[void][MknoteImeInput]::PostMessage($hwnd, 0x0050, [IntPtr]::Zero, $hkl)
[void][MknoteImeInput]::SetForegroundWindow($hwnd)
Start-Sleep -Milliseconds 120
Add-Type -AssemblyName System.Windows.Forms
foreach ($key in [Convert]::FromBase64String('${encodedKeys}')) {
  $sendKey = ([char]$key).ToString()
  [System.Windows.Forms.SendKeys]::SendWait($sendKey)
  Start-Sleep -Milliseconds ${delayMs}
}
[void][MknoteImeInput]::SetForegroundWindow($hwnd)
Write-Output ([MknoteImeInput]::GetKeyboardLayout(
  [MknoteImeInput]::GetWindowThreadProcessId($hwnd, [ref]([uint32]0))
)).ToInt64().ToString('X')
`;
  return execFileSync("powershell.exe", [
    "-NoProfile",
    "-NonInteractive",
    "-WindowStyle",
    "Hidden",
    "-Command",
    script,
  ], { encoding: "utf8", windowsHide: true }).trim();
}

function getTargetKeyboardLayout() {
  const script = `
$definition = @'
using System;
using System.Runtime.InteropServices;
public static class MknoteImeLayoutRead {
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hwnd, out uint processId);
  [DllImport("user32.dll")] public static extern IntPtr GetKeyboardLayout(uint threadId);
}
'@
Add-Type -TypeDefinition $definition -ErrorAction Stop
$process = Get-Process -Name 'md-sticky-note' -ErrorAction SilentlyContinue |
  Where-Object { $_.MainWindowHandle -ne 0 } | Select-Object -First 1
if (-not $process) { throw 'MDnote main window was not found for layout read' }
$processId = [uint32]0
$threadId = [MknoteImeLayoutRead]::GetWindowThreadProcessId($process.MainWindowHandle, [ref]$processId)
[MknoteImeLayoutRead]::GetKeyboardLayout($threadId).ToInt64().ToString('X')
`;
  return execFileSync("powershell.exe", [
    "-NoProfile",
    "-NonInteractive",
    "-WindowStyle",
    "Hidden",
    "-Command",
    script,
  ], { encoding: "utf8", windowsHide: true }).trim();
}

function restoreTargetKeyboardLayout(layoutHex) {
  const layoutId = layoutHex.padStart(8, "0").slice(-4);
  const script = `
$definition = @'
using System;
using System.Runtime.InteropServices;
public static class MknoteImeLayoutRestore {
  [DllImport("user32.dll")] public static extern IntPtr LoadKeyboardLayout(string id, uint flags);
  [DllImport("user32.dll")] public static extern bool PostMessage(IntPtr hwnd, uint message, IntPtr wParam, IntPtr lParam);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hwnd);
}
'@
Add-Type -TypeDefinition $definition -ErrorAction Stop
$process = Get-Process -Name 'md-sticky-note' -ErrorAction SilentlyContinue |
  Where-Object { $_.MainWindowHandle -ne 0 } | Select-Object -First 1
if ($process) {
  $hkl = [MknoteImeLayoutRestore]::LoadKeyboardLayout('0000${layoutId}', 1)
  [void][MknoteImeLayoutRestore]::PostMessage($process.MainWindowHandle, 0x0050, [IntPtr]::Zero, $hkl)
  [void][MknoteImeLayoutRestore]::SetForegroundWindow($process.MainWindowHandle)
}
`;
  execFileSync("powershell.exe", [
    "-NoProfile",
    "-NonInteractive",
    "-WindowStyle",
    "Hidden",
    "-Command",
    script,
  ], { encoding: "utf8", windowsHide: true });
}

function sendMicrosoftPinyinUndoRedoKey(key) {
  const script = `
$definition = @'
using System;
using System.Runtime.InteropServices;
public static class MknoteImeUndoInput {
  [StructLayout(LayoutKind.Sequential)] public struct KEYBDINPUT { public ushort wVk; public ushort wScan; public uint dwFlags; public uint time; public UIntPtr dwExtraInfo; }
  [StructLayout(LayoutKind.Sequential)] public struct INPUT { public uint type; public KEYBDINPUT ki; }
  [DllImport("user32.dll")] public static extern uint SendInput(uint count, INPUT[] inputs, int size);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hwnd);
  public static void Tap(ushort key, bool control) {
    var list = new System.Collections.Generic.List<INPUT>();
    if (control) list.Add(new INPUT { type = 1, ki = new KEYBDINPUT { wVk = 0x11 } });
    list.Add(new INPUT { type = 1, ki = new KEYBDINPUT { wVk = key } });
    list.Add(new INPUT { type = 1, ki = new KEYBDINPUT { wVk = key, dwFlags = 2 } });
    if (control) list.Add(new INPUT { type = 1, ki = new KEYBDINPUT { wVk = 0x11, dwFlags = 2 } });
    SendInput((uint)list.Count, list.ToArray(), Marshal.SizeOf(typeof(INPUT)));
  }
}
'@
Add-Type -TypeDefinition $definition -ErrorAction Stop
$process = Get-Process -Name 'md-sticky-note' -ErrorAction SilentlyContinue |
  Where-Object { $_.MainWindowHandle -ne 0 } | Select-Object -First 1
if (-not $process) { throw 'MDnote main window was not found for undo/redo' }
[void][MknoteImeUndoInput]::SetForegroundWindow($process.MainWindowHandle)
Start-Sleep -Milliseconds 120
Add-Type -AssemblyName System.Windows.Forms
[System.Windows.Forms.SendKeys]::SendWait('^${key}')
`;
  return execFileSync("powershell.exe", [
    "-NoProfile",
    "-NonInteractive",
    "-WindowStyle",
    "Hidden",
    "-Command",
    script,
  ], { encoding: "utf8", windowsHide: true }).trim();
}

try {
  processHandle = spawn(path.join(appRoot, "md-sticky-note.exe"), [], {
    cwd: appRoot,
    env: {
      ...process.env,
      APPDATA: appData,
      LOCALAPPDATA: localAppData,
      TEMP: tempDir,
      TMP: tempDir,
      WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${port}`,
    },
    stdio: "ignore",
  });

  let cdpReady = false;
  for (let attempt = 0; attempt < 30 && !cdpReady; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 500));
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/list`);
      cdpReady = response.ok;
    } catch {
      cdpReady = false;
    }
  }
  if (!cdpReady) throw new Error("WebView2 CDP endpoint did not become reachable");

  browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
  const context = browser.contexts()[0];
  try {
    await context.grantPermissions(["clipboard-read", "clipboard-write"], {
      origin: "http://tauri.localhost",
    });
  } catch {
    // Clipboard permission failure is recorded by the image checks.
  }

  const page = context.pages()[0];
  await page.waitForSelector('[data-testid="mknote-editor-pane"]', {
    state: "visible",
    timeout: 15000,
  });
  await enterPreview(page);

  const originalImeLayout = getTargetKeyboardLayout();
  try {
    await check("real-microsoft-pinyin-composition", async () => {
    const editor = page.locator('[data-testid="mknote-preview-editor"]');
    await editor.click();
    await page.keyboard.press("Control+A");
    await page.keyboard.press("Backspace");
    await page.waitForTimeout(180);
    const layout = sendMicrosoftPinyinKeys("ni");
    const duringComposition = await editorText(page);
    sendMicrosoftPinyinKeys(" ");
    await page.waitForTimeout(500);
    const committed = await editorText(page);
    if (!committed.includes("你")) {
      throw new Error(`Microsoft Pinyin did not commit 你: ${JSON.stringify({ layout, duringComposition, committed })}`);
    }
    sendMicrosoftPinyinUndoRedoKey("z");
    await page.waitForTimeout(300);
    const afterUndo = await editorText(page);
    sendMicrosoftPinyinUndoRedoKey("y");
    await page.waitForTimeout(300);
    const afterRedo = await editorText(page);
    if (afterUndo.includes("你") || !afterRedo.includes("你")) {
      throw new Error(`IME undo transaction mismatch: ${JSON.stringify({ layout, duringComposition, committed, afterUndo, afterRedo })}`);
    }
    return { layout, duringComposition, committed, afterUndo, afterRedo };
    });

    await check("real-microsoft-pinyin-1000-composition", async () => {
    const editor = page.locator('[data-testid="mknote-preview-editor"]');
    const expectedCount = 1000;
    await editor.click();
    await page.keyboard.press("Control+A");
    await page.keyboard.press("Backspace");
    await page.waitForTimeout(180);
    const layout = sendMicrosoftPinyinKeys("ni ".repeat(expectedCount), 2);
    await page.waitForTimeout(2200);
    const text = await editorText(page);
    const normalized = text.replace(/\s/g, "");
    const actualCount = (normalized.match(/你/g) ?? []).length;
    if (actualCount !== expectedCount || normalized.includes("ni")) {
      throw new Error(`1000 composition mismatch: ${JSON.stringify({ layout, expectedCount, actualCount, textLength: normalized.length })}`);
    }
    return { layout, expectedCount, actualCount, textLength: normalized.length };
    });
  } finally {
    restoreTargetKeyboardLayout(originalImeLayout);
  }

  await check("mouse-selection-replace", async () => {
    const editor = page.locator('[data-testid="mknote-preview-editor"]');
    await replaceEditorText(page, "mouse selection source");
    const paragraph = editor.locator("p").first();
    const box = await paragraph.boundingBox();
    if (!box) throw new Error("paragraph bounding box unavailable");
    const y = box.y + box.height / 2;
    await page.mouse.move(box.x + Math.max(2, box.width - 3), y);
    await page.mouse.down();
    await page.mouse.move(box.x + 3, y, { steps: 8 });
    await page.mouse.up();
    await page.keyboard.type("mouse selection replacement");
    const text = await editorText(page);
    if (!text.includes("mouse selection replacement") || text.includes("mouse selection source")) {
      throw new Error(`mouse selection mismatch: ${JSON.stringify(text)}`);
    }
    return text;
  });

  await check("raster-image-html-paste", async () => {
    const editor = page.locator('[data-testid="mknote-preview-editor"]');
    const html = `<p>图片 <img src="data:image/png;base64,${rasterPngBase64}" alt="pixel"></p>`;
    await writeHtmlClipboard(page, html, "图片");
    await editor.click();
    await page.keyboard.press("Control+A");
    await page.keyboard.press("Control+V");
    await page.waitForTimeout(700);
    const innerHtml = await editor.innerHTML();
    if (!innerHtml.includes("data:image/png;base64,")) {
      throw new Error(`raster image did not survive HTML paste: ${innerHtml}`);
    }
    return innerHtml;
  });

  await check("native-image-clipboard-paste", async () => {
    const editor = page.locator('[data-testid="mknote-preview-editor"]');
    await writeImageClipboard(page);
    await editor.click();
    await page.keyboard.press("Control+A");
    await page.keyboard.press("Control+V");
    await page.waitForTimeout(1200);
    const innerHtml = await editor.innerHTML();
    if (!/<img\b/i.test(innerHtml)) {
      throw new Error(`native image clipboard did not create an image node: ${innerHtml}`);
    }
    return innerHtml;
  });

  await check("popout-window", async () => {
    const existingPages = new Set(context.pages());
    let activeTab = page.locator(".note-tab.active").first();
    if (!(await activeTab.isVisible().catch(() => false))) {
      const libraryToggle = page.locator(
        '[data-testid="mknote-statusbar"] button[title="展开资料库"]',
      );
      await libraryToggle.waitFor({ state: "visible", timeout: 5000 });
      await libraryToggle.click();
      const createNote = page.locator(
        '.compact-library .library-section-title button[title="新建笔记"]',
      ).first();
      await createNote.waitFor({ state: "visible", timeout: 10000 });
      await createNote.click();
      await page.waitForTimeout(1200);
      activeTab = page.locator(".note-tab.active").first();
    }
    await activeTab.waitFor({ state: "visible", timeout: 10000 });
    await activeTab.click({ button: "right" });
    const menuItem = page.getByRole("menuitem", { name: "在新窗口中打开" });
    await menuItem.waitFor({ state: "visible", timeout: 5000 });
    await menuItem.click();
    await page.waitForTimeout(1600);
    const popout = context.pages().find((candidate) => !existingPages.has(candidate));
    if (!popout) throw new Error(`Popout page not observed; pages=${context.pages().length}`);
    await popout.waitForSelector(".popout-titlebar", { state: "visible", timeout: 10000 });
    const title = await popout.locator(".popout-title").innerText().catch(() => "");
    const closeButton = popout.locator(".popout-close-btn");
    if (await closeButton.isVisible().catch(() => false)) await closeButton.click();
    return { title, pageCount: context.pages().length };
  });

  await page.screenshot({ path: screenshotPath, fullPage: false });
} catch (error) {
  results.fatal = { pass: false, error: String(error?.message ?? error) };
} finally {
  if (browser) await browser.close().catch(() => {});
  if (processHandle) {
    try {
      processHandle.kill();
    } catch {
      // The process may already have exited after a fatal launch error.
    }
  }
}

fs.writeFileSync(
  reportPath,
  JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      executable,
      notePath,
      sandbox,
      results,
    },
    null,
    2,
  ),
  "utf8",
);

const failed = Object.values(results).filter((result) => !result.pass).length;
console.log(JSON.stringify({ report: reportPath, screenshot: screenshotPath, results, failed }, null, 2));
process.exitCode = failed > 0 ? 1 : 0;
