/** Build with a separate Tauri identifier; all writes stay in the fixture runtime. */
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";

const root = path.resolve(import.meta.dirname, "..");
const { chromium } = await import(process.env.MKN_PLAYWRIGHT_MODULE ?? "playwright");
const artifacts = path.resolve(process.env.MKN_PINNED_ARTIFACT_DIR ?? path.join(root, ".codex-smoke", "pinned-tabs"));
fs.mkdirSync(artifacts, { recursive: true });
const runtime = fs.mkdtempSync(path.join(artifacts, "runtime-"));
const appRoot = path.join(runtime, "App");
const executable = path.join(appRoot, "MKnote-Pinned-Tabs-Preview.exe");
const port = Number(process.env.MKN_PINNED_CDP_PORT ?? 9570);
const titles = ["apex", "Dashboard", "SkillDeck", "LLM-Wiki", "HAE", "Apex Development",
  "项目统筹与验收记录", "本周计划与后续安排", "财务预算及合同汇总", "一个很长的置顶笔记标题用于检查省略与完整菜单"];
const refs = titles.map((title) => ({ zone: "default", name: `${title}.md` }));
const draft = { zone: "default", name: "置顶栏试用.md" };
const seed = "# 置顶栏试用\n\n" + Array.from({ length: 22 }, (_, i) => `第 ${i + 1} 行：在正文末尾输入，置顶栏应始终位于编辑区之外。`).join("\n\n");
for (const directory of [appRoot, path.join(appRoot, "File", "default"), ...["Roaming", "Local", "Temp", "WebView2"].map((name) => path.join(runtime, name))]) {
  fs.mkdirSync(directory, { recursive: true });
}
fs.copyFileSync(process.env.MKN_PINNED_EXECUTABLE ?? path.join(root, "src-tauri", "target", "debug", "md-sticky-note.exe"), executable);
function seedFixture(pinCount = 10) {
  for (const ref of refs) fs.writeFileSync(path.join(appRoot, "File", "default", ref.name), `# ${ref.name.slice(0, -3)}\n\n这是隔离试用笔记。\n`);
  fs.writeFileSync(path.join(appRoot, "File", "default", draft.name), seed);
  fs.writeFileSync(path.join(appRoot, "config.json"), JSON.stringify({
    last_note: draft.name, last_note_zone: "default", open_tabs: [draft, ...refs], pinned_tabs: refs.slice(0, pinCount), pinned_tab_limit: 10,
    autostart: false, always_on_top: false, sync_enabled: false, sync_initialized: false, clip_server_enabled: false,
    theme_mode: "dark", editor_font_size: 18,
    global_hotkeys: { toggle_window: "", focus_window: "", quick_capture: "", clipboard_inbox: "", quick_search: "" },
  }, null, 2));
}
const hash = (file) => fs.existsSync(file) ? createHash("sha256").update(fs.readFileSync(file)).digest("hex") : null;
const primaryConfig = process.env.MKN_PRIMARY_CONFIG;
const primaryBefore = primaryConfig ? hash(primaryConfig) : null;
const env = { ...process.env, APPDATA: path.join(runtime, "Roaming"), LOCALAPPDATA: path.join(runtime, "Local"),
  TEMP: path.join(runtime, "Temp"), TMP: path.join(runtime, "Temp"), WEBVIEW2_USER_DATA_FOLDER: path.join(runtime, "WebView2"),
  WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${port}` };
let child, browser, page;
let launchCount = 0;
const result = { pass: false, checks: [], runtime, executable, primaryConfigUnchanged: null };
async function waitFor(check, label) {
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    if (await check()) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Timeout: ${label}`);
}
async function launch() {
  const launchPort = port + launchCount++;
  child = spawn(executable, [], { cwd: appRoot, env: { ...env, WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${launchPort}` }, stdio: "ignore" });
  await waitFor(() => fetch(`http://127.0.0.1:${launchPort}/json/version`).then((r) => r.ok).catch(() => false), "isolated WebView2");
  browser = await chromium.connectOverCDP(`http://127.0.0.1:${launchPort}`);
  page = browser.contexts()[0].pages()[0];
  await page.locator('[data-testid="mknote-editor-pane"]').waitFor();
  assert.equal(await page.evaluate(() => window.__TAURI_INTERNALS__.invoke("plugin:app|identifier")), "com.sin.mdnote-pinned-tabs-preview");
}
async function resize(width, height = 640) {
  await page.evaluate(({ width, height }) => window.__TAURI_INTERNALS__.invoke("plugin:window|set_size", { label: "main", value: { Logical: { width, height } } }), { width, height });
  await waitFor(() => page.evaluate((w) => Math.abs(window.innerWidth - w) < 2, width), "window resize");
}
async function stop() {
  if (page) await page.evaluate(() => window.__TAURI_INTERNALS__.invoke("exit_app")).catch(() => {});
  if (browser) await browser.close().catch(() => {});
  if (child?.exitCode === null) {
    await Promise.race([new Promise((resolve) => child.once("exit", resolve)), new Promise((resolve) => setTimeout(resolve, 2000))]);
    if (child.exitCode === null) child.kill();
  }
  page = browser = child = null;
}
try {
  seedFixture();
  await launch();
  const nav = page.getByRole("navigation", { name: "置顶笔记" });
  await resize(1600);
  await waitFor(() => nav.locator("button.note-tab").count().then((n) => n === 10), "all ten pins in wide window");
  const labels = await nav.locator("button.note-tab .note-tab-label").allTextContents();
  assert.deepEqual(labels, titles);
  const widths = await nav.locator("button.note-tab").evaluateAll((buttons) => buttons.map((button) => button.getBoundingClientRect().width));
  assert(widths[0] < widths[1] && widths[1] < widths[9]);
  assert(widths[9] <= 220);
  result.checks.push("wide window shows full title strings; short and long tabs use different widths, capped at 220px");

  const stableRects = await nav.locator("button.note-tab").evaluateAll((buttons) => buttons.map((button) => ({ x: button.getBoundingClientRect().x, width: button.getBoundingClientRect().width })));
  for (const title of ["apex", "HAE", titles[9], draft.name.slice(0, -3)]) {
    await page.getByRole("button", { name: title, exact: true }).click();
    await page.waitForFunction((title) => document.querySelector('button.note-tab[aria-current="page"]')?.getAttribute("aria-label") === title, title);
    const rectangles = await nav.locator("button.note-tab").evaluateAll((buttons) => buttons.map((button) => ({ x: button.getBoundingClientRect().x, width: button.getBoundingClientRect().width })));
    assert.equal(rectangles.length, stableRects.length);
    assert(rectangles.every((rect, index) => Math.abs(rect.width - stableRects[index].width) < 0.1 && Math.abs(rect.x - stableRects[index].x) < 0.1));
    assert.equal(await nav.getAttribute("data-pinned-active"), title === draft.name.slice(0, -3) ? null : "true");
  }
  const alignment = await page.evaluate(() => ({
    sidebarRight: document.querySelector(".compact-toolbar").getBoundingClientRect().right,
    dockLeft: document.querySelector('[data-testid="mknote-pinned-tabs"]').getBoundingClientRect().left,
    firstTabLeft: document.querySelector('[data-testid="mknote-pinned-tabs"] button.note-tab').getBoundingClientRect().left,
    pinIcons: document.querySelectorAll(".note-tabs-pinned-mark").length,
    dockBackground: getComputedStyle(document.querySelector('[data-testid="mknote-pinned-tabs"]')).backgroundColor,
    statusBackground: getComputedStyle(document.querySelector(".compact-statusbar")).backgroundColor,
  }));
  assert(Math.abs(alignment.dockLeft - alignment.sidebarRight) < 0.1 && Math.abs(alignment.firstTabLeft - alignment.sidebarRight) < 0.1);
  assert.equal(alignment.pinIcons, 0);
  assert.equal(alignment.dockBackground, alignment.statusBackground);
  result.checks.push({ stablePinWidthsAcrossActivationAndSidebarAlignment: alignment });

  await resize(760, 480);
  await nav.getByRole("button", { name: /更多/ }).waitFor();
  const visibleBefore = await nav.locator("button.note-tab .note-tab-label").allTextContents();
  assert(visibleBefore.length > 0 && visibleBefore.length < 10);
  await nav.getByRole("button", { name: /更多/ }).click();
  const menu = page.getByLabel("更多置顶笔记", { exact: true });
  await menu.waitFor();
  const menuBox = await menu.boundingBox();
  assert(menuBox.y >= 0 && menuBox.y + menuBox.height <= 480);
  await menu.getByRole("button", { name: titles[9], exact: true }).click();
  await nav.getByRole("button", { name: titles[9], exact: true }).waitFor();
  assert.equal(await nav.getByRole("button", { name: titles[9], exact: true }).getAttribute("aria-current"), "page");
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(appRoot, "config.json"), "utf8")).pinned_tabs, refs);
  await nav.getByRole("button", { name: /更多/ }).click();
  await page.keyboard.press("Escape");
  await menu.waitFor({ state: "hidden" });
  result.checks.push("narrow window has readable overflow; full menu title selects a visible active tab without changing pin order; Escape closes menu");
  await page.getByRole("button", { name: "置顶栏试用", exact: true }).click();
  const toggle = page.locator(".view-mode-toggle");
  if (await toggle.getAttribute("title") === "编辑") await toggle.click();
  const source = page.getByTestId("mknote-markdown-editor");
  await source.waitFor();
  await source.fill(seed);
  await source.focus();
  await page.keyboard.press("Control+End");
  await page.keyboard.type("\nEND-SOURCE-VISIBLE");
  const geometry = await page.evaluate(() => {
    const editor = document.querySelector('[data-testid="mknote-markdown-editor"]');
    const dock = document.querySelector('[data-testid="mknote-pinned-tabs"]');
    const status = document.querySelector(".compact-statusbar");
    return { editorBottom: editor.getBoundingClientRect().bottom, dockTop: dock.getBoundingClientRect().top,
      dockBottom: dock.getBoundingClientRect().bottom, statusTop: status.getBoundingClientRect().top,
      scrollTop: editor.scrollTop, scrollHeight: editor.scrollHeight, clientHeight: editor.clientHeight };
  });
  assert(geometry.editorBottom <= geometry.dockTop + 1 && geometry.dockBottom <= geometry.statusTop + 1);
  assert(geometry.scrollTop > 0);
  await waitFor(() => fs.readFileSync(path.join(appRoot, "File", "default", draft.name), "utf8").includes("END-SOURCE-VISIBLE"), "source save");
  result.checks.push({ sourceBottomIsOutsideDock: geometry });

  await toggle.click();
  const visual = page.getByTestId("mknote-visual-editor").locator(".ProseMirror");
  await visual.waitFor();
  await visual.focus();
  await page.keyboard.press("Control+End");
  await page.keyboard.press("Enter");
  await page.keyboard.type("END-VISUAL-VISIBLE");
  await waitFor(() => visual.innerText().then((text) => text.includes("END-VISUAL-VISIBLE")), "visual input");
  const caret = await page.evaluate(() => {
    const selection = window.getSelection();
    const range = selection.getRangeAt(0).cloneRange();
    range.setStart(range.endContainer, Math.max(0, range.endOffset - 1));
    const rect = range.getBoundingClientRect();
    const dock = document.querySelector('[data-testid="mknote-pinned-tabs"]').getBoundingClientRect();
    const topElement = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
    return { caretTop: rect.top, caretBottom: rect.bottom, dockTop: dock.top, inVisualEditor: Boolean(topElement?.closest(".ProseMirror")) };
  });
  assert(caret.caretTop > 0 && caret.caretBottom <= caret.dockTop && caret.inVisualEditor);
  await waitFor(() => fs.readFileSync(path.join(appRoot, "File", "default", draft.name), "utf8").includes("END-VISUAL-VISIBLE"), "visual save");
  result.checks.push({ visualBottomCaretIsVisible: caret });
  await page.screenshot({ path: path.join(artifacts, "narrow.png") });

  await nav.getByRole("button", { name: "apex", exact: true }).click({ button: "right" });
  const contextMenu = page.getByRole("menu");
  const contextBox = await contextMenu.boundingBox();
  assert(contextBox.y >= 0 && contextBox.y + contextBox.height <= 480);
  await page.keyboard.press("Escape");
  const first = await nav.getByRole("button", { name: "apex", exact: true }).boundingBox();
  const second = await nav.getByRole("button", { name: "Dashboard", exact: true }).boundingBox();
  await page.mouse.move(first.x + first.width / 2, first.y + first.height / 2);
  await page.mouse.down();
  await page.mouse.move(second.x + 20, second.y + second.height / 2, { steps: 12 });
  await page.mouse.up();
  await waitFor(() => nav.locator("button.note-tab .note-tab-label").first().textContent().then((label) => label === "Dashboard"), "pinned reorder");
  result.checks.push("bottom context menu stays inside window; pointer drag reorders pinned tabs");

  await nav.locator("button.note-tab").first().click({ button: "middle" });
  const confirmation = page.getByRole("dialog", { name: "确认关闭置顶标签" });
  await confirmation.waitFor();
  const confirmBox = await confirmation.boundingBox();
  assert(confirmBox.y >= 0 && confirmBox.y + confirmBox.height <= 480);
  await page.getByRole("button", { name: "确认关闭", exact: true }).click();
  await waitFor(() => JSON.parse(fs.readFileSync(path.join(appRoot, "config.json"), "utf8")).pinned_tabs.length === 9, "close one pinned tab");
  result.checks.push("middle click prompts above dock; confirm closes one pin");
  await stop();

  seedFixture(0);
  await launch();
  assert.equal(await page.getByTestId("mknote-pinned-tabs").count(), 0);
  assert.equal(await page.locator(".note-tabs-pinned-host").evaluate((el) => el.getBoundingClientRect().height), 0);
  result.checks.push("no pinned tabs consumes zero height");
  await stop();

  seedFixture(6);
  await launch();
  await resize(1130, 680);
  await page.locator('button[title="展开资料库"]').click();
  assert(await page.getByTestId("mknote-pinned-tabs").isVisible());
  await page.locator('button[title="收起资料库"]').click();
  result.checks.push("library expansion keeps pinned navigation visible");
  await page.locator(".view-mode-toggle").click();
  await page.getByTestId("mknote-visual-editor").locator(".ProseMirror").waitFor();
  await page.getByTestId("mknote-visual-editor").locator(".ProseMirror").focus();
  await page.keyboard.press("Control+End");
  await page.screenshot({ path: path.join(artifacts, "preview.png") });
  if (primaryConfig) {
    result.primaryConfigUnchanged = hash(primaryConfig) === primaryBefore;
    assert(result.primaryConfigUnchanged);
  }
  result.pass = true;
} catch (error) {
  result.error = error.stack ?? String(error);
  if (page) await page.screenshot({ path: path.join(artifacts, "failure.png") }).catch(() => {});
} finally {
  await stop();
  fs.writeFileSync(path.join(artifacts, "report.json"), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
}
if (!result.pass) process.exitCode = 1;
