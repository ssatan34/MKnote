/**
 * 显式 visual-prosemirror Release 的图片元数据保存/重开探针。
 *
 * 安全图片在临时数据根中完成加载、DOM 元数据检查、一次普通文本编辑、保存、
 * 进程重开和 DOM 元数据复核；危险图片必须回退到旧预览链路且不执行脚本。
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
const runId = process.env.MKN_IMAGE_PERSISTENCE_RUN_ID ?? "20260824";
const basePort = Number(process.env.MKN_IMAGE_PERSISTENCE_CDP_PORT ?? 9348);
const reportPath = path.join(artifactDir, `phase2-production-image-persistence-${runId}.json`);
const fixturePath = path.join(
  root,
  "tests",
  "fixtures",
  "visual-editor",
  "imagePersistence.ts",
);
const configuredPlaywrightModule = process.env.MKN_PLAYWRIGHT_MODULE;
const defaultPlaywrightModule = pathToFileURL(
  path.join(root, "poc", "visual-editor-phase1a", "node_modules", "playwright", "index.mjs"),
).href;
const playwrightExports = await import(configuredPlaywrightModule ?? defaultPlaywrightModule);
const chromium = playwrightExports.chromium ?? playwrightExports.default?.chromium;
const { VISUAL_EDITOR_IMAGE_PERSISTENCE_FIXTURES } = await import(pathToFileURL(fixturePath).href);

if (!chromium) throw new Error("Playwright chromium export is unavailable");
if (!Number.isInteger(basePort) || basePort <= 0) {
  throw new Error(`MKN_IMAGE_PERSISTENCE_CDP_PORT must be a positive integer: ${basePort}`);
}
if (!fs.existsSync(executable)) {
  throw new Error(`Visual Release executable not found: ${executable}`);
}

fs.mkdirSync(artifactDir, { recursive: true });

const runtimeErrors = [];
const expectedRuntimeErrors = [];
const tinyPng = Buffer.from("iVBORw0KGgo=", "base64");

function isExpectedHostedImageNetworkError(runtimeError) {
 return (
  runtimeError.fixtureId === "image-hosted" &&
  runtimeError.type === "console" &&
  runtimeError.message.includes("net::ERR_CONNECTION_CLOSED") &&
  runtimeError.location?.url === "https://cdn.example.com/hosted.png"
 );
}

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

function createSandbox(fixture) {
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), `mknote-image-persistence-${fixture.id}-`));
  const appRoot = path.join(sandbox, "App");
  const appData = path.join(sandbox, "AppData", "Roaming");
  const localAppData = path.join(sandbox, "AppData", "Local");
  const webviewData = path.join(sandbox, "WebView2");
  const tempDir = path.join(sandbox, "Temp");
  const notePath = path.join(appRoot, "File", "default", "default-note.md");
  const assetsDir = path.join(appRoot, "File", "assets");

  for (const directory of [path.dirname(notePath), assetsDir, appData, localAppData, webviewData, tempDir]) {
    fs.mkdirSync(directory, { recursive: true });
  }
  for (const assetName of ["local.png", "original.png", "wide.png"]) {
    fs.writeFileSync(path.join(assetsDir, assetName), tinyPng);
  }
  fs.copyFileSync(executable, path.join(appRoot, path.basename(executable)));
  fs.writeFileSync(notePath, fixture.markdown, "utf8");
  return { sandbox, appRoot, appData, localAppData, webviewData, tempDir, notePath };
}

function childEnvironment(caseState, port) {
  const inheritedBrowserArgs = process.env.WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS?.trim();
  return {
    ...process.env,
    VITE_MKNOTE_EDITOR_MODE: "visual-prosemirror",
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
   const runtimeError = {
    fixtureId,
    type: "console",
    message: message.text(),
    location: message.location(),
   };
   if (isExpectedHostedImageNetworkError(runtimeError)) {
    expectedRuntimeErrors.push(runtimeError);
   } else {
    runtimeErrors.push(runtimeError);
   }
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
  await waitForCdpClosed(basePort).catch(() => undefined);
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

async function ensureVisualImage(page, fixtureId) {
  const visual = page.locator('[data-testid="mknote-visual-editor"]');
  if (!(await visual.isVisible().catch(() => false))) {
    const previewToggle = page.locator('button[aria-label="预览"]');
    if (await previewToggle.isVisible().catch(() => false)) await previewToggle.click();
  }
  await visual.waitFor({ state: "visible", timeout: 20000 });
  const editor = visual.locator(".ProseMirror");
  await editor.waitFor({ state: "visible", timeout: 20000 });
  try {
    await waitFor(
      async () => (await editor.locator("img:not(.ProseMirror-separator)").count()) === 1,
      20000,
      `${fixtureId}: visual image did not mount`,
    );
  } catch (error) {
    const diagnostics = {
      editorReady: await visual.getAttribute("data-editor-ready"),
      text: await editor.innerText().catch(() => ""),
      html: (await editor.innerHTML().catch(() => "")).slice(0, 2000),
    };
    throw new Error(`${String(error?.message ?? error)}; diagnostics=${JSON.stringify(diagnostics)}`);
  }
  return { visual, editor };
}

async function imageSnapshot(editor) {
  return editor.locator("img:not(.ProseMirror-separator)").first().evaluate((image) => ({
    src: image.getAttribute("src") ?? "",
    alt: image.getAttribute("alt") ?? "",
    title: image.getAttribute("title") ?? "",
    sourceKind: image.getAttribute("data-mk-source-kind") ?? "",
    localRel: image.getAttribute("data-mk-rel") ?? "",
    originalLocalRel: image.getAttribute("data-mk-original-local-rel") ?? "",
    hostedUrl: image.getAttribute("data-mk-hosted-url") ?? "",
    width: image.getAttribute("data-mk-width") ?? "",
    doodledUrl: image.getAttribute("data-mk-doodled") ?? "",
  }));
}

async function waitForDiskMarker(notePath, marker) {
  await waitFor(
    () => fs.existsSync(notePath) && fs.readFileSync(notePath, "utf8").includes(marker),
    10000,
    `disk marker ${marker}`,
  );
}

async function appendSaveMarker(page, editor, marker) {
  const paragraph = editor.locator("p").filter({ hasText: "Image persistence seed" }).first();
  await paragraph.click();
  await page.keyboard.press("End");
  await page.keyboard.insertText(` ${marker}`);
  await waitFor(
    async () => (await paragraph.innerText()).includes(marker),
    10000,
    `visual image marker ${marker}`,
  );
}

async function runSafeFixture(fixture) {
  const caseState = createSandbox(fixture);
  let runtime;
  try {
    runtime = await launch(caseState, fixture.id);
    const first = await ensureVisualImage(runtime.page, fixture.id);
    const firstSnapshot = await imageSnapshot(first.editor);
    const sourceBeforeEdit = fs.readFileSync(caseState.notePath, "utf8");
    if (sourceBeforeEdit !== fixture.markdown) {
      throw new Error(`${fixture.id}: initial load changed source Markdown`);
    }
    if (JSON.stringify(firstSnapshot) !== JSON.stringify(fixture.expectedImage)) {
      throw new Error(
        `${fixture.id}: image metadata mismatch: ${JSON.stringify({ actual: firstSnapshot, expected: fixture.expectedImage })}`,
      );
    }

    const marker = `image-persistence-${runId}-${fixture.id}`;
    await appendSaveMarker(runtime.page, first.editor, marker);
    await waitForDiskMarker(caseState.notePath, marker);
    const savedMarkdown = fs.readFileSync(caseState.notePath, "utf8");
    if (!savedMarkdown.includes(fixture.imageMarkdown)) {
      throw new Error(`${fixture.id}: saved Markdown lost image source/title`);
    }

    await closeRuntime(runtime);
    runtime = undefined;
    runtime = await launch(caseState, fixture.id);
    const reopened = await ensureVisualImage(runtime.page, fixture.id);
    const reopenedSnapshot = await imageSnapshot(reopened.editor);
    if (JSON.stringify(reopenedSnapshot) !== JSON.stringify(firstSnapshot)) {
      throw new Error(
        `${fixture.id}: reopened image metadata mismatch: ${JSON.stringify({ actual: reopenedSnapshot, expected: firstSnapshot })}`,
      );
    }
    const reopenedMarkdown = fs.readFileSync(caseState.notePath, "utf8");
    if (!reopenedMarkdown.includes(fixture.imageMarkdown) || !reopenedMarkdown.includes(marker)) {
      throw new Error(`${fixture.id}: reopen changed saved image or marker`);
    }
    return {
      status: "pass",
      firstSnapshot,
      sourceUnchanged: sourceBeforeEdit === fixture.markdown,
      savedMarkdown,
      reopened: true,
      reopenedSnapshot,
    };
  } finally {
    await closeRuntime(runtime);
    cleanupSandbox(caseState.sandbox);
  }
}

async function runDangerousFixture(fixture) {
  const caseState = createSandbox(fixture);
  let runtime;
  try {
    runtime = await launch(caseState, fixture.id);
    const previewToggle = runtime.page.locator('button[aria-label="预览"]');
    if (await previewToggle.isVisible().catch(() => false)) await previewToggle.click();
    const visual = runtime.page.locator('[data-testid="mknote-visual-editor"]');
    const fallback = runtime.page.locator('[data-testid="mknote-markdown-editor"]');
    await fallback.waitFor({ state: "visible", timeout: 20000 });
    if (await visual.isVisible().catch(() => false)) {
      throw new Error(`${fixture.id}: visual editor remained visible for dangerous image source`);
    }
    if (fs.readFileSync(caseState.notePath, "utf8") !== fixture.markdown) {
      throw new Error(`${fixture.id}: dangerous source was modified during fallback`);
    }
    return { status: "pass", fallbackSourceEditor: true, sourceUnchanged: true };
  } finally {
    await closeRuntime(runtime);
    cleanupSandbox(caseState.sandbox);
  }
}

const cases = [];
const selectedFixtureIds = new Set(
  (process.env.MKN_IMAGE_PERSISTENCE_ONLY ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean),
);
for (const fixture of VISUAL_EDITOR_IMAGE_PERSISTENCE_FIXTURES) {
  if (selectedFixtureIds.size > 0 && !selectedFixtureIds.has(fixture.id)) continue;
  try {
    const result = fixture.safe
      ? await runSafeFixture(fixture)
      : await runDangerousFixture(fixture);
    cases.push({ id: fixture.id, title: fixture.title, ...result });
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
  schemaVersion: "mknote.visual-editor.phase2-production-image-persistence.v1",
  generatedAt: new Date().toISOString(),
  runId,
  status: failedCases.length === 0 && runtimeErrors.length === 0 ? "pass" : "failed",
  fixtureCount: cases.length,
  passed: cases.filter((item) => item.status === "pass").length,
  failed: failedCases.length,
 cases,
 runtimeErrors,
 expectedRuntimeErrors,
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
    "Private/Popout visual editor 已开放",
  ],
};

fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(
  JSON.stringify({
    reportPath,
    status: report.status,
    passed: report.passed,
 failed: report.failed,
 runtimeErrors: runtimeErrors.length,
 expectedRuntimeErrors: expectedRuntimeErrors.length,
 }),
);
process.exitCode = report.status === "pass" ? 0 : 1;
