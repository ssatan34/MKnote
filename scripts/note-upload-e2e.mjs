/**
 * Obsidian upload WebView2 acceptance using temporary app data and vault folders.
 * Build first with --debug --no-bundle --config .codex-smoke/note-upload-config.json,
 * with identifier com.sin.mdnote-upload-e2e and productName MKnote Upload E2E.
 * Both must be isolated: productName also controls the Windows autostart registry name.
 * Set MKN_PLAYWRIGHT_MODULE to an installed Playwright index.mjs if needed.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import { spawn, execFileSync } from "node:child_process";

const { chromium } = await import(process.env.MKN_PLAYWRIGHT_MODULE ?? "playwright");
const root = process.cwd();
const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "mknote-upload-e2e-"));
const appRoot = path.join(sandbox, "App");
const appData = path.join(sandbox, "Roaming");
const localAppData = path.join(sandbox, "Local");
const tempDir = path.join(sandbox, "Temp");
const noteDir = path.join(sandbox, "Vault", "Notes");
const attachmentDir = path.join(sandbox, "Vault", "Attachments");
const reportDir = path.join(root, ".codex-smoke");
const configPath = path.join(appRoot, "config.json");
const sourcePath = path.join(appRoot, "File", "default", "Upload.md");
const assetDir = path.join(appRoot, "File", "assets");
const port = Number(process.env.MKN_UPLOAD_CDP_PORT ?? 9297);
for (const dir of [appRoot, appData, localAppData, tempDir, noteDir, attachmentDir, path.dirname(sourcePath), assetDir, reportDir]) fs.mkdirSync(dir, { recursive: true });
const executable = path.join(appRoot, "md-sticky-note.exe");
fs.copyFileSync(path.join(root, "src-tauri", "target", "debug", "md-sticky-note.exe"), executable);
const seed = "当前笔记\n\n![图片](File/assets/picture.png)\n\n[附件](File/assets/document.pdf)\n";
fs.writeFileSync(sourcePath, seed);
fs.writeFileSync(path.join(assetDir, "picture.png"), Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zl1sAAAAASUVORK5CYII=", "base64"));
fs.writeFileSync(path.join(assetDir, "document.pdf"), "fixture-pdf");
fs.writeFileSync(configPath, JSON.stringify({
  last_note: "Upload.md", last_note_zone: "default", autostart: false, sync_enabled: false,
  sync_initialized: false, clip_server_enabled: false, always_on_top: false,
  open_tabs: [{ zone: "default", name: "Upload.md", title: "Upload" }],
  siyuan_api_url: "http://127.0.0.1:1", siyuan_api_token: "fixture-token", siyuan_notebook_id: "fixture-notebook",
  global_hotkeys: { toggle_window: "", focus_window: "", quick_capture: "", clipboard_inbox: "", quick_search: "" },
}));

const waitFor = async (predicate, message) => {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Timeout: ${message}`);
};
const readConfig = () => JSON.parse(fs.readFileSync(configPath, "utf8"));
let child;
let browser;
let page;
const logs = [];
let result = { pass: false, checks: [] };
try {
  child = spawn(executable, [], { cwd: appRoot, windowsHide: true, stdio: "ignore", env: {
    ...process.env, APPDATA: appData, LOCALAPPDATA: localAppData, TEMP: tempDir, TMP: tempDir,
    WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${port}`,
  } });
  await waitFor(async () => { try { return (await fetch(`http://127.0.0.1:${port}/json/list`)).ok; } catch { return false; } }, "isolated WebView2 CDP");
  browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
  page = browser.contexts()[0].pages()[0];
  page.on("console", (message) => { if (message.text().includes("[mk-perf]") || message.type() === "error") logs.push(message.text()); });
  await page.locator('[data-testid="mknote-editor-pane"]').waitFor({ state: "visible" });
  await page.evaluate(() => localStorage.setItem("mkPerf", "1"));
  assert.equal(await page.evaluate(() => window.__TAURI_INTERNALS__.invoke("plugin:app|identifier")), "com.sin.mdnote-upload-e2e");
  assert.equal(await page.evaluate(() => window.__TAURI_INTERNALS__.invoke("plugin:app|name")), "MKnote Upload E2E");
  const upload = page.locator(".statusbar-btn--siyuan");
  assert.match(await upload.getAttribute("title"), /思源/);
  result.checks.push("legacy SiYuan activation");
  const openSettings = async () => {
    await page.getByRole("button", { name: "设置", exact: true }).click();
    await page.getByRole("button", { name: "笔记上传", exact: true }).click();
  };
  await openSettings();
  await page.getByRole("tab", { name: "Obsidian", exact: true }).click();
  await page.getByLabel("笔记目标文件夹", { exact: true }).fill(noteDir);
  await page.getByLabel("附件存放文件夹", { exact: true }).fill(attachmentDir);
  await page.getByRole("switch", { name: /启用Obsidian上传/ }).click();
  await waitFor(() => readConfig().note_upload_target === "obsidian", "Obsidian enabled and persisted");
  await waitFor(() => page.getByRole("switch", { name: /启用Obsidian上传/ }).isChecked(), "Obsidian switch reflects saved selection");
  await page.getByRole("tab", { name: "思源笔记", exact: true }).click();
  assert.equal(await page.getByRole("switch", { name: /启用思源笔记上传/ }).isChecked(), false);
  await page.getByRole("tab", { name: "Obsidian", exact: true }).click();
  await page.screenshot({ path: path.join(reportDir, "note-upload-settings.png") });
  result.checks.push("tabs, separate paths, mutually exclusive switches, settings persistence");
  await page.keyboard.press("Escape");
  await upload.click();
  await waitFor(() => fs.existsSync(path.join(noteDir, "Upload.md")) && fs.readFileSync(path.join(noteDir, "Upload.md"), "utf8").includes("../Attachments/picture%2Epng"), "first note copy completed");
  let copied = fs.readFileSync(path.join(noteDir, "Upload.md"), "utf8");
  assert.match(copied, /\.\.\/Attachments\/picture%2Epng/);
  assert.match(copied, /\.\.\/Attachments\/document%2Epdf/);
  assert.equal(fs.readFileSync(sourcePath, "utf8"), seed);
  assert.equal(fs.readdirSync(attachmentDir).length, 2);
  await page.waitForFunction(() => document.querySelector(".statusbar-btn--siyuan")?.classList.contains("upload-success"));
  assert.equal(await page.locator(".note-upload-result").count(), 0);
  await page.waitForFunction(() => !document.querySelector(".statusbar-btn--siyuan")?.disabled);
  await upload.click();
  await waitFor(() => fs.existsSync(path.join(noteDir, "Upload (1).md")) && fs.readFileSync(path.join(noteDir, "Upload (1).md"), "utf8") === copied, "numbered copy completed");
  assert.equal(fs.readdirSync(attachmentDir).length, 2);
  result.checks.push("button copies note and resources, adjusts paths, numbers conflicts, reuses attachments");
  await openSettings();
  await page.getByRole("tab", { name: "Obsidian", exact: true }).click();
  await page.getByLabel("直接覆盖", { exact: true }).check();
  await page.getByRole("button", { name: "保存设置", exact: true }).click();
  await waitFor(() => readConfig().obsidian_conflict === "overwrite", "overwrite policy persisted");
  await page.keyboard.press("Escape");
  const textarea = page.locator('[data-testid="mknote-editor-pane"] textarea');
  if (!(await textarea.isVisible())) await page.locator(".view-mode-toggle").click();
  await textarea.fill(seed + "最新编辑内容\n");
  await upload.click();
  await waitFor(() => fs.readFileSync(path.join(noteDir, "Upload.md"), "utf8").includes("最新编辑内容"), "flush latest editor content then overwrite");
  assert.equal(fs.readdirSync(noteDir).length, 2);
  result.checks.push("latest editor content saved and overwrite policy used");
  await openSettings();
  await page.getByRole("tab", { name: "Obsidian", exact: true }).click();
  await page.getByRole("switch", { name: /启用Obsidian上传/ }).click();
  await waitFor(() => readConfig().note_upload_target === "none", "all-off persisted");
  await page.keyboard.press("Escape");
  await waitFor(async () => (await upload.count()) === 0, "all-off hides upload button after save response");
  result.checks.push("all-off hides upload button and retains paths");
  await openSettings();
  await page.getByRole("tab", { name: "Obsidian", exact: true }).click();
  await page.getByRole("switch", { name: /启用Obsidian上传/ }).click();
  await waitFor(() => page.getByRole("switch", { name: /启用Obsidian上传/ }).isChecked(), "re-enable with retained settings");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "默认便签", exact: true }).click();
  await waitFor(() => page.locator(".default-note-btn").getAttribute("class").then((value) => value.includes("active")), "root default note open");
  await upload.click();
  await waitFor(() => fs.existsSync(path.join(noteDir, "default-note.md")) && fs.readFileSync(path.join(noteDir, "default-note.md"), "utf8") === fs.readFileSync(path.join(appRoot, "default-note.md"), "utf8"), "root default note export completed");
  assert.equal(fs.readFileSync(path.join(noteDir, "default-note.md"), "utf8"), fs.readFileSync(path.join(appRoot, "default-note.md"), "utf8"));
  result.checks.push("root default note uses its actual source file");
  await waitFor(async () => !(await upload.isDisabled()), "root default upload completed");
  await page.getByTitle("字数（Ctrl+点击进入隐私模式）", { exact: true }).click({ modifiers: ["Control"] });
  await waitFor(() => upload.isDisabled(), "Private editor mode disables upload");
  assert.equal(await upload.getAttribute("title"), "隐私便签不能上传");
  result.checks.push("Private editor mode disables upload");
  result.pass = true;
} catch (error) {
  result.error = String(error?.stack ?? error);
  result.diagnostic = { source: fs.readFileSync(sourcePath, "utf8"), target: fs.existsSync(path.join(noteDir, "Upload.md")) ? fs.readFileSync(path.join(noteDir, "Upload.md"), "utf8") : null,
    selected: readConfig().note_upload_target, conflict: readConfig().obsidian_conflict, files: fs.readdirSync(noteDir), logs: logs.slice(-25),
    button: page ? await page.locator(".statusbar-btn--siyuan").evaluate((element) => ({ disabled: element.disabled, title: element.title, className: element.className })).catch(() => null) : null };
  if (page) await page.screenshot({ path: path.join(reportDir, "note-upload-failure.png") }).catch(() => {});
} finally {
  if (browser) await browser.close().catch(() => {});
  if (child?.pid) {
    try { execFileSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore" }); } catch { /* process already exited */ }
  }
  for (let attempt = 0; attempt < 30; attempt++) {
    try { fs.rmSync(sandbox, { recursive: true, force: true }); break; }
    catch (error) {
      if (attempt === 29) result.cleanupError = String(error);
      else await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }
  fs.writeFileSync(path.join(reportDir, "note-upload-e2e.json"), JSON.stringify(result, null, 2));
}
console.log(JSON.stringify(result, null, 2));
process.exitCode = result.pass ? 0 : 1;
