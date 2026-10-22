/**
 * Phase 0 WebView2 编辑行为探针。
 *
 * 运行前提供 MKN_PLAYWRIGHT_MODULE，例如：
 * MKN_PLAYWRIGHT_MODULE=file:///C:/.../node_modules/playwright/index.mjs node scripts/visual-editor-webview2-e2e.mjs
 * 该脚本只复制 Release 到临时目录，并把 APPDATA / LOCALAPPDATA 重定向到隔离沙箱。
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

const ROOT = process.cwd();
const PORT = Number(process.env.MKN_WEBVIEW2_CDP_PORT ?? 9238);
const EXE = path.join(ROOT, "src-tauri", "target", "release", "md-sticky-note.exe");
const ARTIFACT_DIR = path.join(ROOT, ".codex-smoke");
const SANDBOX = fs.mkdtempSync(path.join(os.tmpdir(), "mknote-webview2-"));
const APP_ROOT = path.join(SANDBOX, "App");
const APP_DATA = path.join(SANDBOX, "AppData", "Roaming");
const LOCAL_APP_DATA = path.join(SANDBOX, "AppData", "Local");
const TEMP_DIR = path.join(SANDBOX, "Temp");
const NOTE_PATH = path.join(APP_ROOT, "File", "default", "default-note.md");
const SCREENSHOT = path.join(ARTIFACT_DIR, "visual-editor-webview2-e2e.png");
const REPORT = path.join(ARTIFACT_DIR, "visual-editor-webview2-e2e.json");

for (const directory of [path.dirname(NOTE_PATH), APP_DATA, LOCAL_APP_DATA, TEMP_DIR, ARTIFACT_DIR]) {
  fs.mkdirSync(directory, { recursive: true });
}
fs.copyFileSync(EXE, path.join(APP_ROOT, "md-sticky-note.exe"));
fs.writeFileSync(NOTE_PATH, "webview2 seed\n", "utf8");

const results = {};
let processHandle;
let browser;

async function check(name, action) {
  try {
    results[name] = { pass: true, detail: await action() };
  } catch (error) {
    results[name] = { pass: false, error: String(error?.message ?? error) };
  }
}

async function enterPreview(page) {
  const preview = page.locator('[data-testid="mknote-preview-editor"]');
  if (!(await preview.isVisible().catch(() => false))) {
    const toggle = page.locator('button[aria-label="预览"]');
    await toggle.waitFor({ state: "visible", timeout: 15000 });
    await toggle.click();
  }
  await preview.waitFor({ state: "visible", timeout: 15000 });
  return preview;
}

async function readEditorText(page) {
  return page.locator('[data-testid="mknote-preview-editor"]').innerText();
}

try {
  processHandle = spawn(path.join(APP_ROOT, "md-sticky-note.exe"), [], {
    cwd: APP_ROOT,
    env: {
      ...process.env,
      APPDATA: APP_DATA,
      LOCALAPPDATA: LOCAL_APP_DATA,
      TEMP: TEMP_DIR,
      TMP: TEMP_DIR,
      WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${PORT}`,
    },
    stdio: "ignore",
  });

  let cdpReady = false;
  for (let attempt = 0; attempt < 30 && !cdpReady; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 500));
    try {
      const response = await fetch(`http://127.0.0.1:${PORT}/json/list`);
      cdpReady = response.ok;
    } catch {
      cdpReady = false;
    }
  }
  if (!cdpReady) throw new Error("WebView2 CDP endpoint did not become reachable");

  browser = await chromium.connectOverCDP(`http://127.0.0.1:${PORT}`);
  const context = browser.contexts()[0];
  try {
    await context.grantPermissions(["clipboard-read", "clipboard-write"], {
      origin: "http://tauri.localhost",
    });
  } catch {
    // Clipboard permission failure is reported by the clipboard contract below.
  }
  const page = context.pages()[0];
  await page.waitForSelector('[data-testid="mknote-editor-pane"]', { state: "visible", timeout: 15000 });
  await enterPreview(page);

  await check("editor-ready", async () => ({ title: await page.title(), textLength: (await readEditorText(page)).length }));

  await check("selection-replace", async () => {
    const editor = page.locator('[data-testid="mknote-preview-editor"]');
    await editor.click();
    await page.keyboard.press("Control+A");
    await page.keyboard.type("selection source");
    await editor.selectText();
    await page.keyboard.type("selection replacement");
    const text = await readEditorText(page);
    if (!text.includes("selection replacement") || text.includes("selection source")) {
      throw new Error(`selection replacement mismatch: ${JSON.stringify(text)}`);
    }
    return text;
  });

  await check("undo-redo", async () => {
    const editor = page.locator('[data-testid="mknote-preview-editor"]');
    await editor.click();
    await page.keyboard.press("Control+A");
    await page.keyboard.type("undo baseline", { delay: 35 });
    await page.keyboard.type(" plus", { delay: 35 });
    const afterType = await readEditorText(page);
    await page.keyboard.press("Control+Z");
    const afterUndo = await readEditorText(page);
    await page.keyboard.press("Control+Y");
    const afterRedo = await readEditorText(page);
    if (afterType !== "undo baseline plus" || afterUndo !== "undo baseline" || afterRedo !== afterType) {
      throw new Error(`undo transaction mismatch: ${JSON.stringify({ afterType, afterUndo, afterRedo })}`);
    }
    return { afterType, afterUndo, afterRedo };
  });

  await check("clipboard-copy-paste", async () => {
    const editor = page.locator('[data-testid="mknote-preview-editor"]');
    await editor.click();
    await page.keyboard.press("Control+A");
    await page.keyboard.type("clipboard source");
    await editor.selectText();
    await page.keyboard.press("Control+C");
    const copied = await page.evaluate(() => navigator.clipboard.readText());
    await page.keyboard.press("End");
    await page.keyboard.press("Enter");
    await page.keyboard.press("Control+V");
    const text = await readEditorText(page);
    if (copied !== "clipboard source" || !text.includes("clipboard source")) {
      throw new Error(JSON.stringify({ copied, text }));
    }
    return { copied, text };
  });

  await check("security-paste-sanitization", async () => {
    const editor = page.locator('[data-testid="mknote-preview-editor"]');
    await page.evaluate(async () => {
      const html = '<p><a href="javascript:alert(1)">危险链接</a><img src="javascript:alert(1)" onerror="alert(1)"></p>';
      const plain = "危险链接";
      await navigator.clipboard.write([
        new ClipboardItem({
          "text/html": new Blob([html], { type: "text/html" }),
          "text/plain": new Blob([plain], { type: "text/plain" }),
        }),
      ]);
    });
    await editor.click();
    await page.keyboard.press("Control+A");
    await page.keyboard.press("Control+V");
    await page.waitForTimeout(700);
    const innerHtml = await editor.innerHTML();
    if (/<script\b|\bon[a-z]+\s*=|(?:href|src)=["'][^"']*(?:javascript:|vbscript:|data:text\/html|image\/svg\+xml)/i.test(innerHtml)) {
      throw new Error(`dangerous DOM survived paste: ${innerHtml}`);
    }
    return innerHtml;
  });

  const saveMarker = `webview2-save-${Date.now()}`;
  await check("autosave-to-isolated-disk", async () => {
    const editor = page.locator('[data-testid="mknote-preview-editor"]');
    await editor.click();
    await page.keyboard.press("Control+A");
    await page.keyboard.type(saveMarker);
    await page.waitForTimeout(1400);
    const disk = fs.readFileSync(NOTE_PATH, "utf8");
    if (!disk.includes(saveMarker)) throw new Error(`marker absent from ${NOTE_PATH}`);
    return { marker: saveMarker, bytes: Buffer.byteLength(disk) };
  });

  await check("reload-preserves-saved-content", async () => {
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForSelector('[data-testid="mknote-editor-pane"]', { state: "visible", timeout: 15000 });
    await enterPreview(page);
    const text = await readEditorText(page);
    if (!text.includes(saveMarker)) throw new Error(`reloaded editor lost marker: ${JSON.stringify(text)}`);
    return text;
  });

  results["real-os-ime"] = {
    pass: false,
    status: "not-run",
    detail: "Playwright keyboard events do not prove Microsoft Pinyin composition; requires manual OS IME acceptance.",
  };
  await page.screenshot({ path: SCREENSHOT, fullPage: false });
} catch (error) {
  results.fatal = { pass: false, error: String(error?.message ?? error) };
} finally {
  if (browser) await browser.close().catch(() => {});
  if (processHandle) {
    const pid = processHandle.pid;
    if (!processHandle.killed) processHandle.kill();
    await new Promise((resolve) => processHandle.once("exit", resolve));
    try {
      execFileSync("taskkill", ["/PID", String(pid), "/T", "/F"], { stdio: "ignore" });
    } catch {
      // The parent may already have taken the WebView2 child tree down.
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  try {
    fs.rmSync(SANDBOX, { recursive: true, force: true, maxRetries: 5, retryDelay: 1000 });
  } catch (error) {
    results.cleanup = { pass: false, error: String(error?.message ?? error) };
  }
  fs.writeFileSync(
    REPORT,
    JSON.stringify({ generatedAt: new Date().toISOString(), executable: EXE, notePath: NOTE_PATH, sandbox: SANDBOX, results }, null, 2),
    "utf8",
  );
}

const failed = Object.values(results).filter((result) => result.pass === false && result.status !== "not-run");
console.log(JSON.stringify({ report: REPORT, screenshot: SCREENSHOT, results, failed: failed.length }, null, 2));
process.exitCode = failed.length === 0 ? 0 : 1;
