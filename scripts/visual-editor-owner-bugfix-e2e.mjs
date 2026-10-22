/**
 * Owner 已确认的 Visual Editor 四项 Bug 隔离运行探针。
 *
 * 该脚本只使用独立的 Release 副本和临时用户数据，不连接 Owner 实例。
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawn } from "node:child_process";
import { pathToFileURL } from "node:url";

const root = path.resolve(import.meta.dirname, "..");
const executable = path.resolve(
  process.env.MKN_OWNER_BUGFIX_EXECUTABLE ??
    path.join(root, "src-tauri", "target-owner-bugfix-e2e", "release", "md-sticky-note.exe"),
);
const artifactDir = path.join(
  root,
  "poc",
  "visual-editor-phase1a",
  "artifacts",
  "owner-bugfix",
);
const runId = process.env.MKN_OWNER_BUGFIX_RUN_ID ?? new Date().toISOString().replace(/[:.]/g, "-");
const basePort = Number(process.env.MKN_OWNER_BUGFIX_CDP_PORT ?? 9471);
const playwrightModule =
  process.env.MKN_PLAYWRIGHT_MODULE ??
  pathToFileURL(path.join(root, "poc", "visual-editor-phase1a", "node_modules", "playwright", "index.mjs"))
    .href;
const { chromium } = await import(playwrightModule);

if (!fs.existsSync(executable)) throw new Error(`Release executable not found: ${executable}`);
if (!Number.isInteger(basePort) || basePort <= 0) throw new Error("CDP port must be a positive integer");
fs.mkdirSync(artifactDir, { recursive: true });

const results = {};
const runtimeErrors = [];
let nextPortOffset = 0;

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function waitFor(predicate, timeoutMs, description) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await wait(100);
  }
  throw new Error(`Timed out waiting for ${description}`);
}

function createSandbox(caseName, seed) {
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), `mknote-owner-bugfix-${caseName}-`));
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

function childEnvironment(caseState, port) {
  const inheritedBrowserArgs = process.env.WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS?.trim();
  return {
    ...process.env,
    APPDATA: caseState.appData,
    LOCALAPPDATA: caseState.localAppData,
    WEBVIEW2_USER_DATA_FOLDER: caseState.webviewData,
    TEMP: caseState.tempDir,
    TMP: caseState.tempDir,
    WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: [
      inheritedBrowserArgs,
      `--remote-debugging-port=${port}`,
    ]
      .filter(Boolean)
      .join(" "),
  };
}

async function waitForCdp(port) {
  await waitFor(
    async () => {
      try {
        const response = await fetch(`http://127.0.0.1:${port}/json/list`);
        return response.ok;
      } catch {
        return false;
      }
    },
    30000,
    `WebView2 CDP ${port}`,
  );
}

async function launch(caseState, port) {
  const runExecutable = path.join(caseState.appRoot, path.basename(executable));
  const processHandle = spawn(runExecutable, [], {
    cwd: caseState.appRoot,
    env: childEnvironment(caseState, port),
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
      // 只清理本探针进程。
    }
    throw new Error(
      `${String(error?.message ?? error)}; process=${JSON.stringify({
        pid: processHandle.pid,
        exitCode: processHandle.exitCode,
        stderr: stderrChunks.join("").slice(-3000),
      })}`,
    );
  }

  const browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
  const context = browser.contexts()[0];
  const page = context.pages()[0];
  page.on("pageerror", (error) => runtimeErrors.push({ type: "pageerror", message: String(error) }));
  page.on("console", (message) => {
    if (message.type() === "error") runtimeErrors.push({ type: "console", message: message.text() });
  });
  await page.waitForSelector('[data-testid="mknote-editor-pane"]', { state: "visible", timeout: 20000 });
  return { browser, page, processHandle };
}

async function stopProcess(processHandle) {
  if (!processHandle || processHandle.killed) return;
  try {
    execFileSync("taskkill", ["/PID", String(processHandle.pid), "/T", "/F"], { stdio: "ignore" });
  } catch {
    // 进程可能已由应用自行退出。
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
        console.warn(`隔离目录清理延迟，保留：${sandbox}; ${String(error?.message ?? error)}`);
        return;
      }
      await wait(250);
    }
  }
}

async function ensureVisual(page) {
  const visual = page.locator('[data-testid="mknote-visual-editor"]');
  // Visual Editor 是 lazy chunk：预览模式下节点可能尚未挂载，不能把“尚未可见”误判为源码模式再点击一次。
  const pane = page.locator('[data-testid="mknote-editor-pane"]');
  if ((await pane.getAttribute("data-view-mode")) === "edit") {
    const toggle = page.locator("button.view-mode-toggle");
    await toggle.click();
  }
  try {
    await visual.waitFor({ state: "visible", timeout: 20000 });
  } catch (error) {
    const state = await page.evaluate(() => ({
      viewMode: document.querySelector('[data-testid="mknote-editor-pane"]')?.getAttribute("data-view-mode"),
      visualCount: document.querySelectorAll('[data-testid="mknote-visual-editor"]').length,
      visualReady: document.querySelector('[data-testid="mknote-visual-editor"]')?.getAttribute("data-editor-ready"),
      sourceCount: document.querySelectorAll('[data-testid="mknote-markdown-editor"]').length,
      sourceVisible: Boolean(document.querySelector('[data-testid="mknote-markdown-editor"]')),
      recoveryText: document.querySelector('[data-testid="mknote-visual-editor-recovery"]')?.textContent ?? null,
      bodyTail: document.body.innerText.slice(-1600),
    }));
    throw new Error(`${String(error?.message ?? error)}; editorState=${JSON.stringify(state)}`);
  }
  await visual.locator(".ProseMirror").waitFor({ state: "visible", timeout: 20000 });
  return visual;
}

async function ensureSource(page) {
  const source = page.locator('[data-testid="mknote-markdown-editor"]');
  if (!(await source.isVisible().catch(() => false))) {
    await page.locator("button.view-mode-toggle").click();
  }
  await source.waitFor({ state: "visible", timeout: 20000 });
  return source;
}

async function clickToolbar(page, title) {
  const button = page.locator(`button[title="${title}"]`).first();
  await button.waitFor({ state: "visible", timeout: 10000 });
  await button.click();
}

async function waitForDiskMarker(notePath, marker) {
  await waitFor(
    () => fs.existsSync(notePath) && fs.readFileSync(notePath, "utf8").includes(marker),
    10000,
    `disk marker ${marker}`,
  );
}

async function runCase(name, seed, action) {
  const caseState = createSandbox(name, seed);
  let runtime;
  const ctx = {
    caseState,
    get page() {
      if (!runtime) throw new Error("runtime is not running");
      return runtime.page;
    },
    async restart(nextSeed) {
      await closeRuntime(runtime);
      runtime = undefined;
      if (nextSeed !== undefined) fs.writeFileSync(caseState.notePath, nextSeed, "utf8");
      const port = basePort + nextPortOffset;
      nextPortOffset += 1;
      runtime = await launch(caseState, port);
    },
  };

  try {
    runtime = await launch(caseState, basePort + nextPortOffset);
    nextPortOffset += 1;
    await action(ctx);
    results[name] = { status: "pass" };
  } catch (error) {
    results[name] = { status: "fail", error: String(error?.message ?? error) };
  } finally {
    await closeRuntime(runtime);
    await cleanupSandbox(caseState.sandbox);
  }
}

await runCase(
  "代码块收起与展开",
  "# 代码块\n\n```js\nconst answer = 42;\n```\n",
  async (ctx) => {
    const { caseState, restart } = ctx;
    let visual = await ensureVisual(ctx.page);
    const block = visual.locator(".mk-code-block").first();
    const pre = block.locator("pre");
    const collapse = block.locator("button.mk-code-collapse");
    await block.waitFor({ state: "visible", timeout: 10000 });
    if (!(await pre.isVisible())) throw new Error("代码块初始内容不可见");
    await collapse.click();
    await waitFor(async () => (await collapse.getAttribute("aria-expanded")) === "false", 10000, "代码块收起");
    if (!(await pre.isHidden())) throw new Error("代码块收起后 pre 仍可见");
    await collapse.click();
    await waitFor(async () => (await collapse.getAttribute("aria-expanded")) === "true", 10000, "代码块展开");
    if (!(await pre.isVisible())) throw new Error("代码块展开后内容不可见");
    const saved = fs.readFileSync(caseState.notePath, "utf8");
    if (!saved.includes("```js") || !saved.includes("const answer = 42;")) {
      throw new Error(`代码块 Markdown 被折叠状态污染：${JSON.stringify(saved)}`);
    }
    await restart();
    visual = await ensureVisual(ctx.page);
    const reopenedBlock = visual.locator(".mk-code-block").first();
    if (!(await reopenedBlock.locator("pre").isVisible())) throw new Error("重开后代码块内容不可见");
  },
);

await runCase(
  "源码工具栏代码撤销",
  "源码工具栏代码\n",
  async (ctx) => {
    const { restart } = ctx;
    let source = await ensureSource(ctx.page);
    await source.focus();
    await source.press("Control+A");
    await clickToolbar(ctx.page, "行内代码");
    await waitFor(
      async () => (await source.inputValue()).includes("`源码工具栏代码"),
      10000,
      "源码行内代码格式化",
    );
    await source.focus();
    await source.press("Control+Z");
    await waitFor(
      async () => {
        const value = await source.inputValue();
        return value.includes("源码工具栏代码") && !value.includes("`源码工具栏代码");
      },
      10000,
      "源码行内代码 Ctrl+Z",
    );

    await restart("源码工具栏代码块\n");
    source = await ensureSource(ctx.page);
    await source.focus();
    await source.press("Control+A");
    await clickToolbar(ctx.page, "代码块");
    await waitFor(async () => (await source.inputValue()).includes("```"), 10000, "源码代码块格式化");
    await source.focus();
    await source.press("Control+Z");
    await waitFor(
      async () => {
        const value = await source.inputValue();
        return value.includes("源码工具栏代码块") && !value.includes("```");
      },
      10000,
      "源码代码块 Ctrl+Z",
    );
  },
);

await runCase(
  "源码标题光标落点",
  "标题光标\n",
  async (ctx) => {
    const { restart } = ctx;
    for (const [title, prefix] of [
      ["一级标题", "# "],
      ["二级标题", "## "],
      ["三级标题", "### "],
    ]) {
      await restart("标题光标\n");
      const source = await ensureSource(ctx.page);
      await source.focus();
      await source.press("Control+A");
      await clickToolbar(ctx.page, title);
      await waitFor(
        async () => {
          const value = await source.inputValue();
          return value === `${prefix}标题光标\n`;
        },
        10000,
        `${title} 格式化`,
      );
      const selection = await source.evaluate((element) => ({
        valueLength: element.value.length,
        selectionStart: element.selectionStart,
        selectionEnd: element.selectionEnd,
        lineEnd: element.value.endsWith("\n") ? element.value.length - 1 : element.value.length,
      }));
      if (
        selection.selectionStart !== selection.lineEnd ||
        selection.selectionEnd !== selection.lineEnd
      ) {
        throw new Error(`${title} 光标不在末尾：${JSON.stringify(selection)}`);
      }
    }
  },
);

await runCase(
  "标题折叠三角与范围",
  "# 第一标题\n\n第一段内容\n\n## 子标题\n\n子标题内容\n\n# 第二标题\n\n第二段内容\n",
  async (ctx) => {
    const { caseState, restart } = ctx;
    let visual = await ensureVisual(ctx.page);
    const toggles = visual.locator("button.mk-heading-collapse-toggle");
    await waitFor(async () => (await toggles.count()) === 3, 10000, "三个标题折叠按钮");
    const first = toggles.first();
    if ((await first.getAttribute("aria-expanded")) !== "true") {
      throw new Error("标题折叠按钮初始状态错误");
    }
    await first.click();
    await waitFor(async () => (await first.getAttribute("aria-expanded")) === "false", 10000, "标题折叠状态");
    const hiddenText = await visual.locator(".mk-heading-section-hidden").evaluateAll((elements) =>
      elements.map((element) => element.textContent ?? ""),
    );
    if (!hiddenText.some((text) => text.includes("第一段内容"))) throw new Error("第一标题正文未折叠");
    if (!hiddenText.some((text) => text.includes("子标题内容"))) throw new Error("子标题内容未随父标题折叠");
    if (hiddenText.some((text) => text.includes("第二段内容"))) throw new Error("折叠范围越过下一个一级标题");
    await first.click();
    await waitFor(async () => (await first.getAttribute("aria-expanded")) === "true", 10000, "标题展开状态");
    await waitFor(async () => (await visual.locator(".mk-heading-section-hidden").count()) === 0, 10000, "标题展开内容");
    const saved = fs.readFileSync(caseState.notePath, "utf8");
    if (!saved.includes("# 第一标题") || !saved.includes("# 第二标题")) {
      throw new Error(`标题折叠改变了 Markdown：${JSON.stringify(saved)}`);
    }
    await restart();
    visual = await ensureVisual(ctx.page);
    if ((await visual.locator("button.mk-heading-collapse-toggle").first().getAttribute("aria-expanded")) !== "true") {
      throw new Error("重开后标题错误地保持折叠");
    }
    if ((await visual.locator(".mk-heading-section-hidden").count()) !== 0) {
      throw new Error("重开后出现未持久化的折叠装饰");
    }
  },
);

const unexpectedRuntimeErrors = runtimeErrors.filter((error) => !/ResizeObserver loop/.test(error.message));
const failed = Object.values(results).filter((result) => result.status === "fail");
const report = {
  schemaVersion: "mknote.visual-editor.owner-bugfix-e2e.v1",
  generatedAt: new Date().toISOString(),
  executable,
  ownerPortsUntouched: [4173, 4205, 4207, 9265],
  results,
  runtimeErrors: unexpectedRuntimeErrors,
  status: failed.length === 0 && unexpectedRuntimeErrors.length === 0 ? "passed" : "failed",
};
const reportPath = path.join(artifactDir, `owner-bugfix-e2e-${runId}.json`);
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ report: reportPath, status: report.status, failed: failed.length }));
if (report.status !== "passed") process.exitCode = 1;
