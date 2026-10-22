/**
 * Phase 2 P0 生产纵向切片隔离探针。
 *
 * 该脚本运行已构建的 visual-prosemirror Release 副本，所有笔记、用户数据、
 * WebView2 CDP 端口和进程树都与 Owner 实例隔离。它不修改正式 T4 manifest。
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";

const root = path.resolve(import.meta.dirname, "..");
const configuredExecutable = process.env.MKN_PHASE2_EXECUTABLE?.trim();
const executable = configuredExecutable
  ? path.resolve(configuredExecutable)
  : path.join(root, "src-tauri", "target", "release", "md-sticky-note.exe");
const artifactDir = path.join(root, "poc", "visual-editor-phase1a", "artifacts", "phase2-production");
const runId = process.env.MKN_PHASE2_RUN_ID ?? new Date().toISOString().replace(/[:.]/g, "-");
const basePort = Number(process.env.MKN_PHASE2_CDP_PORT ?? 9271);
const reportPath = path.join(artifactDir, `phase2-production-e2e-${runId}.json`);
const configuredPlaywrightModule = process.env.MKN_PLAYWRIGHT_MODULE;
const defaultPlaywrightModule = pathToFileURL(
  path.join(root, "poc", "visual-editor-phase1a", "node_modules", "playwright", "index.mjs"),
).href;
const playwrightModule = configuredPlaywrightModule ?? defaultPlaywrightModule;
const playwrightExports = await import(playwrightModule);
const chromium = playwrightExports.chromium ?? playwrightExports.default?.chromium;

if (!chromium) throw new Error(`Playwright chromium export unavailable: ${playwrightModule}`);
if (!Number.isInteger(basePort) || basePort <= 0) throw new Error("MKN_PHASE2_CDP_PORT must be a positive integer");
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
  const webviewData = path.join(sandbox, "WebView2");
  const tempDir = path.join(sandbox, "Temp");
  const notePath = path.join(appRoot, "File", "default", "default-note.md");

  for (const directory of [path.dirname(notePath), appData, localAppData, webviewData, tempDir]) {
    fs.mkdirSync(directory, { recursive: true });
  }
  fs.copyFileSync(executable, path.join(appRoot, path.basename(executable)));
  fs.writeFileSync(notePath, seed, "utf8");
  return { sandbox, appRoot, appData, localAppData, webviewData, tempDir, notePath };
}

function childEnvironment(caseState, port, extraEnvironment = {}) {
  const inheritedBrowserArgs = process.env.WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS?.trim();
  return {
    ...process.env,
    ...extraEnvironment,
    APPDATA: caseState.appData,
    LOCALAPPDATA: caseState.localAppData,
    WEBVIEW2_USER_DATA_FOLDER: caseState.webviewData,
    TEMP: caseState.tempDir,
    TMP: caseState.tempDir,
    WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: [inheritedBrowserArgs, `--remote-debugging-port=${port}`]
      .filter(Boolean)
      .join(" "),
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

async function launch(caseState, port, extraEnvironment = {}) {
  const runExecutable = path.join(caseState.appRoot, path.basename(executable));
  const processHandle = spawn(runExecutable, [], {
    cwd: caseState.appRoot,
    env: childEnvironment(caseState, port, extraEnvironment),
    stdio: ["ignore", "ignore", "pipe"],
    windowsHide: true,
  });

  const stderrChunks = [];
  processHandle.stderr?.on("data", (chunk) => stderrChunks.push(String(chunk)));
  try {
    await waitForCdp(port);
  } catch (error) {
    try {
      execFileSync("taskkill", ["/PID", String(processHandle.pid), "/T", "/F"], { stdio: "ignore" });
    } catch {
      // 启动失败时只清理本次探针子进程；Owner 实例不在此进程树中。
    }
    throw new Error(
      `${String(error?.message ?? error)}; process=${JSON.stringify({
        pid: processHandle.pid,
        exitCode: processHandle.exitCode,
        signalCode: processHandle.signalCode,
        stderr: stderrChunks.join("").slice(-4000),
      })}`,
    );
  }
  const browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
  const context = browser.contexts()[0];
  const page = context.pages()[0];
  page.on("pageerror", (error) => runtimeErrors.push({ type: "pageerror", message: String(error) }));
  page.on("console", (message) => {
    if (message.type() === "error") {
      runtimeErrors.push({
        type: "console",
        message: message.text(),
        location: message.location(),
      });
    }
  });
  await page.waitForSelector('[data-testid="mknote-editor-pane"]', { state: "visible", timeout: 20000 });
  return { processHandle, browser, page, port };
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

async function cleanupSandbox(sandbox) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
      fs.rmSync(sandbox, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 });
      return;
    } catch (error) {
      if (attempt === 19) {
        console.warn(`隔离 sandbox 清理延迟，保留临时目录：${sandbox}; ${String(error?.message ?? error)}`);
        return;
      }
      await wait(250);
    }
  }
}

async function ensureVisualEditor(page) {
  await page.waitForSelector('[data-testid="mknote-editor-pane"]', {
    state: "visible",
    timeout: 20000,
  });
  const visual = page.locator('[data-testid="mknote-visual-editor"]');
  // Visual Editor 是 lazy chunk：预览模式下节点尚未挂载时不能误点一次切换按钮。
  const pane = page.locator('[data-testid="mknote-editor-pane"]');
  if ((await pane.getAttribute("data-view-mode")) === "edit") {
    const previewToggle = page.locator('button[aria-label="预览"]');
    if (await previewToggle.isVisible().catch(() => false)) await previewToggle.click();
  }
  await visual.waitFor({ state: "visible", timeout: 20000 });
  await visual.locator(".ProseMirror").waitFor({ state: "visible", timeout: 20000 });
  await waitFor(
    async () => (await visual.innerText()).trim().length > 0,
    10000,
    "visual editor initial content",
  );
  return visual;
}

async function clickVisiblePoint(page, locator, description) {
  await locator.scrollIntoViewIfNeeded();
  const point = await locator.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2, width: rect.width, height: rect.height };
  });
  if (point.width <= 0 || point.height <= 0) {
    throw new Error(`${description} has no visible geometry: ${JSON.stringify(point)}`);
  }
  await page.mouse.click(point.x, point.y);
}

async function bodyText(page) {
  return page.locator("body").innerText();
}

async function replaceVisualContent(page, text) {
  const visual = await ensureVisualEditor(page);
  const editor = visual.locator(".ProseMirror");
  await editor.click();
  await page.keyboard.press("Control+A");
  await page.keyboard.insertText(text);
  await waitFor(async () => (await visual.innerText()).includes(text), 10000, "visual editor content change");
  return visual;
}

async function selectVisualText(visual, selectedText) {
  const editor = visual.locator(".ProseMirror");
  await editor.click();
  await editor.press("Control+A");
  const wholeDocumentSelected = await editor.evaluate((node, text) => {
    const selection = window.getSelection();
    return selection?.toString() === text && selection.rangeCount > 0;
  }, selectedText);
  if (wholeDocumentSelected) return;
  await editor.focus();
  await editor.evaluate((node, text) => {
    const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
    let current = walker.nextNode();
    while (current) {
      const value = current.nodeValue ?? "";
      const start = value.indexOf(text);
      if (start >= 0) {
        const range = document.createRange();
        range.setStart(current, start);
        range.setEnd(current, start + text.length);
        const selection = window.getSelection();
        selection?.removeAllRanges();
        selection?.addRange(range);
        document.dispatchEvent(new Event("selectionchange", { bubbles: true }));
        return;
      }
      current = walker.nextNode();
    }
    throw new Error(
      `visual selection text was not found: ${text}; ` +
        JSON.stringify({
          innerText: node.innerText,
          textContent: node.textContent,
          html: node.innerHTML,
        }),
    );
  }, selectedText);
}

async function clickMarkdownToolbarAction(page, title) {
  // 加粗/斜体等字体动作位于左侧编辑工具栏，其余 Markdown 动作位于顶部横向工具栏。
  const button = page.locator(`button[title="${title}"]`);
  try {
    await button.waitFor({ state: "visible", timeout: 10000 });
  } catch (error) {
    const toolbarState = await page.evaluate(() =>
      Array.from(document.querySelectorAll("button.markdown-toolbar-btn")).map((item) => ({
        title: item.getAttribute("title"),
        visible: Boolean(item.getClientRects().length),
        display: getComputedStyle(item).display,
        parentDisplay: getComputedStyle(item.parentElement ?? item).display,
      })),
    );
    throw new Error(
      `${String(error?.message ?? error)}; toolbar=${JSON.stringify(toolbarState)}; ` +
        `body=${JSON.stringify((await page.locator("body").innerText()).slice(0, 1200))}`,
    );
  }
  await button.click();
}

async function waitForDiskMarker(notePath, marker, shouldContain = true) {
  try {
    await waitFor(() => {
      if (!fs.existsSync(notePath)) return false;
      const content = fs.readFileSync(notePath, "utf8");
      return shouldContain ? content.includes(marker) : !content.includes(marker);
    }, 10000, shouldContain ? `disk marker ${marker}` : `disk absence of ${marker}`);
  } catch (error) {
    const content = fs.existsSync(notePath) ? fs.readFileSync(notePath, "utf8") : null;
    throw new Error(
      `${String(error?.message ?? error)}; disk=${JSON.stringify(content)}`,
    );
  }
}

function migrationSnapshotPath(appRoot, zone, name) {
  const key = `${zone}\0${name}`;
  const filename = `${createHash("sha256").update(key, "utf8").digest("hex")}.md`;
  return path.join(appRoot, "File", ".private", ".mknote-migration-snapshots", filename);
}

async function runNormalCase() {
  const seed = "# Phase 2 isolated note\n\nProduction visual editor seed.\n\n- list item\n- [ ] task item\n";
  const caseState = createSandbox("normal", seed);
  let runtime;
  try {
    runtime = await launch(caseState, basePort);
    await check("normal-load-visual-editor", async () => {
      const visual = await ensureVisualEditor(runtime.page);
      const text = await visual.innerText();
      if (!text.includes("Production visual editor seed")) throw new Error(`seed missing: ${JSON.stringify(text)}`);
      if (await runtime.page.locator('[data-testid="mknote-preview-editor"]').isVisible().catch(() => false)) {
        throw new Error("legacy preview editor is visible while visual flag is active");
      }
      return { visualMounted: true, textLength: text.length };
    });

    await check("migration-snapshot-created-without-recording-body", async () => {
      const snapshotPath = migrationSnapshotPath(caseState.appRoot, "default", "default-note.md");
      await waitFor(() => fs.existsSync(snapshotPath), 10000, "visual editor migration snapshot");
      const snapshotContent = fs.readFileSync(snapshotPath, "utf8");
      const snapshotFiles = fs.readdirSync(path.dirname(snapshotPath));
      if (snapshotContent !== seed) {
        throw new Error("migration snapshot does not preserve the first source content");
      }
      if (snapshotFiles.length !== 1) {
        throw new Error(`expected one migration snapshot, found ${snapshotFiles.length}`);
      }
      return {
        snapshotCreated: true,
        snapshotFileCount: snapshotFiles.length,
        snapshotByteLength: Buffer.byteLength(snapshotContent, "utf8"),
        snapshotBodyRecorded: false,
      };
    });

    await check("visual-list-and-task-render", async () => {
      const visual = await ensureVisualEditor(runtime.page);
      const listCount = await visual.locator("ul").count();
      const taskCount = await visual.locator('li[data-item-type="task"]').count();
      if (listCount < 1 || taskCount < 1) throw new Error(`P0 list/task nodes missing: ${JSON.stringify({ listCount, taskCount })}`);
      return { listCount, taskCount };
    });

  await check("visual-blockquote-persistence", async () => {
    const visual = await ensureVisualEditor(runtime.page);
    const paragraph = visual
      .locator(".ProseMirror p")
      .filter({ hasText: "Production visual editor seed" })
      .first();
    await paragraph.click();
    await runtime.page.keyboard.press("Control+Shift+B");
    await waitFor(
      async () =>
        (await visual
          .locator("blockquote p")
          .filter({ hasText: "Production visual editor seed" })
          .count()) === 1,
      10000,
      "visual blockquote command",
    );
    await waitForDiskMarker(caseState.notePath, "> Production visual editor seed");
    const savedMarkdown = fs.readFileSync(caseState.notePath, "utf8");

    await closeRuntime(runtime);
    runtime = await launch(caseState, basePort + 4);
    const reopenedVisual = await ensureVisualEditor(runtime.page);
    await waitFor(
      async () =>
        (await reopenedVisual
          .locator("blockquote p")
          .filter({ hasText: "Production visual editor seed" })
          .count()) === 1,
      10000,
      "reopened visual blockquote",
    );

    return { savedMarkdown, reopened: true };
  });

  await check("visual-selection-replace", async () => {
      const visual = await replaceVisualContent(runtime.page, "selection source");
      await visual.locator(".ProseMirror").selectText();
      await runtime.page.keyboard.insertText("selection replacement");
      await waitFor(async () => (await visual.innerText()).includes("selection replacement"), 10000, "visual selection replacement");
      const text = await visual.innerText();
      if (text.includes("selection source")) throw new Error(`selection source survived: ${JSON.stringify(text)}`);
      return { text };
    });

    await check("visual-undo-redo", async () => {
      const visual = await replaceVisualContent(runtime.page, "undo baseline");
      const editor = visual.locator(".ProseMirror");
      await editor.click();
      await runtime.page.keyboard.insertText(" plus");
      await waitFor(async () => (await visual.innerText()).includes("undo baseline plus"), 10000, "visual undo input");
      await runtime.page.keyboard.press("Control+Z");
      await waitFor(async () => !(await visual.innerText()).includes(" plus"), 10000, "visual undo");
      const afterUndo = await visual.innerText();
      await runtime.page.keyboard.press("Control+Y");
      await waitFor(async () => (await visual.innerText()).includes("undo baseline plus"), 10000, "visual redo");
      const afterRedo = await visual.innerText();
      return { afterUndo, afterRedo };
    });

    const marker = `phase2-visual-save-${runId}`;
    await check("normal-edit-and-save", async () => {
      const visual = await replaceVisualContent(runtime.page, marker);
      await waitForDiskMarker(caseState.notePath, marker);
      return { marker, editorTextLength: (await visual.innerText()).length };
    });

    await closeRuntime(runtime);
    runtime = await launch(caseState, basePort + 1);
    await check("normal-reopen-preserves-saved-content", async () => {
      const visual = await ensureVisualEditor(runtime.page);
      const text = await visual.innerText();
      if (!text.includes(marker)) throw new Error(`saved marker missing after restart: ${JSON.stringify(text)}`);
      return { marker, textLength: text.length };
    });
  } finally {
    await closeRuntime(runtime);
    await cleanupSandbox(caseState.sandbox);
  }
}

async function runTaskPersistenceCase() {
  const seed =
    "# 任务清单\n\n- [ ] 顶层未完成任务 中文\n  - [x] Nested done task\n  - [ ] 嵌套任务待完成\n- [x] 顶层已完成任务\n";
  const caseState = createSandbox("task-persistence", seed);
  let runtime;
  try {
    runtime = await launch(caseState, basePort + 14);
    await check("visual-task-persistence", async () => {
      const visual = await ensureVisualEditor(runtime.page);
      const tasks = visual.locator('li[data-item-type="task"]');
      await waitFor(
        async () => (await tasks.count()) === 4,
        10000,
        "nested Chinese task nodes",
      );
      const checkboxes = visual.locator('li[data-item-type="task"] input[type="checkbox"]');
      const initialStates = await checkboxes.evaluateAll((elements) =>
        elements.map((element) => element.checked),
      );
      if (JSON.stringify(initialStates) !== JSON.stringify([false, true, false, true])) {
        throw new Error(`unexpected initial task states: ${JSON.stringify(initialStates)}`);
      }

      // 顶层任务的 li 还包含嵌套任务；其第一个 checkbox 才是当前节点自身。
      const firstTaskCheckbox = tasks.first().locator('input[type="checkbox"]').first();
      await firstTaskCheckbox.click();
      await waitFor(
        async () => (await firstTaskCheckbox.isChecked()) === true,
        10000,
        "task checkbox click",
      );
      await waitForDiskMarker(caseState.notePath, "- [x] 顶层未完成任务 中文");
      return { initialStates, clicked: true, diskPreserved: true };
    });

    await closeRuntime(runtime);
    runtime = await launch(caseState, basePort + 15);
    await check("visual-task-persistence-reopened", async () => {
      const visual = await ensureVisualEditor(runtime.page);
      const checkboxes = visual.locator('li[data-item-type="task"] input[type="checkbox"]');
      await waitFor(
        async () => (await checkboxes.count()) === 4,
        10000,
        "reopened task nodes",
      );
      const reopenedStates = await checkboxes.evaluateAll((elements) =>
        elements.map((element) => element.checked),
      );
      if (JSON.stringify(reopenedStates) !== JSON.stringify([true, true, false, true])) {
        throw new Error(`task state changed after reopen: ${JSON.stringify(reopenedStates)}`);
      }
      return { reopened: true, reopenedStates };
    });
  } finally {
    await closeRuntime(runtime);
    await cleanupSandbox(caseState.sandbox);
  }
}

async function runCodeBlockCase() {
  const caseState = createSandbox(
    "code-block",
    "# Code block note\n\nCode block persistence seed\n",
  );
  let runtime;
  try {
    runtime = await launch(caseState, basePort + 5);
    await check("visual-code-block-persistence", async () => {
      const visual = await ensureVisualEditor(runtime.page);
      const paragraph = visual
        .locator(".ProseMirror p")
        .filter({ hasText: "Code block persistence seed" })
        .first();
      await paragraph.click();
      await runtime.page.keyboard.press("Home");
      await runtime.page.keyboard.insertText("```");
      await runtime.page.keyboard.press("Space");
      await waitFor(
        async () => (await visual.locator("pre code").count()) === 1,
        10000,
        "visual code block command",
      );
      await runtime.page.keyboard.insertText("const answer = 42;");
      await waitFor(
        async () => (await visual.locator("pre code").innerText()).includes("const answer = 42;"),
        10000,
        "visual code block input",
      );
      await waitForDiskMarker(caseState.notePath, "```");
      await waitForDiskMarker(caseState.notePath, "const answer = 42;");
      const savedMarkdown = fs.readFileSync(caseState.notePath, "utf8");
      await closeRuntime(runtime);
      runtime = await launch(caseState, basePort + 6);
      const reopenedVisual = await ensureVisualEditor(runtime.page);
      await waitFor(
        async () => (await reopenedVisual.locator("pre code").innerText()).includes("const answer = 42;"),
        10000,
        "reopened visual code block",
      );
      return { savedMarkdown, reopened: true };
    });
  } finally {
    await closeRuntime(runtime);
    await cleanupSandbox(caseState.sandbox);
  }
}

async function runFindReplaceCase() {
  const query = "needle";
  const currentReplacement = "current-replacement";
  const allReplacement = "all-replacement";
  const caseState = createSandbox(
    "find-replace",
    "# Find and replace note\n\nneedle first\n\nneedle second\n\nneedle third\n",
  );
  let runtime;
  try {
    runtime = await launch(caseState, basePort + 11);
    await check("visual-find-replace-persistence", async () => {
      const visual = await ensureVisualEditor(runtime.page);
      await runtime.page.getByTestId("visual-editor-find-replace-toggle").click();
      const panel = runtime.page.getByTestId("visual-editor-find-replace-panel");
      await panel.waitFor({ state: "visible", timeout: 10000 });

      const queryInput = runtime.page.getByTestId("visual-editor-find-query");
      const replacementInput = runtime.page.getByTestId("visual-editor-replace-text");
      await queryInput.fill(query);
      await replacementInput.fill(currentReplacement);
      await runtime.page.getByTestId("visual-editor-find-next").click();
      await waitFor(
        async () => (await runtime.page.getByTestId("visual-editor-find-status").innerText()) === "已选中匹配项",
        10000,
        "find next status",
      );

      await runtime.page.getByTestId("visual-editor-replace-current").click();
      await waitFor(
        async () => {
          const text = await visual.innerText();
          return text.includes("current-replacement first") && (text.match(/needle/g)?.length ?? 0) === 2;
        },
        10000,
        "current replacement in visual editor",
      );
      await waitForDiskMarker(caseState.notePath, currentReplacement);

      await replacementInput.fill(allReplacement);
      await runtime.page.getByTestId("visual-editor-replace-all").click();
      await waitFor(
        async () => {
          const text = await visual.innerText();
          return (
            text.includes("all-replacement second") &&
            text.includes("all-replacement third") &&
            !text.includes(query)
          );
        },
        10000,
        "all replacement in visual editor",
      );
      await waitForDiskMarker(caseState.notePath, allReplacement);
      const savedMarkdown = fs.readFileSync(caseState.notePath, "utf8");
      if (savedMarkdown.includes(query) || !savedMarkdown.includes(currentReplacement)) {
        throw new Error(`saved find/replace result is incomplete: ${JSON.stringify(savedMarkdown)}`);
      }

      await closeRuntime(runtime);
      runtime = await launch(caseState, basePort + 12);
      const reopenedVisual = await ensureVisualEditor(runtime.page);
      await waitFor(
        async () => {
          const text = await reopenedVisual.innerText();
          return (
            text.includes("current-replacement first") &&
            text.includes("all-replacement second") &&
            text.includes("all-replacement third") &&
            !text.includes(query)
          );
        },
        10000,
        "reopened find/replace content",
      );

      return {
        found: true,
        replacedCurrent: true,
        replacedAll: 2,
        saved: true,
        reopened: true,
        savedMarkdown,
      };
    });
  } finally {
    await closeRuntime(runtime);
    await cleanupSandbox(caseState.sandbox);
  }
}

async function runDividerCase() {
  const caseState = createSandbox(
    "divider",
    "# Divider note\n\nDivider persistence seed\n",
  );
  let runtime;
  try {
    runtime = await launch(caseState, basePort + 9);
    await check("visual-divider-persistence", async () => {
      const visual = await ensureVisualEditor(runtime.page);
      const paragraph = visual
        .locator(".ProseMirror p")
        .filter({ hasText: "Divider persistence seed" })
        .first();
      await paragraph.click();
      await clickMarkdownToolbarAction(runtime.page, "分割线");
      await waitFor(
        async () => (await visual.locator(".ProseMirror hr").count()) === 1,
        10000,
        "top toolbar divider insert",
      );
      await waitFor(
        () => {
          if (!fs.existsSync(caseState.notePath)) return false;
          const markdown = fs.readFileSync(caseState.notePath, "utf8");
          return /(?:^|\r?\n)\s*(?:---|\*\*\*|___)\s*(?:\r?\n|$)/m.test(markdown);
        },
        10000,
        "disk thematic break",
      );
      const savedMarkdown = fs.readFileSync(caseState.notePath, "utf8");

      await closeRuntime(runtime);
      runtime = await launch(caseState, basePort + 10);
      const reopenedVisual = await ensureVisualEditor(runtime.page);
      await waitFor(
        async () => (await reopenedVisual.locator(".ProseMirror hr").count()) === 1,
        10000,
        "reopened visual divider",
      );
      return {
        savedMarkdown,
        reopened: true,
        dividerCount: await reopenedVisual.locator(".ProseMirror hr").count(),
      };
    });
  } finally {
    await closeRuntime(runtime);
    await cleanupSandbox(caseState.sandbox);
  }
}

async function runTableCase() {
  const caseState = createSandbox(
    "table",
    "# Table note\n\nTable persistence seed\n",
  );
  let runtime;
  try {
    runtime = await launch(caseState, basePort + 7);
    await check("visual-table-persistence", async () => {
      const visual = await ensureVisualEditor(runtime.page);
      const paragraph = visual
        .locator(".ProseMirror p")
        .filter({ hasText: "Table persistence seed" })
        .first();
      await paragraph.click();
      await runtime.page.keyboard.press("Home");
      await clickMarkdownToolbarAction(runtime.page, "表格");
      await waitFor(
        async () => (await visual.locator(".ProseMirror table").count()) === 1,
        10000,
        "top toolbar table insert",
      );

      const firstHeader = visual.locator(".ProseMirror table th").first();
      await runtime.page.keyboard.insertText("Header");
      await waitFor(
        async () => (await firstHeader.innerText()).includes("Header"),
        10000,
        "visual table cell input",
      );
      for (let index = 0; index < 4; index += 1) {
        await runtime.page.keyboard.press("Tab");
      }
      await waitFor(
        async () => (await visual.locator(".ProseMirror table tr").count()) === 3,
        10000,
        "visual table row append",
      );

      const secondHeaderCell = visual.locator(".ProseMirror table th").nth(1);
      await clickVisiblePoint(runtime.page, secondHeaderCell, "second table header");
      const alignedHeaderCell = visual.locator(".ProseMirror table th").first();
      await clickVisiblePoint(runtime.page, alignedHeaderCell, "first table header");
      await runtime.page.getByTestId("visual-editor-table-align-left").click();
      await waitFor(
        async () => (await alignedHeaderCell.getAttribute("style"))?.includes("text-align: left") === true,
        10000,
        "visual table left alignment",
      );
      await runtime.page.getByTestId("visual-editor-table-align-center").click();
      await waitFor(
        async () => (await alignedHeaderCell.getAttribute("style"))?.includes("text-align: center") === true,
        10000,
        "visual table center alignment",
      );
      await runtime.page.getByTestId("visual-editor-table-align-right").click();
      await waitFor(
        async () => (await alignedHeaderCell.getAttribute("style"))?.includes("text-align: right") === true,
        10000,
        "visual table right alignment",
      );
      await runtime.page.getByTestId("visual-editor-table-align-center").click();
      await waitFor(
        async () => (await alignedHeaderCell.getAttribute("style"))?.includes("text-align: center") === true,
        10000,
        "visual table center alignment before persistence",
      );

      await runtime.page.getByTestId("visual-editor-table-add-column").click();
      await waitFor(
        async () => {
          const widths = await visual.locator(".ProseMirror table tr").evaluateAll((rows) =>
            rows.map((row) => row.querySelectorAll("th, td").length),
          );
          return widths.length === 3 && widths.every((width) => width === 3);
        },
        10000,
        "visual table toolbar add column matrix",
      );

      const firstBodyCell = visual.locator(".ProseMirror table tr").nth(1).locator("th, td").first();
      await waitFor(
        async () => (await firstBodyCell.count()) === 1,
        10000,
        "visual table body cell after add column",
      );
      await clickVisiblePoint(runtime.page, firstBodyCell, "first table body cell");
      await runtime.page.getByTestId("visual-editor-table-delete-row").click();
      await waitFor(
        async () => (await visual.locator(".ProseMirror table tr").count()) === 2,
        10000,
        "visual table toolbar delete row",
      );

      const remainingBodyCell = visual.locator(".ProseMirror table tr").nth(1).locator("th, td").nth(1);
      await clickVisiblePoint(runtime.page, remainingBodyCell, "remaining table second body cell");
      await runtime.page.getByTestId("visual-editor-table-delete-column").click();
      await waitFor(
        async () => {
          const widths = await visual.locator(".ProseMirror table tr").evaluateAll((rows) =>
            rows.map((row) => row.querySelectorAll("th, td").length),
          );
          return widths.length === 2 && widths.every((width) => width === 2);
        },
        10000,
        "visual table toolbar delete column matrix",
      );
      await waitFor(
        async () => (await visual.locator(".ProseMirror table th").first().getAttribute("style"))?.includes("text-align: center") === true,
        10000,
        "visual table center alignment after structure changes",
      );
      await waitForDiskMarker(caseState.notePath, "| Header");
      await waitFor(
        () => /:-{3,}:/.test(fs.readFileSync(caseState.notePath, "utf8")),
        10000,
        "visual table alignment persistence",
      );
      const savedMarkdown = fs.readFileSync(caseState.notePath, "utf8");

      await closeRuntime(runtime);
      runtime = await launch(caseState, basePort + 8);
      const reopenedVisual = await ensureVisualEditor(runtime.page);
      await waitFor(
        async () => (await reopenedVisual.locator(".ProseMirror table").count()) === 1,
        10000,
        "reopened visual table",
      );
      await waitFor(
        async () => (await reopenedVisual.locator(".ProseMirror table th").first().innerText()).includes("Header"),
        10000,
        "reopened visual table cell",
      );
      await waitFor(
        async () => (await reopenedVisual.locator(".ProseMirror table th").first().getAttribute("style"))?.includes("text-align: center") === true,
        10000,
        "reopened visual table alignment",
      );

      return {
        savedMarkdown,
        rowCount: await reopenedVisual.locator(".ProseMirror table tr").count(),
        columnCount: await reopenedVisual.locator(".ProseMirror table tr").first().locator("th, td").count(),
        alignment: "center",
        toolbarCommands: ["add-column", "delete-row", "delete-column"],
        reopened: true,
      };
    });
  } finally {
    await closeRuntime(runtime);
    await cleanupSandbox(caseState.sandbox);
  }
}

async function runSaveFailureCase() {
  const marker = `phase2-visual-save-failure-${runId}`;
  const caseState = createSandbox("save-failure", "# Save failure note\n\nFailure seed.\n");
  let runtime;
  try {
    runtime = await launch(caseState, basePort + 2, { MKN_TEST_SAVE_FAILURE: "1" });
    await check("save-failure-keeps-visual-memory", async () => {
      const visual = await replaceVisualContent(runtime.page, marker);
      await waitFor(async () => /保存失败|测试故障注入/.test(await bodyText(runtime.page)), 10000, "save failure status");
      await waitForDiskMarker(caseState.notePath, marker, false);
      const text = await visual.innerText();
      if (!text.includes(marker)) throw new Error(`visual memory lost after save failure: ${JSON.stringify(text)}`);
      return { marker, diskPreserved: true, editorPreserved: true };
    });
  } finally {
    await closeRuntime(runtime);
    await cleanupSandbox(caseState.sandbox);
  }
}

async function runAiSelectionCase() {
  const resultText = "AI replacement";
  const caseState = createSandbox(
    "ai-selection",
    "# AI note\n\nVisual AI sentence.\n",
  );
  let runtime;
  try {
    runtime = await launch(caseState, basePort + 4);
    await runtime.page.addInitScript(() => {
      const nativeFetch = window.fetch.bind(window);
      window.fetch = async (input, init) => {
        const url = typeof input === "string" ? input : input.url;
        if (url.endsWith("/chat/completions")) {
          window.__mknAiRequestBody = init?.body ?? "";
          return new Response(
            JSON.stringify({ choices: [{ message: { content: "AI replacement" } }] }),
            {
              status: 200,
              headers: { "Content-Type": "application/json" },
            },
          );
        }
        return nativeFetch(input, init);
      };
    });
    await runtime.page.evaluate(async () => {
      const invoke = window.__TAURI_INTERNALS__?.invoke;
      if (typeof invoke !== "function") {
        throw new Error("Tauri invoke bridge unavailable");
      }
      await invoke("set_ai_config", {
        apiUrl: "http://mknote-ai.invalid/v1",
        apiToken: "phase2-test-token",
        model: "phase2-test-model",
      });
    });
    await runtime.page.reload({ waitUntil: "domcontentloaded" });
    await ensureVisualEditor(runtime.page);

    await check("visual-ai-selection-and-apply", async () => {
      const editor = runtime.page.locator(
        '[data-testid="mknote-visual-editor"] .ProseMirror',
      );
      await editor.evaluate((node, selectedText) => {
        const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
        let current = walker.nextNode();
        while (current) {
          const text = current.nodeValue ?? "";
          const start = text.indexOf(selectedText);
          if (start >= 0) {
            const range = document.createRange();
            range.setStart(current, start);
            range.setEnd(current, start + selectedText.length);
            const selection = window.getSelection();
            selection?.removeAllRanges();
            selection?.addRange(range);
            return;
          }
          current = walker.nextNode();
        }
        throw new Error("visual AI selection text was not found");
      }, "Visual AI sentence");

      await runtime.page.locator("button.ai-assist-btn").click();
      await runtime.page
        .locator(".ai-assist-menu button")
        .filter({ hasText: "润色" })
        .click();
      await waitFor(
        async () => (await bodyText(runtime.page)).includes(resultText),
        10000,
        "visual AI result",
      );
      const requestBody = await runtime.page.evaluate(
        () => String(window.__mknAiRequestBody ?? ""),
      );
      if (!requestBody.includes("Visual AI sentence")) {
        throw new Error("AI request did not contain the visual selection");
      }
      await waitForDiskMarker(caseState.notePath, resultText, true);

      await closeRuntime(runtime);
      runtime = await launch(caseState, basePort + 4);
      await ensureVisualEditor(runtime.page);
      await waitFor(
        async () => (await bodyText(runtime.page)).includes(resultText),
        10000,
        "visual AI result after reopen",
      );
      return {
        selectionSent: true,
        resultApplied: true,
        saved: true,
        reopened: true,
      };
    });
  } finally {
    await closeRuntime(runtime);
    await cleanupSandbox(caseState.sandbox);
  }
}

async function runWikilinkCase() {
  const editMarker = "Wikilink edited";
  const caseState = createSandbox(
    "wikilink",
    "# Wikilink note\n\n参见 [[项目计划|计划别名]]。\n",
  );
  const targetNotePath = path.join(caseState.appRoot, "File", "default", "项目计划.md");
  fs.writeFileSync(targetNotePath, "# 项目计划\n\n目标笔记正文。\n", "utf8");
  const historicalTargetTime = new Date(0);
  fs.utimesSync(targetNotePath, historicalTargetTime, historicalTargetTime);
  let runtime;
  try {
    runtime = await launch(caseState, basePort + 5);
    await check("visual-wikilink-persistence", async () => {
      let visual = await ensureVisualEditor(runtime.page);
      const wikilink = visual.locator('[data-type="wikilink"]');
      if ((await wikilink.count()) === 0) {
        const editor = visual.locator(".ProseMirror");
        throw new Error(
          `visual Wikilink node missing: ${JSON.stringify({
            text: await editor.innerText(),
            html: await editor.innerHTML(),
          })}`,
        );
      }
      await wikilink.waitFor({ state: "visible", timeout: 10000 });
      if ((await wikilink.getAttribute("data-wikilink-target")) !== "项目计划") {
        throw new Error("visual Wikilink target metadata was not preserved");
      }
      if ((await wikilink.innerText()) !== "计划别名") {
        throw new Error("visual Wikilink alias was not rendered");
      }

      await visual.locator(".ProseMirror").click();
      await runtime.page.keyboard.press("Control+End");
      await runtime.page.keyboard.insertText(`\n${editMarker}`);
      await waitFor(
        async () => (await visual.innerText()).includes(editMarker),
        10000,
        "visual Wikilink edit",
      );
      await waitForDiskMarker(caseState.notePath, editMarker, true);

      await closeRuntime(runtime);
      runtime = undefined;
      runtime = await launch(caseState, basePort + 5);
      visual = await ensureVisualEditor(runtime.page);
      await visual.locator('[data-type="wikilink"]').waitFor({ state: "visible", timeout: 10000 });
      await waitFor(
        async () => (await visual.innerText()).includes(editMarker),
        10000,
        "visual Wikilink result after reopen",
      );

      await visual.locator('[data-type="wikilink"]').click();
      const navigatedVisual = runtime.page.locator('[data-testid="mknote-visual-editor"]');
      try {
        await waitFor(
          async () =>
            (await navigatedVisual.count()) > 0 &&
            (await navigatedVisual.innerText()).includes("目标笔记正文"),
          10000,
          "visual Wikilink navigation",
        );
      } catch (error) {
        const domState = await runtime.page.evaluate(() => ({
          visualCount: document.querySelectorAll('[data-testid="mknote-visual-editor"]').length,
          previewCount: document.querySelectorAll('[data-testid="mknote-preview-editor"]').length,
          editorPane: document.querySelector('[data-testid="mknote-editor-pane"]')?.innerHTML.slice(-1600) ?? null,
          body: document.body.innerText.slice(-1200),
        }));
        throw new Error(
          `${String(error?.message ?? error)}; dom=${JSON.stringify(domState)}`,
        );
      }
      const navigatedText = await navigatedVisual.innerText();
      if (!navigatedText.includes("目标笔记正文")) {
        throw new Error(`visual Wikilink target content missing after navigation: ${JSON.stringify(navigatedText)}`);
      }
      return {
        rendered: true,
        edited: true,
        saved: true,
        reopened: true,
        navigated: true,
      };
    });
  } finally {
    await closeRuntime(runtime);
    await cleanupSandbox(caseState.sandbox);
  }
}

async function runCasConflictCase() {
  const localMarker = `phase2-visual-local-${runId}`;
  const externalMarker = `phase2-visual-external-${runId}`;
  const caseState = createSandbox("cas-conflict", "# CAS note\n\nCAS seed.\n");
  let runtime;
  try {
    runtime = await launch(caseState, basePort + 3);
    await check("cas-conflict-keeps-local-memory-and-external-disk", async () => {
      const visual = await replaceVisualContent(runtime.page, localMarker);
      fs.writeFileSync(caseState.notePath, `# CAS note\n\n${externalMarker}\n`, "utf8");
      await runtime.page.keyboard.insertText(" local follow-up");
      await waitFor(
        async () => /外部修改|拒绝覆盖|保存失败/.test(await bodyText(runtime.page)),
        10000,
        "CAS conflict status",
      );
      const disk = fs.readFileSync(caseState.notePath, "utf8");
      const text = await visual.innerText();
      if (!disk.includes(externalMarker) || disk.includes(localMarker)) {
        throw new Error(`CAS changed external disk unexpectedly: ${JSON.stringify({ disk })}`);
      }
      if (!text.includes(localMarker)) throw new Error(`CAS removed local editor memory: ${JSON.stringify(text)}`);
      return { localMarker, externalMarker, diskKeptExternal: true, editorKeptLocal: true };
    });
  } finally {
    await closeRuntime(runtime);
    await cleanupSandbox(caseState.sandbox);
  }
}

async function runTopToolbarCase() {
  const caseState = createSandbox("top-toolbar", "# Top toolbar note\n\nToolbar seed\n");
  let runtime;
  try {
    runtime = await launch(caseState, basePort + 13);
    await check("top-toolbar-actions-and-roundtrip", async () => {
      let visual = await ensureVisualEditor(runtime.page);
      const actionResults = [];

      const startWithContent = async (content) => {
        await closeRuntime(runtime);
        runtime = undefined;
        fs.writeFileSync(caseState.notePath, `${content}\n`, "utf8");
        runtime = await launch(caseState, basePort + 13);
        const nextVisual = await ensureVisualEditor(runtime.page);
        await waitForDiskMarker(caseState.notePath, content);
        return nextVisual;
      };

      const runTextAction = async ({ id, title, seed, selection, diskMarker, verify }) => {
        visual = await startWithContent(seed);
        await selectVisualText(visual, selection);
        await clickMarkdownToolbarAction(runtime.page, title);
        await waitFor(() => verify(visual), 10000, `top toolbar ${id} DOM result`);
        await waitForDiskMarker(caseState.notePath, diskMarker ?? selection);
        actionResults.push(id);
      };

      const textActions = [
        {
          id: "bold",
          title: "加粗",
          seed: "Bold toolbar text",
          selection: "Bold toolbar text",
          diskMarker: "**Bold toolbar text**",
          verify: async (editor) => (await editor.locator("strong").count()) === 1,
        },
        {
          id: "italic",
          title: "斜体",
          seed: "Italic toolbar text",
          selection: "Italic toolbar text",
          diskMarker: "*Italic toolbar text*",
          verify: async (editor) => (await editor.locator("em").count()) === 1,
        },
        {
          id: "strikethrough",
          title: "删除线",
          seed: "Strike toolbar text",
          selection: "Strike toolbar text",
          diskMarker: "~~Strike toolbar text~~",
          verify: async (editor) => (await editor.locator("s, del").count()) === 1,
        },
        {
          id: "heading-1",
          title: "一级标题",
          seed: "Heading one toolbar text",
          selection: "Heading one toolbar text",
          diskMarker: "# Heading one toolbar text",
          verify: async (editor) => (await editor.locator("h1").count()) === 1,
        },
        {
          id: "heading-2",
          title: "二级标题",
          seed: "Heading two toolbar text",
          selection: "Heading two toolbar text",
          diskMarker: "## Heading two toolbar text",
          verify: async (editor) => (await editor.locator("h2").count()) === 1,
        },
        {
          id: "heading-3",
          title: "三级标题",
          seed: "Heading three toolbar text",
          selection: "Heading three toolbar text",
          diskMarker: "### Heading three toolbar text",
          verify: async (editor) => (await editor.locator("h3").count()) === 1,
        },
        {
          id: "bullet-list",
          title: "无序列表",
          seed: "Bullet toolbar item",
          selection: "Bullet toolbar item",
          verify: async (editor) => (await editor.locator("ul > li").count()) === 1,
        },
        {
          id: "ordered-list",
          title: "有序列表",
          seed: "Ordered toolbar item",
          selection: "Ordered toolbar item",
          verify: async (editor) => (await editor.locator("ol > li").count()) === 1,
        },
        {
          id: "blockquote",
          title: "引用",
          seed: "Quote toolbar text",
          selection: "Quote toolbar text",
          diskMarker: "> Quote toolbar text",
          verify: async (editor) => (await editor.locator("blockquote").count()) === 1,
        },
        {
          id: "inline-code",
          title: "行内代码",
          seed: "Inline toolbar code",
          selection: "Inline toolbar code",
          verify: async (editor) =>
            (await editor.locator("p code").count()) === 1 && (await editor.locator("pre").count()) === 0,
        },
        {
          id: "code-block",
          title: "代码块",
          seed: "Code toolbar block",
          selection: "Code toolbar block",
          diskMarker: "Code toolbar block",
          verify: async (editor) => (await editor.locator("pre code").count()) === 1,
        },
        {
          id: "case-transform",
          title: "大小写转换（大写→小写→首字母大写）",
          seed: "case toolbar text",
          selection: "case toolbar text",
          diskMarker: "Case Toolbar Text",
          verify: async (editor) => (await editor.innerText()).includes("Case Toolbar Text"),
        },
        {
          id: "link",
          title: "链接",
          seed: "Link toolbar text",
          selection: "Link toolbar text",
          diskMarker: "https://",
          verify: async (editor) => (await editor.locator('a[href="https://"]').count()) === 1,
        },
      ];

      for (const action of textActions) await runTextAction(action);

      visual = await startWithContent("Task toolbar item");
      await visual.locator(".ProseMirror").click();
      await runtime.page.keyboard.press("Control+End");
      await clickMarkdownToolbarAction(runtime.page, "插入任务行");
      await waitFor(
        async () => (await visual.locator('li[data-item-type="task"]').count()) === 1,
        10000,
        "top toolbar task insertion",
      );
      await waitForDiskMarker(caseState.notePath, "[ ] Task toolbar item");
      await visual.locator(".ProseMirror").click();
      await runtime.page.keyboard.press("Control+End");
      await clickMarkdownToolbarAction(runtime.page, "切换任务已完成");
      await waitFor(
        async () => (await visual.locator('li[data-item-type="task"] input[type="checkbox"]:checked').count()) === 1,
        10000,
        "top toolbar task completion",
      );
      await waitForDiskMarker(caseState.notePath, "[x] Task toolbar item");
      actionResults.push("task", "task-done");

      visual = await startWithContent("First toolbar item");
      await selectVisualText(visual, "First toolbar item");
      await clickMarkdownToolbarAction(runtime.page, "无序列表");
      await waitFor(async () => (await visual.locator("ul > li").count()) === 1, 10000, "toolbar list for indent");
      const firstItem = visual.locator("ul > li").first();
      await firstItem.click();
      await runtime.page.keyboard.press("End");
      await runtime.page.keyboard.press("Enter");
      await runtime.page.keyboard.insertText("Second toolbar item");
      await waitFor(
        async () => (await visual.locator("li").filter({ hasText: "Second toolbar item" }).count()) === 1,
        10000,
        "toolbar second list item",
      );
      await selectVisualText(visual, "Second toolbar item");
      await clickMarkdownToolbarAction(runtime.page, "缩进");
      await waitFor(async () => (await visual.locator("ul ul").count()) === 1, 10000, "toolbar indent");
      await selectVisualText(visual, "Second toolbar item");
      await clickMarkdownToolbarAction(runtime.page, "取消缩进");
      await waitFor(async () => (await visual.locator("ul ul").count()) === 0, 10000, "toolbar outdent");
      actionResults.push("indent", "outdent");

      visual = await startWithContent("Divider toolbar paragraph");
      await visual.locator(".ProseMirror").click();
      await clickMarkdownToolbarAction(runtime.page, "分割线");
      await waitFor(async () => (await visual.locator("hr").count()) === 1, 10000, "toolbar divider");
      await waitForDiskMarker(caseState.notePath, "***");
      actionResults.push("hr");

      visual = await startWithContent("Table toolbar paragraph");
      await visual.locator(".ProseMirror").click();
      await clickMarkdownToolbarAction(runtime.page, "表格");
      await waitFor(async () => (await visual.locator("table").count()) === 1, 10000, "toolbar table");
      await waitForDiskMarker(caseState.notePath, "|");
      actionResults.push("table");

      visual = await startWithContent("Clear toolbar text");
      await selectVisualText(visual, "Clear toolbar text");
      await clickMarkdownToolbarAction(runtime.page, "加粗");
      await waitFor(async () => (await visual.locator("strong").count()) === 1, 10000, "toolbar clear setup");
      await selectVisualText(visual, "Clear toolbar text");
      await clickMarkdownToolbarAction(runtime.page, "清除格式");
      await waitFor(async () => (await visual.locator("strong").count()) === 0, 10000, "toolbar clear format");
      await waitForDiskMarker(caseState.notePath, "Clear toolbar text");
      actionResults.push("clear-format");

      for (const [id, title, sourceText, expectedSource, markSelector] of [
        ["underline", "下划线", "Underline toolbar text", "<u>Underline toolbar text</u>", "u"],
        ["highlight", "高亮", "Highlight toolbar text", "==Highlight toolbar text==", "mark"],
      ]) {
        visual = await startWithContent(sourceText);
        await selectVisualText(visual, sourceText);
        const selectionBeforeToolbar = await runtime.page.evaluate(() => {
          const selection = window.getSelection();
          const range = selection?.rangeCount ? selection.getRangeAt(0) : null;
          return {
            text: selection?.toString() ?? "",
            activeTag: document.activeElement?.tagName ?? null,
            activeClass: document.activeElement?.getAttribute("class") ?? null,
            rangeInsideEditor: Boolean(
              range && document.querySelector(".ProseMirror")?.contains(range.commonAncestorContainer),
            ),
          };
        });
        await clickMarkdownToolbarAction(runtime.page, title);
        await waitFor(
          async () => (await visual.locator(markSelector === "mark" ? "mark" : "u").count()) === 1,
          10000,
          `toolbar ${id} visual mark`,
        );
        await waitForDiskMarker(caseState.notePath, expectedSource);
        const visualState = await runtime.page.evaluate(() => ({
          viewMode: document.querySelector('[data-testid="mknote-editor-pane"]')?.getAttribute("data-view-mode"),
          sourceCount: document.querySelectorAll('[data-testid="mknote-markdown-editor"]').length,
          visualCount: document.querySelectorAll('[data-testid="mknote-visual-editor"]').length,
        }));
        if (visualState.viewMode !== "preview" || visualState.sourceCount !== 0 || visualState.visualCount !== 1) {
          throw new Error(
            `toolbar ${id} unexpectedly left Visual Editor; state=${JSON.stringify(visualState)}; ` +
              `selection=${JSON.stringify(selectionBeforeToolbar)}`,
          );
        }
        actionResults.push(id);
      }

      visual = await startWithContent("Roundtrip toolbar text");
      await selectVisualText(visual, "Roundtrip toolbar text");
      await clickMarkdownToolbarAction(runtime.page, "加粗");
      await waitFor(async () => (await visual.locator("strong").count()) === 1, 10000, "toolbar roundtrip setup");
      await waitForDiskMarker(caseState.notePath, "**Roundtrip toolbar text**");
      await closeRuntime(runtime);
      runtime = undefined;
      runtime = await launch(caseState, basePort + 13);
      visual = await ensureVisualEditor(runtime.page);
      await waitFor(
        async () => (await visual.locator("strong").count()) === 1,
        10000,
        "toolbar roundtrip reopen",
      );

      return {
        actionCount: actionResults.length,
        actions: actionResults,
        savedMarkdown: fs.readFileSync(caseState.notePath, "utf8"),
        reopened: true,
      };
    });
  } finally {
    await closeRuntime(runtime);
    await cleanupSandbox(caseState.sandbox);
  }
}

try {
  await runNormalCase();
  await runTaskPersistenceCase();
  await runTopToolbarCase();
  await runAiSelectionCase();
  await runWikilinkCase();
  await runCodeBlockCase();
  await runFindReplaceCase();
  await runDividerCase();
  await runTableCase();
  await runSaveFailureCase();
  await runCasConflictCase();
} catch (error) {
  results.fatal = { status: "fail", error: String(error?.message ?? error) };
}

const failed = Object.values(results).filter((result) => result.status === "fail");
const expectedRuntimeErrorPatterns = [
  /测试故障注入：模拟便签写入失败/,
  /便签已被外部修改，拒绝覆盖当前版本/,
];
const expectedRuntimeErrors = runtimeErrors.filter((error) =>
  expectedRuntimeErrorPatterns.some((pattern) => pattern.test(error.message)),
);
const unexpectedRuntimeErrors = runtimeErrors.filter(
  (error) => !expectedRuntimeErrors.includes(error),
);
const report = {
  schemaVersion: "mknote.visual-editor.phase2-production-e2e.v1",
  generatedAt: new Date().toISOString(),
  executable,
  visualFlag: "visual-prosemirror (compiled at build time)",
  ownerPortsUntouched: [4173, 4205, 4207, 9265],
  results,
  runtimeErrors: {
    expected: expectedRuntimeErrors,
    unexpected: unexpectedRuntimeErrors,
  },
  status: failed.length === 0 && unexpectedRuntimeErrors.length === 0 ? "pass" : "failed",
};
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(
  JSON.stringify(
    {
      report: reportPath,
      status: report.status,
      failed: failed.length,
      expectedRuntimeErrors: expectedRuntimeErrors.length,
      unexpectedRuntimeErrors: unexpectedRuntimeErrors.length,
    },
    null,
    2,
  ),
);
process.exitCode = report.status === "pass" ? 0 : 1;
