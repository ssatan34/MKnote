/** Real WebView2 switching and save protection, using only newly seeded fixture notes. */
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";

const root = path.resolve(import.meta.dirname, "..");
const { chromium } = await import(process.env.MKN_PLAYWRIGHT_MODULE ?? "playwright");
const artifacts = path.join(root, ".codex-smoke", "tab-switch");
fs.mkdirSync(artifacts, { recursive: true });
const runtime = fs.mkdtempSync(path.join(artifacts, "runtime-"));
const appRoot = path.join(runtime, "App");
const executable = path.join(appRoot, "MKnote-Switch-Preview.exe");
const titles = ["Switch A", "Switch B", "Switch C", "Backup Failure"];
const refs = titles.map(title => ({ zone: "default", name: `${title}.md` }));
const seed = title => `# ${title}\n\nIsolated switch fixture.\n`;
const notePath = title => path.join(appRoot, "File", "default", `${title}.md`);
const snapshotPath = title => path.join(appRoot, "File", ".private", ".mknote-migration-snapshots",
  `${createHash("sha256").update(`default\0${title}.md`).digest("hex")}.md`);
for (const directory of [appRoot, path.join(appRoot, "File", "default"), ...["Roaming", "Local", "Temp", "WebView2"].map(name => path.join(runtime, name))]) fs.mkdirSync(directory, { recursive: true });
fs.copyFileSync(path.join(root, "src-tauri", "target", "debug", "md-sticky-note.exe"), executable);
for (const title of titles) fs.writeFileSync(notePath(title), seed(title));
fs.writeFileSync(path.join(appRoot, "config.json"), JSON.stringify({ last_note: refs[0].name, last_note_zone: "default", open_tabs: refs,
  pinned_tabs: refs.slice(0, 3), pinned_tab_limit: 10, autostart: false, always_on_top: false, sync_enabled: false, sync_initialized: false,
  clip_server_enabled: false, theme_mode: "dark", global_hotkeys: { toggle_window: "", focus_window: "", quick_capture: "", clipboard_inbox: "", quick_search: "" } }));
const primaryConfig = process.env.MKN_PRIMARY_CONFIG;
const hash = file => createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const primaryBefore = primaryConfig ? hash(primaryConfig) : null;
const port = Number(process.env.MKN_SWITCH_CDP_PORT ?? 9610);
const child = spawn(executable, [], { cwd: appRoot, stdio: "ignore", env: { ...process.env,
  APPDATA: path.join(runtime, "Roaming"), LOCALAPPDATA: path.join(runtime, "Local"), TEMP: path.join(runtime, "Temp"), TMP: path.join(runtime, "Temp"),
  WEBVIEW2_USER_DATA_FOLDER: path.join(runtime, "WebView2"), WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${port}` } });
let browser, page;
const result = { pass: false, runtime, checks: [], timing: null, primaryConfigUnchanged: null };
async function waitFor(check, label) {
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) { if (await check()) return; await new Promise(resolve => setTimeout(resolve, 50)); }
  throw new Error(`Timeout: ${label}`);
}
const perf = [];
const activeTitle = () => page.locator('button.note-tab[aria-current="page"]').getAttribute("aria-label");
const visual = () => page.getByTestId("mknote-visual-editor").locator(".ProseMirror");
async function select(title) {
  await page.getByRole("button", { name: title, exact: true }).click();
  await page.waitForFunction(title => document.querySelector('button.note-tab[aria-current="page"]')?.getAttribute("aria-label") === title &&
    document.querySelector('[data-testid="mknote-visual-editor"]')?.getAttribute("data-editor-ready") === "true" &&
    document.querySelector(".ProseMirror h1")?.textContent === title, title);
}
try {
  await waitFor(() => fetch(`http://127.0.0.1:${port}/json/version`).then(r => r.ok).catch(() => false), "isolated WebView2");
  browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
  page = browser.contexts()[0].pages()[0];
  await page.getByTestId("mknote-editor-pane").waitFor();
  assert.equal(await page.evaluate(() => window.__TAURI_INTERNALS__.invoke("plugin:app|identifier")), "com.sin.mdnote-pinned-tabs-preview");
  await page.locator(".view-mode-toggle").waitFor();
  if (await page.locator(".view-mode-toggle").getAttribute("title") === "预览") await page.locator(".view-mode-toggle").click();
  await page.waitForFunction(() => document.querySelector('[data-testid="mknote-visual-editor"]')?.getAttribute("data-editor-ready") === "true");
  assert.equal(fs.readFileSync(snapshotPath(titles[0]), "utf8"), seed(titles[0]));
  page.on("console", message => { if (message.text().startsWith("[mk-perf]")) perf.push(message.text()); });
  await page.evaluate(() => localStorage.setItem("mkPerf", "1"));
  for (const title of titles.slice(1, 3)) {
    assert(!fs.existsSync(snapshotPath(title)));
    await select(title);
    assert.equal(fs.readFileSync(snapshotPath(title), "utf8"), seed(title));
  }
  assert.equal(perf.filter(line => line.includes("invoke:ensure_visual_editor_migration_snapshot")).length, 2);
  result.checks.push("first visual load creates the original-content snapshot before editor-ready");
  const warmLogStart = perf.length;
  await page.evaluate(() => {
    window.__tabSwitchSamples = [];
    let current;
    document.addEventListener("click", event => {
      const button = event.target.closest("button.note-tab");
      if (button) { current = { title: button.getAttribute("aria-label"), start: performance.now(), activeMs: null, readyMs: null }; window.__tabSwitchSamples.push(current); }
    }, true);
    new MutationObserver(() => {
      if (!current) return;
      if (document.querySelector('button.note-tab[aria-current="page"]')?.getAttribute("aria-label") !== current.title) return;
      current.activeMs ??= performance.now() - current.start;
      const editor = document.querySelector('[data-testid="mknote-visual-editor"]');
      if (current.readyMs === null && editor?.getAttribute("data-editor-ready") === "true" && editor.querySelector("h1")?.textContent === current.title) {
        current.readyMs = performance.now() - current.start;
      }
    }).observe(document.body, { attributes: true, childList: true, subtree: true });
  });
  for (let i = 0; i < 12; i++) await select(titles[i % 3]);
  const samples = await page.evaluate(() => window.__tabSwitchSamples);
  assert(samples.every(sample => sample.activeMs !== null && sample.readyMs !== null));
  assert.equal(perf.slice(warmLogStart).filter(line => /invoke:(list_notes|ensure_visual_editor_migration_snapshot|read_note_snapshot) /.test(line)).length, 0);
  const summarize = key => { const sorted = samples.map(sample => sample[key]).sort((a, b) => a - b); return { min: sorted[0], median: sorted[Math.floor(sorted.length / 2)], max: sorted.at(-1) }; };
  result.timing = { samples, activeMs: summarize("activeMs"), readyMs: summarize("readyMs") };
  assert.equal(await page.locator('button.note-tab[aria-current="page"]').evaluate(button => getComputedStyle(button).transitionDuration), "0s");
  for (const title of titles.slice(0, 3)) assert.equal(fs.readFileSync(notePath(title), "utf8"), seed(title));
  result.checks.push("warm switches reuse tab metadata and successful backups with no directory scan or note reread; selection has no transition");

  await select(titles[0]);
  await visual().fill(`# ${titles[0]}\nSAVE-BEFORE-SWITCH`);
  await select(titles[1]);
  assert(fs.readFileSync(notePath(titles[0]), "utf8").includes("SAVE-BEFORE-SWITCH"));
  assert.equal(fs.readFileSync(snapshotPath(titles[0]), "utf8"), seed(titles[0]));
  await page.waitForTimeout(250);
  assert.equal(await visual().locator("h1").textContent(), titles[1]);
  assert(!(await visual().innerText()).includes("SAVE-BEFORE-SWITCH"));
  result.checks.push("dirty note saves before switching and the original backup is unchanged");

  const diskBeforeConflict = fs.readFileSync(notePath(titles[1]), "utf8");
  fs.writeFileSync(notePath(titles[1]), "external CAS change\n");
  await visual().fill(`# ${titles[1]}\nLOCAL-CONFLICT-DRAFT`);
  await page.getByRole("button", { name: titles[2], exact: true }).click();
  await waitFor(() => page.locator("body").innerText().then(text => /保存.*失败|冲突|外部修改/.test(text)), "save conflict");
  assert.equal(await activeTitle(), titles[1]);
  assert((await visual().innerText()).includes("LOCAL-CONFLICT-DRAFT"));
  assert.equal(fs.readFileSync(notePath(titles[1]), "utf8"), "external CAS change\n");
  result.checks.push("CAS failure prevents switching, preserves local draft and does not overwrite external disk content");
  fs.writeFileSync(notePath(titles[1]), diskBeforeConflict);
  await select(titles[2]);
  assert(fs.readFileSync(notePath(titles[1]), "utf8").includes("LOCAL-CONFLICT-DRAFT"));
  await page.evaluate(() => {
    for (const title of ["Switch A", "Switch B", "Switch C"]) document.querySelector(`button.note-tab[aria-label="${title}"]`).click();
  });
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await page.waitForFunction(() => document.querySelector('button.note-tab[aria-current="page"]')?.getAttribute("aria-label") === "Switch C");
  assert.equal(await activeTitle(), titles[2]);
  result.checks.push("rapid consecutive clicks retain the latest requested note");

  fs.mkdirSync(snapshotPath(titles[3]));
  await page.getByRole("button", { name: titles[3], exact: true }).click();
  await page.getByTestId("mknote-markdown-editor").waitFor();
  assert.equal(await page.getByTestId("mknote-visual-editor").count(), 0);
  assert.equal(fs.readFileSync(notePath(titles[3]), "utf8"), seed(titles[3]));
  result.checks.push("first backup failure blocks visual editor load and leaves source unchanged");
  result.pass = true;
} catch (error) {
  result.error = String(error.stack ?? error);
  if (page) await page.screenshot({ path: path.join(artifacts, "failure.png") }).catch(() => {});
  process.exitCode = 1;
} finally {
  if (page) await page.evaluate(() => window.__TAURI_INTERNALS__.invoke("exit_app")).catch(() => {});
  if (browser) await browser.close().catch(() => {});
  if (child.exitCode === null) { await new Promise(resolve => setTimeout(resolve, 1000)); if (child.exitCode === null) child.kill(); }
  if (primaryConfig) result.primaryConfigUnchanged = hash(primaryConfig) === primaryBefore;
  if (result.primaryConfigUnchanged === false) { result.pass = false; process.exitCode = 1; }
  fs.writeFileSync(path.join(artifacts, "report.json"), JSON.stringify({ ...result, perf }, null, 2));
  console.log(JSON.stringify({ ...result, timing: result.timing && { activeMs: result.timing.activeMs, readyMs: result.timing.readyMs } }, null, 2));
}
