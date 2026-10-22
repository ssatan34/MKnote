// Build an isolated app first: tauri build --debug --no-bundle --config .codex-smoke/image-host-config.json
// Config must use identifier com.sin.mdnote-image-host-e2e and productName MKnote Image Host E2E.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import { spawn, execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";
const { chromium } = await import(process.env.MKN_PLAYWRIGHT_MODULE ?? pathToFileURL(path.resolve("poc/visual-editor-phase1a/node_modules/playwright/index.mjs")).href);
const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "mknote-image-host-e2e-"));
const root = process.cwd();
const appRoot = path.join(sandbox, "App");
const assets = path.join(appRoot, "File", "assets");
const notes = path.join(appRoot, "File", "default");
const reportDir = path.join(root, ".codex-smoke");
for (const dir of [appRoot, assets, notes, reportDir, ...["Roaming", "Local", "Temp"].map(x => path.join(sandbox, x))]) fs.mkdirSync(dir, { recursive: true });
const exe = path.join(appRoot, "md-sticky-note.exe");
fs.copyFileSync(path.join(root, "src-tauri/target/debug/md-sticky-note.exe"), exe);
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zl1sAAAAASUVORK5CYII=", "base64");
fs.writeFileSync(path.join(assets, "backup.png"), png);
const notePath = path.join(notes, "Offline.md");
const seed = '# Offline\n\n![backup](https://127.0.0.1:1/offline.png "mk-hosted|File/assets/backup.png")\n';
fs.writeFileSync(notePath, seed);
const configPath = path.join(appRoot, "config.json");
fs.writeFileSync(configPath, JSON.stringify({
  last_note: "Offline.md", last_note_zone: "default", autostart: false, always_on_top: false,
  sync_enabled: false, sync_initialized: false, clip_server_enabled: false,
  image_host_provider: "cloudimgs", image_host_enabled: true, cloudimgs_url: "https://127.0.0.1:1",
  cloudimgs_password: "fixture-password", cloudimgs_directory: "MDnote",
  open_tabs: [{ zone: "default", name: "Offline.md", title: "Offline" }],
  global_hotkeys: { toggle_window: "", focus_window: "", quick_capture: "", clipboard_inbox: "", quick_search: "" },
}));
const readConfig = () => JSON.parse(fs.readFileSync(configPath, "utf8"));
async function waitFor(predicate, label) {
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error(`Timeout: ${label}`);
}
let child, browser, page;
const result = { pass: false, checks: [] };
async function pasteImage() {
  await page.locator(".ProseMirror").click({ position: { x: 10, y: 10 } });
  await page.evaluate(bytes => {
    const transfer = new DataTransfer();
    transfer.items.add(new File([new Uint8Array(bytes)], "fixture.png", { type: "image/png" }));
    document.dispatchEvent(new ClipboardEvent("paste", { clipboardData: transfer, bubbles: true, cancelable: true }));
  }, Array.from(png));
}
async function allImagesLoaded() {
  return page.locator(".ProseMirror img[data-mk-source-kind]").evaluateAll(images => images.length > 0 && images.every(img => img.complete && img.naturalWidth > 0));
}
async function openSettings() {
  await page.getByRole("button", { name: "设置", exact: true }).click();
  await page.getByRole("button", { name: "图床设置", exact: true }).click();
}
try {
  child = spawn(exe, [], { cwd: appRoot, windowsHide: true, stdio: "ignore", env: {
    ...process.env, APPDATA: path.join(sandbox, "Roaming"), LOCALAPPDATA: path.join(sandbox, "Local"),
    TEMP: path.join(sandbox, "Temp"), TMP: path.join(sandbox, "Temp"),
    WEBVIEW2_USER_DATA_FOLDER: path.join(sandbox, "WebView2"),
    WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: "--remote-debugging-port=9298",
  } });
  await waitFor(async () => { try { return (await fetch("http://127.0.0.1:9298/json/list")).ok; } catch { return false; } }, "isolated CDP");
  browser = await chromium.connectOverCDP("http://127.0.0.1:9298");
  page = browser.contexts()[0].pages()[0];
  await page.locator('[data-testid="mknote-editor-pane"]').waitFor();
  assert.equal(await page.evaluate(() => window.__TAURI_INTERNALS__.invoke("plugin:app|identifier")), "com.sin.mdnote-image-host-e2e");
  assert.equal(await page.evaluate(() => window.__TAURI_INTERNALS__.invoke("plugin:app|name")), "MKnote Image Host E2E");
  if (await page.locator(".view-mode-toggle").getAttribute("aria-pressed") !== "true") {
    await page.getByRole("button", { name: "预览", exact: true }).click();
  }
  await page.locator('[data-testid="mknote-visual-editor"][data-editor-ready="true"]').waitFor();
  await waitFor(allImagesLoaded, "hosted local backup renders offline");
  assert.equal(fs.readFileSync(notePath, "utf8"), seed);
  result.checks.push("offline hosted backup displays without changing source on load");
  await pasteImage();
  await waitFor(() => fs.readdirSync(assets).length === 2, "paste saved locally");
  await waitFor(() => page.locator(".ProseMirror img[data-mk-source-kind]").count().then(n => n === 2), "pasted image present");
  await page.locator(".error-banner").waitFor({ state: "visible" });
  assert.match(await page.locator(".error-banner").innerText(), /上传|请求|连接/);
  await waitFor(allImagesLoaded, "images loaded after upload failure");
  await waitFor(() => fs.readFileSync(notePath, "utf8").includes("File/assets/") && !fs.readFileSync(notePath, "utf8").includes("mk-uploading"), "local markdown saved");

  result.checks.push("failed upload retains pasted image and local asset");
  await openSettings();
  const toggle = page.getByRole("switch", { name: "启用图床自动上传" });
  assert.equal(await toggle.isChecked(), true);
  await toggle.click();
  await page.getByRole("button", { name: "保存", exact: true }).click();
  await waitFor(() => readConfig().image_host_enabled === false, "disabled persisted");
  assert.equal(readConfig().image_host_provider, "cloudimgs");
  await page.getByRole("tab", { name: "兰空图床", exact: true }).click();
  await page.getByLabel("账号", { exact: true }).waitFor();
  await page.getByRole("tab", { name: "云图", exact: true }).click();
  assert.equal(await page.getByLabel("云图地址", { exact: true }).inputValue(), "https://127.0.0.1:1");
  await page.screenshot({ path: path.join(reportDir, "image-host-settings.png") });
  await page.keyboard.press("Escape");
  await pasteImage();
  assert.equal(fs.readdirSync(assets).length, 2); // identical clipboard bytes reuse the asset
  await waitFor(() => page.locator(".ProseMirror img[data-mk-source-kind]").count().then(n => n === 3), "disabled pasted image present");
  await waitFor(allImagesLoaded, "disabled images display");
  assert.match(await page.evaluate(async () => {
    try { await window.__TAURI_INTERNALS__.invoke("upload_image", { filename: "fixture.png", data: [1] }); return "unexpected success"; }
    catch (error) { return String(error); }
  }), /图床上传未启用/);
  result.checks.push("disabled hosting retains provider, prevents upload and renders local paste");
  await openSettings();
  assert.equal(await toggle.isChecked(), false);
  await toggle.click();
  await page.getByRole("button", { name: "保存", exact: true }).click();
  await waitFor(() => readConfig().image_host_enabled === true, "enabled persisted");
  assert.equal(readConfig().image_host_provider, "cloudimgs");
  await page.keyboard.press("Escape");
  await page.locator(".view-mode-toggle").click();
  await page.locator(".view-mode-toggle").click();
  await waitFor(allImagesLoaded, "reopened preview images display");
  assert.equal(await page.locator(".ProseMirror img[data-mk-source-kind]").count(), 3);
  assert.ok(!fs.readFileSync(notePath, "utf8").includes("data:image"));
  await page.screenshot({ path: path.join(reportDir, "image-host-offline.png") });
  result.checks.push("re-enable and reopen preserve all images");
  result.pass = true;
} catch (error) {
  result.error = String(error.stack ?? error);
  result.diagnostic = page ? await page.evaluate(() => ({ imgs: [...document.querySelectorAll("img")].map(i => ({ src: i.src, width: i.naturalWidth })), editor: document.querySelector('.ProseMirror')?.innerHTML, mode: document.querySelector(".view-mode-toggle")?.outerHTML })).catch(() => null) : null;
  if (page) await page.screenshot({ path: path.join(reportDir, "image-host-failure.png") }).catch(() => {});
} finally {
  if (browser) await browser.close().catch(() => {});
  if (child?.pid) { try { execFileSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore" }); } catch {} }
  const resolved = path.resolve(sandbox);
  if (path.dirname(resolved) !== path.resolve(os.tmpdir()) || !path.basename(resolved).startsWith("mknote-image-host-e2e-")) throw new Error("Unsafe cleanup target");
  for (let attempt = 0; attempt < 30; attempt++) {
    try { fs.rmSync(resolved, { recursive: true, force: true }); break; }
    catch (error) { if (attempt === 29) result.cleanupError = String(error); else await new Promise(resolve => setTimeout(resolve, 200)); }
  }
  fs.writeFileSync(path.join(reportDir, "image-host-offline-e2e.json"), JSON.stringify(result, null, 2));
}
console.log(JSON.stringify(result, null, 2));
process.exitCode = result.pass ? 0 : 1;
