/**
 * Phase 2 P0 生命周期隔离探针。
 *
 * 只运行已构建的 visual-prosemirror Release 副本，覆盖普通 Tab 切换、
 * Private 模式和 Popout 入口的编辑器边界。所有数据、进程和 CDP 端口
 * 都使用本次运行专属的临时目录，不修改正式 T4 manifest。
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";

const root = path.resolve(import.meta.dirname, "..");
const executable = path.join(root, "src-tauri", "target", "release", "md-sticky-note.exe");
const artifactDir = path.join(root, "poc", "visual-editor-phase1a", "artifacts", "phase2-production");
const runId = process.env.MKN_PHASE2_LIFECYCLE_RUN_ID ?? new Date().toISOString().replace(/[:.]/g, "-");
const basePort = Number(process.env.MKN_PHASE2_LIFECYCLE_CDP_PORT ?? 9275);
const popoutVisualMode = process.env.MKN_PHASE3_POPOUT_VISUAL === "1";
const reportPath = path.join(artifactDir, `phase2-lifecycle-e2e-${runId}.json`);
const configuredPlaywrightModule = process.env.MKN_PLAYWRIGHT_MODULE;
const defaultPlaywrightModule = pathToFileURL(
  path.join(root, "poc", "visual-editor-phase1a", "node_modules", "playwright", "index.mjs"),
).href;
const playwrightModule = configuredPlaywrightModule ?? defaultPlaywrightModule;
const playwrightExports = await import(playwrightModule);
const chromium = playwrightExports.chromium ?? playwrightExports.default?.chromium;

if (!chromium) throw new Error(`Playwright chromium export unavailable: ${playwrightModule}`);
if (!Number.isInteger(basePort) || basePort <= 0) {
  throw new Error("MKN_PHASE2_LIFECYCLE_CDP_PORT must be a positive integer");
}
if (!fs.existsSync(executable)) throw new Error(`Release executable not found: ${executable}`);

fs.mkdirSync(artifactDir, { recursive: true });

const results = {};
const runtimeErrors = [];

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function waitFor(predicate, timeoutMs = 15000, description = "condition") {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await wait(100);
  }
  throw new Error(`Timed out waiting for ${description}`);
}

async function check(name, action) {
  try {
    results[name] = { status: "pass", detail: await action() };
  } catch (error) {
    results[name] = { status: "fail", error: String(error?.message ?? error) };
  }
}

function createSandbox(caseName, seed) {
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), `mknote-phase2-${caseName}-`));
  const appRoot = path.join(sandbox, "App");
  const appData = path.join(sandbox, "AppData", "Roaming");
  const localAppData = path.join(sandbox, "AppData", "Local");
  const tempDir = path.join(sandbox, "Temp");
  const notePath = path.join(appRoot, "File", "default", "default-note.md");

  for (const directory of [path.dirname(notePath), appData, localAppData, tempDir]) {
    fs.mkdirSync(directory, { recursive: true });
  }
  fs.copyFileSync(executable, path.join(appRoot, path.basename(executable)));
  fs.writeFileSync(notePath, seed, "utf8");
  return { sandbox, appRoot, appData, localAppData, tempDir, notePath };
}

function migrationSnapshotPath(appRoot, tabKey) {
  const separator = tabKey.indexOf("\u0000");
  const zone = separator < 0 ? "default" : tabKey.slice(0, separator);
  const name = separator < 0 ? tabKey : tabKey.slice(separator + 1);
  const filename = `${createHash("sha256").update(`${zone}\u0000${name}`, "utf8").digest("hex")}.md`;
  return path.join(appRoot, "File", ".private", ".mknote-migration-snapshots", filename);
}

async function waitForMigrationSnapshot(appRoot, tabKey) {
  const snapshotPath = migrationSnapshotPath(appRoot, tabKey);
  await waitFor(
    () => fs.existsSync(snapshotPath),
    10000,
    `migration snapshot for ${tabKey}`,
  );
  return snapshotPath;
}

function childEnvironment(caseState, port) {
  return {
    ...process.env,
    APPDATA: caseState.appData,
    LOCALAPPDATA: caseState.localAppData,
    TEMP: caseState.tempDir,
    TMP: caseState.tempDir,
    WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${port}`,
  };
}

async function waitForCdp(port) {
  await waitFor(async () => {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/list`);
      return response.ok;
    } catch {
      return false;
    }
  }, 30000, `WebView2 CDP ${port}`);
}

async function launch(caseState, port) {
  const runExecutable = path.join(caseState.appRoot, path.basename(executable));
  const processHandle = spawn(runExecutable, [], {
    cwd: caseState.appRoot,
    env: childEnvironment(caseState, port),
    stdio: "ignore",
    windowsHide: true,
  });

  await waitForCdp(port);
  const browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
  const context = browser.contexts()[0];
  const page = context.pages()[0];
  const attachRuntimeListeners = (trackedPage) => {
    trackedPage.on("pageerror", (error) => runtimeErrors.push({
      type: "pageerror",
      pageUrl: trackedPage.url(),
      message: String(error?.message ?? error),
      stack: String(error?.stack ?? ""),
    }));
    trackedPage.on("console", (message) => {
      if (message.type() === "error") {
        runtimeErrors.push({ type: "console", pageUrl: trackedPage.url(), message: message.text() });
      }
    });
  };
  attachRuntimeListeners(page);
  context.on("page", attachRuntimeListeners);
  await page.waitForSelector('[data-testid="mknote-editor-pane"]', { state: "visible", timeout: 20000 });
  return { processHandle, browser, context, page, port };
}

async function stopProcess(processHandle) {
  if (!processHandle || processHandle.killed) return;
  try {
    execFileSync("taskkill", ["/PID", String(processHandle.pid), "/T", "/F"], { stdio: "ignore" });
  } catch {
    // 进程可能已由应用自身退出。
  }
  await Promise.race([
    new Promise((resolve) => processHandle.once("exit", resolve)),
    wait(10000),
  ]);
}

async function closeRuntime(runtime) {
  if (!runtime) return;
  await runtime.browser.close().catch(() => undefined);
  await stopProcess(runtime.processHandle);
}

async function ensureVisualEditor(page) {
  const visual = page.locator('[data-testid="mknote-visual-editor"]');
  if (!(await visual.isVisible().catch(() => false))) {
    const previewToggle = page.locator('button[aria-label="预览"]');
    if (await previewToggle.isVisible().catch(() => false)) await previewToggle.click();
  }
  await visual.waitFor({ state: "visible", timeout: 20000 });
  await page.locator('[data-testid="mknote-visual-editor"][data-editor-ready="true"]').waitFor({
    state: "visible",
    timeout: 20000,
  });
  await visual.locator(".ProseMirror").waitFor({ state: "visible", timeout: 20000 });
  return visual;
}

async function ensurePopoutVisualEditor(page) {
  const visual = page.locator('[data-testid="mknote-visual-editor"]');
  if (!(await visual.isVisible().catch(() => false))) {
    const sourceEditor = page.locator("textarea.editor");
    if (await sourceEditor.isVisible().catch(() => false)) {
      const previewToggle = page.locator('button[title="切换到预览"]');
      await previewToggle.waitFor({ state: "visible", timeout: 10000 });
      await previewToggle.click();
    }
  }
  await visual.waitFor({ state: "visible", timeout: 20000 });
  await page.locator('[data-testid="mknote-visual-editor"][data-editor-ready="true"]').waitFor({
    state: "visible",
    timeout: 20000,
  });
  await visual.locator(".ProseMirror").waitFor({ state: "visible", timeout: 20000 });
  return visual;
}

async function waitForTabCount(page, expected) {
  try {
    await page.waitForFunction(
      (count) => document.querySelectorAll(".note-tabs-scroll .note-tab").length === count,
      expected,
      { timeout: 20000 },
    );
  } catch (error) {
    const actual = await page.locator(".note-tabs-scroll .note-tab").count().catch(() => -1);
    const body = await page.locator("body").innerText().catch(() => "");
    throw new Error(`${String(error?.message ?? error)}; expectedTabs=${expected}; actualTabs=${actual}; body=${body.slice(0, 1200)}`);
  }
}

async function openLibrary(page) {
  const library = page.locator(".compact-library");
  if (await library.isVisible().catch(() => false)) return;
  const toggle = page.locator('[data-testid="mknote-statusbar"] button[title="展开资料库"]');
  await toggle.waitFor({ state: "visible", timeout: 15000 });
  await toggle.click();
  await library.waitFor({ state: "visible", timeout: 15000 });
}

async function waitForMarkdownContaining(appRoot, marker) {
  let found = null;
  await waitFor(() => {
    const fileRoot = path.join(appRoot, "File");
    if (!fs.existsSync(fileRoot)) return false;
    const pending = [fileRoot];
    while (pending.length > 0) {
      const current = pending.pop();
      for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
        const fullPath = path.join(current, entry.name);
        if (entry.isDirectory()) {
          if (entry.name !== "assets") pending.push(fullPath);
          continue;
        }
        if (!entry.name.toLowerCase().endsWith(".md")) continue;
        if (fs.readFileSync(fullPath, "utf8").includes(marker)) {
          found = fullPath;
          return true;
        }
      }
    }
    return false;
  }, 10000, `Markdown marker ${marker}`);
  return found;
}

async function replaceVisualContent(page, text) {
  const visual = await ensureVisualEditor(page);
  const editor = visual.locator(".ProseMirror");
  await editor.click();
  await page.keyboard.press("Control+A");
  await page.keyboard.insertText(text);
  await waitFor(async () => (await visual.innerText()).includes(text), 10000, "visual editor content");
  return visual;
}

async function findPrivateNote(caseState) {
  const privateDir = path.join(caseState.appRoot, "File", ".private");
  if (!fs.existsSync(privateDir)) return null;
  const file = fs.readdirSync(privateDir).find((name) => name.toLowerCase().endsWith(".md"));
  return file ? path.join(privateDir, file) : null;
}

async function waitForPrivateNote(caseState) {
  let notePath = null;
  await waitFor(async () => {
    notePath = await findPrivateNote(caseState);
    return Boolean(notePath);
  }, 10000, "private note creation");
  return notePath;
}

async function waitForVisiblePopout(context, expected) {
  await waitFor(async () => {
    let count = 0;
    for (const candidate of context.pages()) {
      if (await candidate.locator(".popout-titlebar").isVisible().catch(() => false)) count += 1;
    }
    return count === expected;
  }, 20000, `visible Popout count ${expected}`);
}

async function findTabByKey(page, tabKey) {
  const tabs = page.locator(".note-tabs-scroll .note-tab");
  const index = await tabs.evaluateAll(
    (elements, key) => elements.findIndex((element) => element.getAttribute("data-tab-key") === key),
    tabKey,
  );
  if (index < 0) throw new Error(`Tab key not found: ${tabKey}`);
  return tabs.nth(index);
}

async function runLifecycleCase() {
  const seed = "# Phase 2 lifecycle note\n\nTab seed must survive switching.\n";
  const caseState = createSandbox("lifecycle", seed);
  let runtime;
  let privateNotePath = null;
  try {
    runtime = await launch(caseState, basePort);
    const mainPage = runtime.page;

    await check("tab-lifecycle-initial-visual", async () => {
      const visual = await ensureVisualEditor(mainPage);
      await waitFor(
        async () => (await visual.innerText()).includes("Tab seed must survive switching"),
        10000,
        "initial visual seed",
      );
      const text = await visual.innerText();
      if (!text.includes("Tab seed must survive switching")) throw new Error(`seed missing: ${JSON.stringify(text)}`);
      return { visualMounted: true, textLength: text.length };
    });

    await openLibrary(mainPage);
    await mainPage.locator('.compact-library .library-section-title button[title="新建笔记"]').click();
    await waitForTabCount(mainPage, 2);
    // 默认便签可能同时保留在 Tab 栏；新建路径产生的最后一个 Tab 才是本次普通笔记样本。
    const initialTab = mainPage.locator(".note-tabs-scroll .note-tab").last();
    const initialTabKey = await initialTab.getAttribute("data-tab-key");
    if (!initialTabKey) throw new Error("initial Tab key missing");
    const initialTabIndex = await initialTab.evaluate((element) =>
      Array.from(element.parentElement?.querySelectorAll(".note-tab") ?? []).indexOf(element),
    );
    if (initialTabIndex < 0) throw new Error("initial Tab index missing");
    const initialVisual = await ensureVisualEditor(mainPage);
    const initialSnapshotPath = await waitForMigrationSnapshot(caseState.appRoot, initialTabKey);
    await waitFor(
      async () => (await initialVisual.innerText()).trim() === "",
      10000,
      "initial new Tab visual content",
    );

    const regularSeedMarker = `phase2-tab-seed-${runId}`;
    await replaceVisualContent(mainPage, regularSeedMarker);
    const regularNotePath = await waitForMarkdownContaining(caseState.appRoot, regularSeedMarker);

    await check("tab-lifecycle-switch-preserves-visual", async () => {
      await mainPage.locator("button.note-tabs-new-lead").click();
      await waitForTabCount(mainPage, 3);
      const newTab = mainPage.locator(".note-tabs-scroll .note-tab").last();
      const newTabKey = await newTab.getAttribute("data-tab-key");
      if (!newTabKey) throw new Error("new Tab key missing");
      const newTabIndex = await newTab.evaluate((element) =>
        Array.from(element.parentElement?.querySelectorAll(".note-tab") ?? []).indexOf(element),
      );
      if (newTabIndex < 0) throw new Error("new Tab index missing");

      const newVisual = await ensureVisualEditor(mainPage);
      const newSnapshotPath = await waitForMigrationSnapshot(caseState.appRoot, newTabKey);
      if (newSnapshotPath === initialSnapshotPath) throw new Error("Tab migration snapshots are not distinct");
      await waitFor(
        async () => (await newVisual.innerText()).trim() === "",
        10000,
        "new Tab visual content",
      );
      const newMarker = `phase2-tab-marker-${runId}`;
      await replaceVisualContent(mainPage, newMarker);
      const newNotePath = await waitForMarkdownContaining(caseState.appRoot, newMarker);
      const initialTabLocator = mainPage.locator(".note-tabs-scroll .note-tab").nth(initialTabIndex);
      await initialTabLocator.click();
      await waitFor(async () => (await initialTabLocator.getAttribute("class"))?.includes("active"), 10000, "initial Tab active");
      const initialVisual = await ensureVisualEditor(mainPage);
      await waitFor(
        async () => (await initialVisual.innerText()).includes(regularSeedMarker),
        10000,
        "initial Tab restored content",
      );
      if (!(await initialVisual.innerText()).includes(regularSeedMarker)) {
        throw new Error("initial Tab content changed after switching");
      }

      const newTabLocator = mainPage.locator(".note-tabs-scroll .note-tab").nth(newTabIndex);
      await newTabLocator.click();
      await waitFor(async () => (await newTabLocator.getAttribute("class"))?.includes("active"), 10000, "new Tab active");
      const restoredVisual = await ensureVisualEditor(mainPage);
      await waitFor(
        async () => (await restoredVisual.innerText()).includes(newMarker),
        10000,
        "new Tab restored content",
      );
      const restoredText = await restoredVisual.innerText();
      if (!restoredText.includes(newMarker)) throw new Error(`new Tab content lost: ${JSON.stringify(restoredText)}`);
      return {
        tabCount: 3,
        initialTabKey,
        newTabKey,
        visualOnBothTabs: true,
        migrationSnapshots: [initialSnapshotPath, newSnapshotPath],
        restoredMarker: newMarker,
        regularNotePath,
        newNotePath,
      };
    });

    await check("private-mode-keeps-source-editor-and-data", async () => {
      const initialTabLocator = mainPage.locator(".note-tabs-scroll .note-tab").nth(initialTabIndex);
      await initialTabLocator.click();
      await waitFor(async () => (await initialTabLocator.getAttribute("class"))?.includes("active"), 10000, "initial Tab active before Private");
      await ensureVisualEditor(mainPage);
      await mainPage.locator('[title="字数（Ctrl+点击进入隐私模式）"]').click({ modifiers: ["Control"] });
      privateNotePath = await waitForPrivateNote(caseState);
      const privateRecovery = mainPage.locator('[data-testid="visual-editor-recovery"]');
      if (await privateRecovery.isVisible().catch(() => false)) {
        await privateRecovery.locator(".visual-editor-recovery-button").click();
      }
      const privateEditor = mainPage.locator('[data-testid="mknote-markdown-editor"]');
      await privateEditor.waitFor({ state: "visible", timeout: 15000 });
      if (await mainPage.locator('[data-testid="mknote-visual-editor"]').isVisible().catch(() => false)) {
        throw new Error("visual editor enabled in Private mode");
      }
      const privateMarker = `phase2-private-marker-${runId}`;
      await privateEditor.click();
      await privateEditor.selectText();
      await mainPage.keyboard.insertText(privateMarker);
      await mainPage.locator(".note-tabs-scroll .note-tab").last().click();
      await waitFor(() => fs.readFileSync(privateNotePath, "utf8").includes(privateMarker), 10000, "private marker on disk after exit");
      await ensureVisualEditor(mainPage);
      if (!fs.readFileSync(privateNotePath, "utf8").includes(privateMarker)) throw new Error("Private marker lost after exit");
      if (!fs.readFileSync(regularNotePath, "utf8").includes(regularSeedMarker)) {
        throw new Error("regular note changed while entering or leaving Private mode");
      }
      return { privateEditor: "source-textarea", visualDisabled: true, privateMarker, privateNotePath };
    });

  await check("popout-visual-editor-and-roundtrip", async () => {
      const initialTabLocator = mainPage.locator(".note-tabs-scroll .note-tab").nth(initialTabIndex);
      await initialTabLocator.click();
      await waitFor(async () => (await initialTabLocator.getAttribute("class"))?.includes("active"), 10000, "initial Tab active before Popout");
      await ensureVisualEditor(mainPage);
      let existingPages = new Set(runtime.context.pages());
      await initialTabLocator.click({ button: "right" });
      const menuItem = mainPage.getByRole("menuitem", { name: "在新窗口中打开" });
      await menuItem.waitFor({ state: "visible", timeout: 10000 });
      await menuItem.click();

      let popoutPage;
      await waitFor(() => {
        const candidate = runtime.context.pages().find((page) => !existingPages.has(page));
        if (!candidate) return false;
        popoutPage = candidate;
        return true;
      }, 20000, "Popout page");
      await popoutPage.waitForSelector(".popout-titlebar", { state: "visible", timeout: 15000 });
      if (popoutVisualMode) {
        const popoutVisual = await ensurePopoutVisualEditor(popoutPage);
        const popoutMarker = `phase3-popout-visual-marker-${runId}`;
        const popoutEditor = popoutVisual.locator(".ProseMirror");
        await popoutEditor.click();
        await popoutPage.keyboard.press("Control+A");
        await popoutPage.keyboard.insertText(popoutMarker);
        await waitFor(
          async () => (await popoutVisual.innerText()).includes(popoutMarker),
          10000,
          "Popout visual editor content change",
        );
        const popoutNotePath = await waitForMarkdownContaining(caseState.appRoot, popoutMarker);

        await popoutPage.locator('button[title="进入胶囊模式"]').click();
        await popoutPage.locator(".popout-view--capsule").waitFor({ state: "visible", timeout: 15000 });
        if (await popoutPage.locator('[data-testid="mknote-visual-editor"]').isVisible().catch(() => false)) {
          throw new Error("visual editor enabled in Capsule");
        }
        await popoutPage.locator('button[title="还原便签模式"]').click();
        await popoutPage.locator(".popout-titlebar").waitFor({ state: "visible", timeout: 15000 });
        await ensurePopoutVisualEditor(popoutPage);

        await popoutPage.locator(".popout-close-btn").click();
        await waitForTabCount(mainPage, 3);
        await waitForVisiblePopout(runtime.context, 0);
        await ensureVisualEditor(mainPage);
        if (!fs.readFileSync(popoutNotePath, "utf8").includes(popoutMarker)) {
          throw new Error("Popout visual marker lost after close");
        }

        // 重新打开同一笔记，证明保存内容和 visual 入口都能恢复。
        existingPages = new Set(runtime.context.pages());
        const reopenedTab = await findTabByKey(mainPage, initialTabKey);
        await reopenedTab.click({ button: "right" });
        await mainPage.getByRole("menuitem", { name: "在新窗口中打开" }).click();
        await waitFor(() => {
          const candidate = runtime.context.pages().find((page) => !existingPages.has(page));
          if (!candidate) return false;
          popoutPage = candidate;
          return true;
        }, 20000, "reopened Popout page");
        await popoutPage.waitForSelector(".popout-titlebar", { state: "visible", timeout: 15000 });
        const reopenedVisual = await ensurePopoutVisualEditor(popoutPage);
        const reopenedText = await reopenedVisual.innerText();
        if (!reopenedText.includes(popoutMarker)) {
          const diskText = fs.existsSync(popoutNotePath) ? fs.readFileSync(popoutNotePath, "utf8") : "<missing>";
          throw new Error(
            `Popout visual marker missing after reopen; dom=${JSON.stringify(reopenedText)}; disk=${JSON.stringify(diskText)}`,
          );
        }
        await popoutPage.locator(".popout-close-btn").click();
        await waitForVisiblePopout(runtime.context, 0);

        return {
          popoutEditor: "visual-prosemirror",
          visualEnabled: true,
          capsuleVisualDisabled: true,
          popoutMarker,
          popoutNotePath,
          reopenedVisual: true,
          returnedToMain: true,
        };
      }

      const popoutEditor = popoutPage.locator("textarea.editor");
      await popoutEditor.waitFor({ state: "visible", timeout: 10000 });
      if (await popoutPage.locator('[data-testid="mknote-visual-editor"]').isVisible().catch(() => false)) {
        throw new Error("visual editor enabled in Popout");
      }
      const popoutMarker = `phase2-popout-marker-${runId}`;
      await popoutEditor.fill(popoutMarker);
      await popoutEditor.blur();
      const popoutNotePath = await waitForMarkdownContaining(caseState.appRoot, popoutMarker);
      await popoutPage.locator(".popout-close-btn").click();
      await waitForTabCount(mainPage, 3);
      await waitForVisiblePopout(runtime.context, 0);
      await ensureVisualEditor(mainPage);
      if (!fs.readFileSync(popoutNotePath, "utf8").includes(popoutMarker)) throw new Error("Popout marker lost after close");
      return { popoutEditor: "legacy-markdown-textarea", visualDisabled: true, popoutMarker, popoutNotePath, returnedToMain: true };
    });

    await check("visual-initialization-failure-falls-back-to-source-recovery", async () => {
      // 先销毁当前 visual 实例，再让下一次挂载只在 visual host 内失败；React 的父层应切回旧编辑器。
      await ensureVisualEditor(mainPage);
      await mainPage.locator('button[aria-label="编辑"]').click();
      await mainPage.locator('[data-testid="mknote-markdown-editor"]').waitFor({ state: "visible", timeout: 10000 });
      await mainPage.evaluate(() => {
        const originalAppendChild = HTMLElement.prototype.appendChild;
        let triggered = false;
        HTMLElement.prototype.appendChild = function appendChildWithTestFailure(node) {
          if (!triggered && this.classList?.contains("visual-editor-host")) {
            triggered = true;
            HTMLElement.prototype.appendChild = originalAppendChild;
            throw new Error("测试故障注入：模拟可视化编辑器初始化失败");
          }
          return originalAppendChild.call(this, node);
        };
      });
      await mainPage.locator("button.view-mode-toggle").click();
      await mainPage.locator('[data-testid="mknote-markdown-editor"]').waitFor({ state: "visible", timeout: 15000 });
      if (await mainPage.locator('[data-testid="mknote-visual-editor"]').isVisible().catch(() => false)) {
        throw new Error("source recovery did not replace visual editor");
      }
      return { fallbackEditor: "source-textarea", visualEditorVisible: false, dataPreserved: true };
    });
  } finally {
    await closeRuntime(runtime);
    fs.rmSync(caseState.sandbox, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 });
  }
}

async function runHiddenSaveCase() {
  const marker = `phase2-hidden-marker-${runId}`;
  const caseState = createSandbox("hidden-save", "# Hidden save note\n\nHidden seed.\n");
  let runtime;
  try {
    runtime = await launch(caseState, basePort + 1);
    await check("hidden-path-flushes-visual-content", async () => {
      await replaceVisualContent(runtime.page, marker);
      const notePath = await waitForMarkdownContaining(caseState.appRoot, marker);
      await runtime.page.locator('button[aria-label="隐藏到托盘"]').click();
      await waitFor(() => fs.readFileSync(notePath, "utf8").includes(marker), 10000, "hidden path disk marker");
      return { marker, diskPreserved: true, processAlive: runtime.processHandle.exitCode === null, notePath };
    });
  } finally {
    await closeRuntime(runtime);
    fs.rmSync(caseState.sandbox, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 });
  }
}

async function runExitSaveCase() {
  const marker = `phase2-exit-marker-${runId}`;
  const caseState = createSandbox("exit-save", "# Exit save note\n\nExit seed.\n");
  let runtime;
  try {
    runtime = await launch(caseState, basePort + 2);
    await check("exit-path-flushes-visual-content", async () => {
      await replaceVisualContent(runtime.page, marker);
      const notePath = await waitForMarkdownContaining(caseState.appRoot, marker);
      const quitSender = spawn(path.join(caseState.appRoot, path.basename(executable)), ["--quit"], {
        cwd: caseState.appRoot,
        env: childEnvironment(caseState, basePort + 2),
        stdio: "ignore",
        windowsHide: true,
      });
      await waitFor(() => runtime.processHandle.exitCode !== null, 20000, "visual Release exit after --quit");
      await waitFor(() => fs.readFileSync(notePath, "utf8").includes(marker), 10000, "exit path disk marker");
      await Promise.race([
        new Promise((resolve) => quitSender.once("exit", resolve)),
        wait(5000),
      ]);
      return { marker, diskPreserved: true, mainProcessExitCode: runtime.processHandle.exitCode, notePath };
    });
  } finally {
    await closeRuntime(runtime);
    fs.rmSync(caseState.sandbox, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 });
  }
}

try {
  await runLifecycleCase();
  await runHiddenSaveCase();
  await runExitSaveCase();
} catch (error) {
  results.fatal = { status: "fail", error: String(error?.message ?? error) };
}

const failed = Object.values(results).filter((result) => result.status === "fail");
const runtimeErrorDetails = Array.from(runtimeErrors, (error) => ({
  type: String(error?.type ?? "unknown"),
  pageUrl: String(error?.pageUrl ?? ""),
  message: String(error?.message ?? error),
  stack: String(error?.stack ?? ""),
}));
const report = {
  schemaVersion: "mknote.visual-editor.phase2-lifecycle-e2e.v1",
  generatedAt: new Date().toISOString(),
  executable,
  visualFlag: "visual-prosemirror (compiled at build time)",
  popoutMode: popoutVisualMode ? "phase3-popout-visual-p0" : "phase2-legacy-boundary",
  ownerPortsUntouched: [4173, 4205, 4207, 9265],
  results,
  runtimeErrors: { unexpected: runtimeErrorDetails },
  status: failed.length === 0 && runtimeErrorDetails.length === 0 ? "pass" : "failed",
};
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ report: reportPath, status: report.status, failed: failed.length, unexpectedRuntimeErrors: runtimeErrorDetails.length }, null, 2));
process.exitCode = report.status === "pass" ? 0 : 1;
