/**
 * 采集 T4 需要的真实 Release 进程树内存证据。
 *
 * 运行范围只包括隔离的 Release 副本：先通过资料库创建并打开 11 个 Tab，
 * 再将其中 1 个弹出，最终保持 10 Tab + 1 Popout，并在同一个 root PID 下
 * 采集 baseline/after 快照。生产 EditorPane、4173 Owner 实例和保存链不接入。
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { execFileSync, spawn } from "node:child_process";

const root = path.resolve(import.meta.dirname, "..");
const configuredPlaywrightModule = process.env.MKN_PLAYWRIGHT_MODULE;
const defaultPlaywrightPath = path.join(
  root,
  "poc",
  "visual-editor-phase1a",
  "node_modules",
  "playwright",
  "index.mjs",
);
const playwrightModule = configuredPlaywrightModule
  ? configuredPlaywrightModule === "playwright" || configuredPlaywrightModule.startsWith("file:")
    ? configuredPlaywrightModule
    : pathToFileURL(path.resolve(configuredPlaywrightModule)).href
  : pathToFileURL(defaultPlaywrightPath).href;
const playwrightExports = await import(playwrightModule);
const chromium = playwrightExports.chromium ?? playwrightExports.default?.chromium;
if (!chromium) {
  throw new Error(`Playwright module does not expose chromium: ${playwrightModule}`);
}

const configuredExecutable = process.env.MKN_T4_RELEASE_EXE;
const releaseExecutable = configuredExecutable
  ? path.resolve(root, configuredExecutable)
  : fs.existsSync(path.join(root, "src-tauri", "target", "release", "md-sticky-note.exe"))
    ? path.join(root, "src-tauri", "target", "release", "md-sticky-note.exe")
    : path.join(root, "portable-release", "MarkdownStickyNote.exe");
const artifactDir = path.join(root, "poc", "visual-editor-phase1a", "artifacts");
const collector = path.join(root, "scripts", "collect-visual-editor-t4-process-memory.ps1");
const lifecycle = process.argv.includes("--lifecycle");
const tabsDiagnostic = process.argv.includes("--tabs-diagnostic");
const runId =
  process.env.MKN_T4_PROCESS_MEMORY_RUN_ID ??
  (lifecycle
    ? "20260824-lifecycle"
    : tabsDiagnostic
      ? "20260824-tabs-diagnostic"
      : "20260824");
const settleMs = Number(process.env.MKN_T4_PROCESS_MEMORY_SETTLE_MS ?? 10000);
const baselineSnapshot = path.join(
  artifactDir,
  `phase1a-t4-process-memory-baseline-${runId}.json`,
);
const afterSnapshot = path.join(
  artifactDir,
  `phase1a-t4-process-memory-after-${runId}.json`,
);
const tabsSnapshot = tabsDiagnostic
  ? path.join(artifactDir, `phase1a-t4-process-memory-tabs-${runId}.json`)
  : null;
const closedSnapshot = lifecycle
  ? path.join(artifactDir, `phase1a-t4-process-memory-closed-${runId}.json`)
  : null;
const metricsPath = path.join(
  artifactDir,
  `phase1a-t4-process-memory-metrics-${runId}.json`,
);
const tabsMetricsPath = tabsDiagnostic
  ? path.join(artifactDir, `phase1a-t4-process-memory-tabs-metrics-${runId}.json`)
  : null;
const reportPath = path.join(
  artifactDir,
  `phase1a-t4-process-memory-e2e-${runId}.json`,
);
const port = Number(
  process.env.MKN_T4_PROCESS_MEMORY_CDP_PORT ?? (lifecycle ? 9246 : 9245),
);
// 只为隔离诊断保留可选浏览器参数；正式 T4 默认不注入额外开关。
const inheritedBrowserArgs = process.env.MKN_T4_PROCESS_MEMORY_BROWSER_ARGS?.trim() ?? "";
const browserArguments = [inheritedBrowserArgs, `--remote-debugging-port=${port}`]
  .filter(Boolean)
  .join(" ");

if (!fs.existsSync(releaseExecutable)) {
  throw new Error(`Release executable not found: ${releaseExecutable}`);
}
if (!fs.existsSync(collector)) {
  throw new Error(`Process-memory collector not found: ${collector}`);
}
fs.mkdirSync(artifactDir, { recursive: true });

const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "mknote-t4-process-memory-"));
const appRoot = path.join(sandbox, "App");
const appData = path.join(sandbox, "AppData", "Roaming");
const localAppData = path.join(sandbox, "AppData", "Local");
const tempDir = path.join(sandbox, "Temp");
const runExecutable = path.join(appRoot, path.basename(releaseExecutable));
const noteDir = path.join(appRoot, "File", "default");
const notePath = path.join(noteDir, "default-note.md");

for (const directory of [appRoot, appData, localAppData, tempDir, noteDir]) {
  fs.mkdirSync(directory, { recursive: true });
}
fs.copyFileSync(releaseExecutable, runExecutable);
fs.writeFileSync(notePath, "T4 process-memory seed\n", "utf8");

let processHandle;
let browser;
let mainPage;
let popoutPage;
const result = {
  schemaVersion: "mknote.visual-editor.t4-process-memory-e2e.v1",
  generatedAt: new Date().toISOString(),
  executable: releaseExecutable,
  rootPid: null,
  cdpPort: port,
  browserArguments,
  settleMs,
  lifecycle,
  scenario: {
    requestedTabCount: 10,
    requestedPopoutCount: 1,
    tabCountAfterLibraryCreate: null,
    tabCountBeforePopout: null,
    tabCountAfterPopout: null,
    tabCountAfterClose: null,
    popoutPageCount: null,
  },
  collector: {
    baselineSnapshot,
    afterSnapshot,
    tabsSnapshot,
    closedSnapshot,
    metricsPath,
    tabsMetricsPath,
    snapshotOutputs: [],
    compareArgs: null,
    compareOutput: null,
    tabsCompareArgs: null,
    tabsCompareOutput: null,
  },
  status: "incomplete",
  errors: [],
};

function runPowerShellCollector(args) {
  return execFileSync(
    "powershell.exe",
    [
      "-NoProfile",
      "-NonInteractive",
      "-ExecutionPolicy",
      "Bypass",
      "-File",
      collector,
      ...args,
    ],
    {
      cwd: root,
      encoding: "utf8",
      windowsHide: true,
      maxBuffer: 4 * 1024 * 1024,
    },
  );
}

function collectSnapshot(phase, snapshotPath, outputPath) {
  const output = runPowerShellCollector([
    "-RootPid",
    String(processHandle.pid),
    "-Phase",
    phase,
    "-SnapshotPath",
    snapshotPath,
    "-OutputPath",
    outputPath,
  ]);
  result.collector.snapshotOutputs.push({ phase, output: output.trim() });
}

function compareSnapshots() {
  const args = [
    "-BaselineSnapshotPath",
    baselineSnapshot,
    "-AfterSnapshotPath",
    afterSnapshot,
    "-TabCount",
    "10",
    "-PopoutCount",
    "1",
  ];
  if (closedSnapshot) {
    args.push("-ClosedSnapshotPath", closedSnapshot);
  }
  args.push("-OutputPath", metricsPath);
  result.collector.compareArgs = [...args];
  const output = runPowerShellCollector(args);
  result.collector.compareOutput = output.trim();
}

function compareBaselineToTabs() {
  if (!tabsSnapshot || !tabsMetricsPath) {
    throw new Error("Tab diagnostic paths were not allocated");
  }

  const args = [
    "-BaselineSnapshotPath",
    baselineSnapshot,
    "-AfterSnapshotPath",
    tabsSnapshot,
    "-TabCount",
    "11",
    "-PopoutCount",
    "0",
    "-OutputPath",
    tabsMetricsPath,
  ];
  result.collector.tabsCompareArgs = [...args];
  const output = runPowerShellCollector(args);
  result.collector.tabsCompareOutput = output.trim();
}

async function waitForTabCount(page, expected) {
  await page.waitForFunction(
    (count) => document.querySelectorAll(".note-tabs-scroll .note-tab").length === count,
    expected,
    { timeout: 20000 },
  );
}

async function createTabUntilCount(page, expected) {
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    const current = await page.locator(".note-tabs-scroll .note-tab").count();
    if (current >= expected) return;
    const newTab = page.locator("button.note-tabs-new-lead");
    await newTab.waitFor({ state: "visible", timeout: 5000 });
    await newTab.click();
    await page
      .waitForFunction(
        (count) => document.querySelectorAll(".note-tabs-scroll .note-tab").length >= count,
        expected,
        { timeout: 1200 },
      )
      .catch(() => undefined);
  }
  throw new Error(`Tab count did not reach ${expected}`);
}

async function openLibrary(page) {
  const library = page.locator(".compact-library");
  if (await library.isVisible().catch(() => false)) return;
  const toggle = page.locator(
    '[data-testid="mknote-statusbar"] button[title="展开资料库"]',
  );
  await toggle.waitFor({ state: "visible", timeout: 15000 });
  await toggle.click();
  await library.waitFor({ state: "visible", timeout: 15000 });
}

async function findPopoutPage(context, existingPages) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const candidates = context.pages().filter((candidate) => !existingPages.has(candidate));
    for (const candidate of candidates) {
      if (await candidate.locator(".popout-titlebar").isVisible().catch(() => false)) {
        return candidate;
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Popout page did not become visible; pageCount=${context.pages().length}`);
}

async function waitForVisiblePopoutCount(context, expected) {
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    let visibleCount = 0;
    for (const candidate of context.pages()) {
      if (await candidate.locator(".popout-titlebar").isVisible().catch(() => false)) {
        visibleCount += 1;
      }
    }
    if (visibleCount === expected) return;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(
    `Visible Popout count did not reach ${expected}; pageCount=${context.pages().length}`,
  );
}

async function terminateProcess() {
  if (!processHandle) return;
  const pid = processHandle.pid;
  try {
    if (!processHandle.killed) processHandle.kill();
  } catch {
    // taskkill below is the final cleanup for Windows process trees.
  }
  try {
    execFileSync("taskkill", ["/PID", String(pid), "/T", "/F"], {
      cwd: root,
      stdio: "ignore",
      windowsHide: true,
    });
  } catch {
    // The process may already have exited; no unrelated PID is touched.
  }
}

async function captureFailureDebug(page) {
  if (!page) return;
  try {
    result.debug = await page.evaluate(() => ({
      url: location.href,
      readyState: document.readyState,
      tabSelectors: {
        allTabs: document.querySelectorAll(".note-tab").length,
        scrollTabs: document.querySelectorAll(".note-tabs-scroll .note-tab").length,
        tabBars: document.querySelectorAll('[data-testid="mknote-tabs"]').length,
      },
      library: {
        visible: Boolean(document.querySelector(".compact-library")) &&
          getComputedStyle(document.querySelector(".compact-library")).display !== "none",
        text: document.querySelector(".compact-library")?.textContent?.slice(0, 1000) ?? "",
      },
      buttons: [...document.querySelectorAll("button")]
        .map((button) => ({
          title: button.getAttribute("title"),
          ariaLabel: button.getAttribute("aria-label"),
          className: button.className,
          disabled: button.disabled,
        }))
        .filter((button) => button.title || button.ariaLabel)
        .slice(0, 80),
      bodyText: document.body.innerText.slice(0, 2000),
    }));
    await page.screenshot({
      path: path.join(artifactDir, `phase1a-t4-process-memory-failure-${runId}.png`),
      fullPage: false,
    });
  } catch (debugError) {
    result.errors.push(`failure debug failed: ${String(debugError?.message ?? debugError)}`);
  }
}

try {
  processHandle = spawn(runExecutable, [], {
    cwd: appRoot,
    env: {
      ...process.env,
      APPDATA: appData,
      LOCALAPPDATA: localAppData,
      TEMP: tempDir,
      TMP: tempDir,
      WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: browserArguments,
    },
    stdio: "ignore",
    windowsHide: true,
  });
  result.rootPid = processHandle.pid;

  let cdpReady = false;
  for (let attempt = 0; attempt < 40 && !cdpReady; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 500));
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/list`);
      cdpReady = response.ok;
    } catch {
      cdpReady = false;
    }
    if (processHandle.exitCode !== null) {
      throw new Error(`Release process exited before CDP became ready: ${processHandle.exitCode}`);
    }
  }
  if (!cdpReady) throw new Error(`WebView2 CDP endpoint did not become reachable on ${port}`);

  browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
  const context = browser.contexts()[0];
  mainPage = context.pages()[0];
  await mainPage.waitForSelector('[data-testid="mknote-editor-pane"]', {
    state: "visible",
    timeout: 20000,
  });

  // 进程树基线必须在初始 WebView2 页面完成短暂稳定后采集，避免把冷启动后台分配误算为 Tab/Popout 增量。
  await new Promise((resolve) => setTimeout(resolve, settleMs));
  collectSnapshot(
    "baseline",
    baselineSnapshot,
    path.join(artifactDir, `phase1a-t4-process-memory-baseline-output-${runId}.json`),
  );

  // 先通过资料库进入新建路径，再使用顶栏新建按钮扩展 Tab 数量。
  await openLibrary(mainPage);
  const libraryCreate = mainPage.locator(
    '.compact-library .library-section-title button[title="新建笔记"]',
  );
  await libraryCreate.waitFor({ state: "visible", timeout: 15000 });
  await libraryCreate.click();
  await mainPage.locator(".note-tabs-scroll .note-tab").first().waitFor({
    state: "visible",
    timeout: 20000,
  });
  const tabCountAfterLibraryCreate = await mainPage
    .locator(".note-tabs-scroll .note-tab")
    .count();
  result.scenario.tabCountAfterLibraryCreate = tabCountAfterLibraryCreate;
  if (tabCountAfterLibraryCreate > 11) {
    throw new Error(`Unexpected tab count after library create: ${tabCountAfterLibraryCreate}`);
  }

  for (let expected = tabCountAfterLibraryCreate + 1; expected <= 11; expected += 1) {
    await createTabUntilCount(mainPage, expected);
  }
  result.scenario.tabCountBeforePopout = await mainPage
    .locator(".note-tabs-scroll .note-tab")
    .count();

  if (tabsDiagnostic) {
    if (!tabsSnapshot) {
      throw new Error("Tab diagnostic did not allocate an intermediate snapshot path");
    }
    await new Promise((resolve) => setTimeout(resolve, settleMs));
    collectSnapshot(
      "tabs",
      tabsSnapshot,
      path.join(artifactDir, `phase1a-t4-process-memory-tabs-output-${runId}.json`),
    );
    compareBaselineToTabs();
  }

  const existingPages = new Set(context.pages());
  const firstTab = mainPage.locator(".note-tabs-scroll .note-tab").first();
  await firstTab.waitFor({ state: "visible", timeout: 15000 });
  await firstTab.click({ button: "right" });
  const popoutMenuItem = mainPage.getByRole("menuitem", { name: "在新窗口中打开" });
  await popoutMenuItem.waitFor({ state: "visible", timeout: 10000 });
  await popoutMenuItem.click();

  popoutPage = await findPopoutPage(context, existingPages);
  await popoutPage.waitForSelector(".popout-titlebar", { state: "visible", timeout: 15000 });
  await waitForTabCount(mainPage, 10);
  result.scenario.tabCountAfterPopout = await mainPage
    .locator(".note-tabs-scroll .note-tab")
    .count();
  let popoutPageCount = 0;
  for (const candidate of context.pages()) {
    if (
      candidate !== mainPage &&
      (await candidate.locator(".popout-titlebar").isVisible().catch(() => false))
    ) {
      popoutPageCount += 1;
    }
  }
  result.scenario.popoutPageCount = popoutPageCount;

  // 让 Popout 的首帧和主窗口的 Tab 状态都完成，再采集 after 快照。
  await popoutPage.waitForFunction(() => document.readyState === "complete");
  await mainPage.waitForFunction(
    () => document.querySelectorAll(".note-tabs-scroll .note-tab").length === 10,
  );
  await new Promise((resolve) => setTimeout(resolve, settleMs));

  collectSnapshot(
    "after",
    afterSnapshot,
    path.join(artifactDir, `phase1a-t4-process-memory-after-output-${runId}.json`),
  );

  if (lifecycle) {
    if (!closedSnapshot) {
      throw new Error("Lifecycle mode did not allocate a closed snapshot path");
    }
    const closeButton = popoutPage.locator(".popout-close-btn");
    await closeButton.waitFor({ state: "visible", timeout: 10000 });
    await closeButton.click();
    await waitForTabCount(mainPage, 11);
    result.scenario.tabCountAfterClose = await mainPage
      .locator(".note-tabs-scroll .note-tab")
      .count();
    await waitForVisiblePopoutCount(context, 0);
    await new Promise((resolve) => setTimeout(resolve, settleMs));
    collectSnapshot(
      "closed",
      closedSnapshot,
      path.join(artifactDir, `phase1a-t4-process-memory-closed-output-${runId}.json`),
    );
  }

  compareSnapshots();

  if (tabsDiagnostic) {
    if (!tabsMetricsPath) {
      throw new Error("Tab diagnostic did not allocate an intermediate metrics path");
    }
    const tabsMetrics = JSON.parse(
      fs.readFileSync(tabsMetricsPath, "utf8").replace(/^\uFEFF/, ""),
    );
    const tabsProcessMemory = tabsMetrics?.metrics?.processMemory;
    if (!tabsProcessMemory || tabsProcessMemory.snapshotComplete !== true) {
      throw new Error("Tab diagnostic compare did not produce a complete metric");
    }
    result.tabsMetrics = tabsProcessMemory;
  }

  const metrics = JSON.parse(fs.readFileSync(metricsPath, "utf8").replace(/^\uFEFF/, ""));
  const processMemory = metrics?.metrics?.processMemory;
  if (!processMemory || processMemory.snapshotComplete !== true) {
    throw new Error("Process-memory compare did not produce a complete metric");
  }
  if (lifecycle && processMemory.lifecycle?.snapshotComplete !== true) {
    throw new Error("Lifecycle compare did not produce a complete closed metric");
  }
  result.metrics = processMemory;
  // 这里的 status 只表示“采集与结构校验完成”，门槛是否通过由 T4 evidence evaluator 判断。
  result.status = "complete";
} catch (error) {
  result.errors.push(String(error?.stack ?? error?.message ?? error));
  await captureFailureDebug(mainPage);
} finally {
  result.generatedAt = new Date().toISOString();
  if (browser) await browser.close().catch(() => {});
  await terminateProcess();
  try {
    fs.rmSync(sandbox, { recursive: true, force: true, maxRetries: 5, retryDelay: 1000 });
  } catch (error) {
    result.errors.push(`sandbox cleanup failed: ${String(error?.message ?? error)}`);
  }
  fs.writeFileSync(reportPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
}

console.log(JSON.stringify({ report: reportPath, status: result.status, result }, null, 2));
process.exitCode = result.status === "complete" ? 0 : 1;
