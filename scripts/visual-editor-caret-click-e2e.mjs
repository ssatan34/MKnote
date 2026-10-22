/**
 * WebView2 回归探针：全选文本后，第一次点击具体字符必须立即落到该字符位置。
 *
 * 运行前需要提供 MKN_PLAYWRIGHT_MODULE，并使用隔离应用标识构建测试 exe：
 * MKN_PLAYWRIGHT_MODULE=file:///C:/.../node_modules/playwright/index.mjs node scripts/visual-editor-caret-click-e2e.mjs
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawn } from "node:child_process";

const playwrightModule = process.env.MKN_PLAYWRIGHT_MODULE ?? "playwright";
const playwrightExports = await import(playwrightModule);
const chromium = playwrightExports.chromium ?? playwrightExports.default?.chromium;
if (!chromium) throw new Error(`Playwright module does not expose chromium: ${playwrightModule}`);

const root = process.cwd();
const executable = path.join(root, "src-tauri", "target", "release", "md-sticky-note.exe");
const artifactDir = path.join(root, ".codex-smoke");
const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "mknote-caret-click-"));
const appRoot = path.join(sandbox, "App");
const appData = path.join(sandbox, "AppData", "Roaming");
const localAppData = path.join(sandbox, "AppData", "Local");
const tempDir = path.join(sandbox, "Temp");
const notePath = path.join(appRoot, "File", "default", "default-note.md");
const reportPath = path.join(artifactDir, "visual-editor-caret-click-e2e.json");
const port = Number(process.env.MKN_CARET_CLICK_CDP_PORT ?? 9240);

for (const directory of [path.dirname(notePath), appData, localAppData, tempDir, artifactDir]) {
  fs.mkdirSync(directory, { recursive: true });
}
fs.copyFileSync(executable, path.join(appRoot, "md-sticky-note.exe"));
fs.writeFileSync(notePath, "caret click seed\n", "utf8");

let browser;
let processHandle;
let result = { pass: false };

async function stopProcess() {
  if (!processHandle) return;
  const pid = processHandle.pid;
  if (processHandle.exitCode === null && !processHandle.killed) processHandle.kill();
  await Promise.race([
    new Promise((resolve) => processHandle.once("exit", resolve)),
    new Promise((resolve) => setTimeout(resolve, 1500)),
  ]);
  try {
    execFileSync("taskkill", ["/PID", String(pid), "/T", "/F"], { stdio: "ignore" });
  } catch {
    // 进程树可能已经由父进程退出时一并清理。
  }
}

async function getCharacterPoint(page, textIndex) {
  return page.evaluate((index) => {
    const editor = document.querySelector("[data-testid='mknote-visual-editor']");
    if (!editor) throw new Error("visual editor not found");
    const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT);
    let remaining = index;
    let node = null;
    while (walker.nextNode()) {
      const candidate = walker.currentNode;
      if (!(candidate instanceof Text)) continue;
      if (remaining < candidate.data.length) {
        node = candidate;
        break;
      }
      remaining -= candidate.data.length;
    }
    if (!node) throw new Error(`text character ${index} not found`);
    const range = document.createRange();
    range.setStart(node, remaining);
    range.setEnd(node, remaining + 1);
    const rect = range.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) throw new Error("target character has no layout box");
    return { x: rect.left + Math.max(1, rect.width * 0.1), y: rect.top + rect.height / 2 };
  }, textIndex);
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
  for (let attempt = 0; attempt < 40 && !cdpReady; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 400));
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
  const page = context.pages()[0];
  await page.waitForSelector('[data-testid="mknote-editor-pane"]', { state: "visible", timeout: 15000 });
  const preview = page.locator('[data-testid="mknote-visual-editor"]');
  if (!(await preview.isVisible().catch(() => false))) {
    const modeToggle = page.locator(".view-mode-toggle");
    await modeToggle.waitFor({ state: "visible", timeout: 15000 });
    if ((await modeToggle.getAttribute("title")) === "预览") await modeToggle.click();
  }
  await preview.waitFor({ state: "visible", timeout: 15000 });
  await preview.locator(".ProseMirror").waitFor({ state: "visible", timeout: 15000 });

  const editor = preview.locator(".ProseMirror");
  await editor.click();
  await page.keyboard.press("Control+A");
  await page.keyboard.type("abcdefghij");
  await page.waitForTimeout(250);
  const baselineText = await preview.innerText();
  if (baselineText !== "abcdefghij") {
    throw new Error(`could not establish the text baseline: ${JSON.stringify(baselineText)}`);
  }
  await page.keyboard.press("Control+A");
  const point = await getCharacterPoint(page, 4);
  await page.mouse.click(point.x, point.y);
  await page.keyboard.type("X");
  await page.waitForTimeout(250);
  const actualText = await preview.innerText();
  if (actualText !== "abcdXefghij") {
    throw new Error(
      `first caret click inserted at the wrong selection: ${JSON.stringify({ actualText, point })}`,
    );
  }
  result = { pass: true, baselineText, actualText, point };
} catch (error) {
  result = { pass: false, error: String(error?.message ?? error) };
} finally {
  if (browser) await browser.close().catch(() => {});
  await stopProcess();
  try {
    fs.rmSync(sandbox, { recursive: true, force: true, maxRetries: 5, retryDelay: 250 });
  } catch (error) {
    result.cleanupError = String(error?.message ?? error);
  }
  fs.writeFileSync(
    reportPath,
    JSON.stringify({ generatedAt: new Date().toISOString(), executable, notePath, result }, null, 2),
    "utf8",
  );
}

console.log(JSON.stringify({ report: reportPath, executable, result }, null, 2));
process.exitCode = result.pass ? 0 : 1;
