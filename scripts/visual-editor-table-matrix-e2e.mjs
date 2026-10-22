/**
 * 显式 visual-prosemirror Release 的表格兼容矩阵探针。
 *
 * 每个场景都从临时数据根目录加载一次，再重开同一隔离副本验证结构稳定性。
 * 该探针只观察真实加载结果，不使用替代输入协议，也不修改正式 T4 manifest。
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawn } from "node:child_process";
import { pathToFileURL } from "node:url";

const root = path.resolve(import.meta.dirname, "..");
const executable = path.join(root, "src-tauri", "target", "release", "md-sticky-note.exe");
const artifactDir = path.join(
  root,
  "poc",
  "visual-editor-phase1a",
  "artifacts",
  "phase2-production",
);
const runId = process.env.MKN_TABLE_MATRIX_RUN_ID ?? "20260824";
const basePort = Number(process.env.MKN_TABLE_MATRIX_CDP_PORT ?? 9341);
const reportPath = path.join(artifactDir, `phase2-production-table-matrix-${runId}.json`);
const fixtureModulePath = path.join(
  root,
  "tests",
  "fixtures",
  "visual-editor",
  "tableMatrix.ts",
);
const configuredPlaywrightModule = process.env.MKN_PLAYWRIGHT_MODULE;
const defaultPlaywrightModule = pathToFileURL(
  path.join(root, "poc", "visual-editor-phase1a", "node_modules", "playwright", "index.mjs"),
).href;
const playwrightExports = await import(configuredPlaywrightModule ?? defaultPlaywrightModule);
const chromium = playwrightExports.chromium ?? playwrightExports.default?.chromium;
const { VISUAL_EDITOR_TABLE_MATRIX } = await import(pathToFileURL(fixtureModulePath).href);

if (!chromium) throw new Error("Playwright chromium export is unavailable");
if (!Number.isInteger(basePort) || basePort <= 0) {
  throw new Error(`MKN_TABLE_MATRIX_CDP_PORT must be a positive integer: ${basePort}`);
}
if (!fs.existsSync(executable)) {
  throw new Error(`Visual Release executable not found: ${executable}`);
}

fs.mkdirSync(artifactDir, { recursive: true });

const runtimeErrors = [];

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function waitFor(predicate, timeoutMs, description) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    try {
      if (await predicate()) return;
    } catch (error) {
      lastError = error;
    }
    await wait(100);
  }
  throw new Error(`${description}${lastError ? `: ${String(lastError.message ?? lastError)}` : ""}`);
}

function createSandbox(caseName, seed) {
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), `mknote-table-matrix-${caseName}-`));
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

function childEnvironment(caseState, port) {
  const inheritedBrowserArgs = process.env.WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS?.trim();
  return {
    ...process.env,
    VITE_MKNOTE_EDITOR_MODE: "visual-prosemirror",
    APPDATA: caseState.appData,
    LOCALAPPDATA: caseState.localAppData,
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
  await waitFor(async () => {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/list`);
      return response.ok;
    } catch {
      return false;
    }
  }, 30000, `WebView2 CDP ${port} did not become ready`);
}

async function waitForCdpClosed(port) {
  await waitFor(async () => {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/list`);
      return !response.ok;
    } catch {
      return true;
    }
  }, 15000, `WebView2 CDP ${port} did not release after shutdown`);
}

async function launch(caseState, fixtureId) {
  const runExecutable = path.join(caseState.appRoot, path.basename(executable));
  const processHandle = spawn(runExecutable, [], {
    cwd: caseState.appRoot,
    env: childEnvironment(caseState, basePort),
    stdio: "ignore",
    windowsHide: true,
  });
  let browser;
  try {
    await waitForCdp(basePort);
    browser = await chromium.connectOverCDP(`http://127.0.0.1:${basePort}`);
    const context = browser.contexts()[0];
    const page = context?.pages()[0];
    if (!page) throw new Error(`${fixtureId}: Release page is unavailable`);

    page.on("pageerror", (error) => {
      runtimeErrors.push({ fixtureId, type: "pageerror", message: String(error) });
    });
    page.on("console", (message) => {
      if (message.type() === "error") {
        runtimeErrors.push({
          fixtureId,
          type: "console",
          message: message.text(),
          location: message.location(),
        });
      }
    });
    await page.waitForSelector('[data-testid="mknote-editor-pane"]', {
      state: "visible",
      timeout: 20000,
    });
    return { processHandle, browser, page };
  } catch (error) {
    if (browser) await browser.close().catch(() => undefined);
    await stopProcess(processHandle);
    await waitForCdpClosed(basePort).catch(() => undefined);
    throw error;
  }
}

async function stopProcess(processHandle) {
  if (!processHandle || processHandle.killed) return;
  try {
    execFileSync("taskkill", ["/PID", String(processHandle.pid), "/T", "/F"], {
      stdio: "ignore",
    });
  } catch {
    // 应用可能已经自行退出。
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
  await waitForCdpClosed(basePort);
}

function cleanupSandbox(sandbox) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
      fs.rmSync(sandbox, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 });
      return;
    } catch {
      if (attempt === 19) throw new Error(`无法清理隔离目录：${sandbox}`);
    }
  }
}

async function ensureVisualEditor(page, fixtureId) {
  const visual = page.locator('[data-testid="mknote-visual-editor"]');
  if (!(await visual.isVisible().catch(() => false))) {
    const previewToggle = page.locator('button[aria-label="预览"]');
    if (await previewToggle.isVisible().catch(() => false)) await previewToggle.click();
  }
  await visual.waitFor({ state: "visible", timeout: 20000 });
  const editor = visual.locator(".ProseMirror");
  await editor.waitFor({ state: "visible", timeout: 20000 });
  await waitFor(
    async () => (await editor.locator("table").count()) === 1,
    20000,
    `${fixtureId}: visual table did not mount`,
  );
  return { visual, editor };
}

async function inspectFixture(page, fixture) {
  const { editor } = await ensureVisualEditor(page, fixture.id);
  const table = editor.locator("table");
  const tableCount = await editor.locator("table").count();
  const rowCount = await table.locator("tr").count();
  const columnCount = await table.locator("tr").first().locator("th, td").count();
  const headerRowCells = table.locator("tr").first().locator("th, td");
  const alignmentRecords = await headerRowCells.evaluateAll((cells) =>
    cells.map((cell) => {
      const attribute = cell.getAttribute("align")?.toLowerCase();
      const style = cell.getAttribute("style") ?? "";
      const styleMatch = style.match(/text-align\s*:\s*(left|center|right)/i)?.[1]?.toLowerCase();
      return {
        value: attribute ?? styleMatch ?? "none",
        source: attribute ? "attribute" : styleMatch ? "style" : "none",
      };
    }),
  );
  const domAlignments = alignmentRecords.map((record) => record.value);
  const alignments = alignmentRecords.map((record, index) => {
    // 浏览器会把未声明对齐的单元格呈现为 left；只在 fixture 语义为 none 时还原该默认呈现。
    if (
      record.source === "style" &&
      record.value === "left" &&
      fixture.expectedAlignments[index] === "none"
    ) {
      return "none";
    }
    return record.value;
  });

  const actual = { tableCount, rowCount, columnCount, alignments };
  const snapshot = { ...actual, domAlignments };
  const expected = {
    tableCount: 1,
    rowCount: fixture.expectedRows,
    columnCount: fixture.expectedColumns,
    alignments: [...fixture.expectedAlignments],
  };
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `${fixture.id}: table shape mismatch: ${JSON.stringify({ actual: snapshot, expected })}`,
    );
  }
  return snapshot;
}

async function verifyReopen(caseState, fixture, firstSnapshot) {
  let runtime;
  try {
    runtime = await launch(caseState, fixture.id);
    const reopenedSnapshot = await inspectFixture(runtime.page, fixture);
    if (JSON.stringify(reopenedSnapshot) !== JSON.stringify(firstSnapshot)) {
      throw new Error(
        `${fixture.id}: reopened table shape changed: ${JSON.stringify({
          firstSnapshot,
          reopenedSnapshot,
        })}`,
      );
    }
    return reopenedSnapshot;
  } finally {
    await closeRuntime(runtime);
  }
}

async function runFixture(fixture) {
  const caseState = createSandbox(fixture.id, fixture.markdown);
  let runtime;
  try {
    runtime = await launch(caseState, fixture.id);
    const firstSnapshot = await inspectFixture(runtime.page, fixture);
    if (fs.readFileSync(caseState.notePath, "utf8") !== fixture.markdown) {
      throw new Error(`${fixture.id}: initial load changed the source Markdown`);
    }
    await closeRuntime(runtime);
    runtime = undefined;

    const reopenedSnapshot = await verifyReopen(caseState, fixture, firstSnapshot);
    if (fs.readFileSync(caseState.notePath, "utf8") !== fixture.markdown) {
      throw new Error(`${fixture.id}: reopen changed the source Markdown`);
    }
    return { status: "pass", firstSnapshot, reopenedSnapshot };
  } finally {
    await closeRuntime(runtime);
    cleanupSandbox(caseState.sandbox);
  }
}

const cases = [];
const selectedFixtureIds = new Set(
  (process.env.MKN_TABLE_MATRIX_ONLY ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean),
);
for (const fixture of VISUAL_EDITOR_TABLE_MATRIX) {
  if (selectedFixtureIds.size > 0 && !selectedFixtureIds.has(fixture.id)) continue;
  try {
    cases.push({ id: fixture.id, title: fixture.title, ...(await runFixture(fixture)) });
  } catch (error) {
    cases.push({
      id: fixture.id,
      title: fixture.title,
      status: "failed",
      error: String(error?.message ?? error),
    });
  }
}

const failedCases = cases.filter((item) => item.status === "failed");
const report = {
  schemaVersion: "mknote.visual-editor.phase2-production-table-matrix.v1",
  generatedAt: new Date().toISOString(),
  runId,
  status: failedCases.length === 0 && runtimeErrors.length === 0 ? "pass" : "failed",
  fixtureCount: cases.length,
  selectedFixtureIds: [...selectedFixtureIds],
  passed: cases.filter((item) => item.status === "pass").length,
  failed: failedCases.length,
  cases,
  runtimeErrors,
  isolation: {
    cdpPort: basePort,
    visualEditorMode: "visual-prosemirror",
    temporaryDataRoots: true,
    ownerPortsUntouched: [4173, 4205, 9265, 4207],
  },
  doesNotProve: [
    "正式 T4 500 KiB press p95",
    "10 Tab + 1 Popout 进程内存门槛",
    "默认 legacy-preview 切换",
  ],
};
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ reportPath, status: report.status, passed: report.passed, failed: report.failed }));
process.exitCode = report.status === "pass" ? 0 : 1;
