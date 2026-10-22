/**
 * 在隔离 Release 窗口中采集 T4 保存/CAS 证据。
 *
 * `blockingMs` 来自前端 `tauriInvoke` 同步桥接调用窗口；不会把 Promise
 * 完成、磁盘轮询或 Playwright 往返时间当作主线程阻塞。保存失败和 CAS
 * 冲突分别在显式故障场景中验证，结果交给 PowerShell collector 计算 p95。
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { execFileSync, spawn } from "node:child_process";

import { parseBlockingConsoleMessage } from "./visual-editor-save-cas-console.mjs";

const root = path.resolve(import.meta.dirname, "..");
const artifactDir = path.join(root, "poc", "visual-editor-phase1a", "artifacts");
const runId = process.env.MKN_T4_SAVE_CAS_RUN_ID ?? "20260824";
const expectedSamples = 30;
const sampleTimeoutMs = Number(process.env.MKN_T4_SAVE_CAS_SAMPLE_TIMEOUT_MS ?? 15000);
const basePort = Number(process.env.MKN_T4_SAVE_CAS_CDP_PORT ?? 9258);
const configuredExecutable = process.env.MKN_T4_SAVE_CAS_RELEASE_EXE;
const releaseExecutable = configuredExecutable
  ? path.resolve(root, configuredExecutable)
  : path.join(root, "src-tauri", "target", "release", "md-sticky-note.exe");
const outputPath = path.join(
  artifactDir,
  `phase1a-t4-save-cas-samples-${runId}.json`,
);
const failurePaths = {
  saveFailure: path.join(
    artifactDir,
    `phase1a-t4-save-cas-save-failure-${runId}.json`,
  ),
  casConflict: path.join(
    artifactDir,
    `phase1a-t4-save-cas-conflict-${runId}.json`,
  ),
};

const defaultPlaywrightPath = path.join(
  root,
  "poc",
  "visual-editor-phase1a",
  "node_modules",
  "playwright",
  "index.mjs",
);
const configuredPlaywrightModule = process.env.MKN_PLAYWRIGHT_MODULE;
const playwrightModule = configuredPlaywrightModule
  ? configuredPlaywrightModule === "playwright" || configuredPlaywrightModule.startsWith("file:")
    ? configuredPlaywrightModule
    : pathToFileURL(path.resolve(configuredPlaywrightModule)).href
  : pathToFileURL(defaultPlaywrightPath).href;
const playwrightExports = await import(playwrightModule);
const chromium = playwrightExports.chromium ?? playwrightExports.default?.chromium;
if (!chromium) throw new Error(`Playwright chromium export unavailable: ${playwrightModule}`);

if (!Number.isInteger(sampleTimeoutMs) || sampleTimeoutMs <= 0) {
  throw new Error("MKN_T4_SAVE_CAS_SAMPLE_TIMEOUT_MS must be a positive integer");
}
if (!Number.isInteger(basePort) || basePort <= 0) {
  throw new Error("MKN_T4_SAVE_CAS_CDP_PORT must be a positive integer");
}
if (!fs.existsSync(releaseExecutable)) {
  throw new Error(`Release executable not found: ${releaseExecutable}`);
}
fs.mkdirSync(artifactDir, { recursive: true });

const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

function relativeArtifactPath(filePath) {
  return path.relative(root, filePath).split(path.sep).join("/");
}

function writeJson(filePath, payload) {
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

async function waitForCdp(port) {
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/list`);
      if (response.ok) return;
    } catch {
      // The isolated process may need a few seconds to create WebView2.
    }
    await wait(500);
  }
  throw new Error(`isolated WebView2 CDP endpoint did not become reachable: ${port}`);
}

async function terminateProcess(processHandle) {
  if (!processHandle) return;
  const pid = processHandle.pid;
  try {
    if (!processHandle.killed) processHandle.kill();
  } catch {
    // taskkill below remains the bounded process-tree cleanup path.
  }
  try {
    execFileSync("taskkill", ["/PID", String(pid), "/T", "/F"], {
      cwd: root,
      stdio: "ignore",
      windowsHide: true,
    });
  } catch {
    // The process may already have exited.
  }
}

async function enterPreview(page) {
  const editor = page.locator('[data-testid="mknote-preview-editor"]');
  if (!(await editor.isVisible().catch(() => false))) {
    const toggle = page.locator('button[aria-label="预览"]');
    await toggle.waitFor({ state: "visible", timeout: 15000 });
    await toggle.click();
  }
  await editor.waitFor({ state: "visible", timeout: 15000 });
  return editor;
}

async function launchIsolatedCase(caseName, caseIndex, environment, action) {
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), `mknote-save-cas-${caseName}-`));
  const appRoot = path.join(sandbox, "App");
  const appData = path.join(sandbox, "AppData", "Roaming");
  const localAppData = path.join(sandbox, "AppData", "Local");
  const tempDir = path.join(sandbox, "Temp");
  const noteDir = path.join(appRoot, "File", "default");
  const notePath = path.join(noteDir, "default-note.md");
  const runExecutable = path.join(appRoot, path.basename(releaseExecutable));
  const port = basePort + caseIndex;

  for (const directory of [appRoot, appData, localAppData, tempDir, noteDir]) {
    fs.mkdirSync(directory, { recursive: true });
  }
  fs.copyFileSync(releaseExecutable, runExecutable);
  fs.writeFileSync(notePath, `T4 save CAS seed ${caseName}\n`, "utf8");

  const inheritedBrowserArgs = process.env.WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS;
  const browserArgs = [inheritedBrowserArgs, `--remote-debugging-port=${port}`]
    .filter(Boolean)
    .join(" ");
  const childEnvironment = { ...process.env, ...environment };
  childEnvironment.APPDATA = appData;
  childEnvironment.LOCALAPPDATA = localAppData;
  childEnvironment.TEMP = tempDir;
  childEnvironment.TMP = tempDir;
  childEnvironment.WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS = browserArgs;

  let processHandle;
  let browser;
  try {
    processHandle = spawn(runExecutable, [], {
      cwd: appRoot,
      env: childEnvironment,
      stdio: "ignore",
      windowsHide: true,
    });
    await waitForCdp(port);
    browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
    const context = browser.contexts()[0];
    const page = context.pages()[0];
    await page.waitForSelector('[data-testid="mknote-editor-pane"]', {
      state: "visible",
      timeout: 20000,
    });
    const editor = await enterPreview(page);
    await page.evaluate(() => window.localStorage.setItem("mkPerf", "1"));
    await wait(250);
    return await action({ page, editor, notePath });
  } finally {
    if (browser) await browser.close().catch(() => {});
    await terminateProcess(processHandle);
    try {
      fs.rmSync(sandbox, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 });
    } catch {
      // Isolated temp cleanup failure is reported by the case when relevant.
    }
  }
}

async function collectBlockingSamples() {
  return launchIsolatedCase("samples", 0, {}, async ({ page, editor }) => {
    const samples = [];
    const perfErrors = [];
    page.on("console", (message) => {
      const text = message.text();
      const parsed = parseBlockingConsoleMessage(text);
      if (parsed) samples.push(parsed);
      if (text.includes("[mk-perf]") && /write_(?:default_)?note_checked/.test(text)) {
        perfErrors.push(text);
      }
    });

    for (let index = 0; index < expectedSamples; index += 1) {
      const previousCount = samples.length;
      await editor.click();
      await page.keyboard.press("Control+A");
      await page.keyboard.type(`save sample ${index + 1}`);
      const visibleText = await editor.innerText();
      if (!visibleText.includes(`save sample ${index + 1}`)) {
        throw new Error(`save sample ${index + 1} was not visible before blur`);
      }
      await editor.evaluate((element) => element.blur());

      const deadline = Date.now() + sampleTimeoutMs;
      while (samples.length <= previousCount && Date.now() < deadline) {
        await wait(50);
      }
      if (samples.length <= previousCount) {
        throw new Error(`blocking sample ${index + 1} was not observed within ${sampleTimeoutMs}ms`);
      }
      await wait(100);
    }

    return {
      samples: samples.slice(0, expectedSamples).map((sample, index) => ({
        index: index + 1,
        ...sample,
      })),
      observedSamples: samples.length,
      perfErrorLogs: perfErrors.length,
    };
  });
}

async function collectFailureEvidence(kind) {
  const environment = kind === "saveFailure" ? { MKN_TEST_SAVE_FAILURE: "1" } : {};
  const result = await launchIsolatedCase(kind, kind === "saveFailure" ? 1 : 2, environment, async ({
    page,
    editor,
    notePath,
  }) => {
    const perfErrors = [];
    page.on("console", (message) => {
      const text = message.text();
      if (text.includes("[mk-perf]") && /write_(?:default_)?note_checked/.test(text)) {
        perfErrors.push(text);
      }
    });

    const marker = `t4-${kind}-marker`;
    await editor.click();
    await page.keyboard.press("Control+A");
    await page.keyboard.type(marker);
    const visibleText = await editor.innerText();
    if (!visibleText.includes(marker)) {
      throw new Error(`${kind} marker was not visible before blur`);
    }

    if (kind === "casConflict") {
      fs.writeFileSync(notePath, "external CAS change\n", "utf8");
    }
    await editor.evaluate((element) => element.blur());
    await wait(1200);

    const diskText = fs.readFileSync(notePath, "utf8");
    const bodyText = await page.locator("body").innerText().catch(() => "");
    const diskPreserved = !diskText.includes(marker);
    const errorObserved = perfErrors.length > 0 || /保存|冲突|外部修改|失败/.test(bodyText);
    const status = diskPreserved && errorObserved ? "pass" : "incomplete";
    return {
      status,
      diskPreserved,
      errorObserved,
      perfErrorLogs: perfErrors.length,
      reason:
        status === "pass"
          ? `${kind} 证据已观察到拒绝写入和用户可见错误。`
          : `${kind} 未同时观察到拒绝写入与错误信号，保留为 incomplete。`,
    };
  });

  return result;
}

function incompleteFailureEvidence(name, error) {
  return {
    status: "incomplete",
    sourcePath: relativeArtifactPath(failurePaths[name]),
    reason: `${name} 隔离场景未完成：${String(error?.message ?? error)}`,
  };
}

const report = {
  schemaVersion: "mknote.visual-editor.t4-save-cas-samples.v1",
  generatedAt: new Date().toISOString(),
  expectedSamples,
  samples: [],
  failureEvidence: {
    saveFailure: {
      status: "not-run",
      sourcePath: relativeArtifactPath(failurePaths.saveFailure),
      reason: null,
    },
    casConflict: {
      status: "not-run",
      sourcePath: relativeArtifactPath(failurePaths.casConflict),
      reason: null,
    },
  },
  collector: {
    sourcePath: relativeArtifactPath(outputPath),
    command: "node scripts/collect-visual-editor-t4-save-cas-ui.mjs",
    releaseExecutable,
    sampleTimeoutMs,
  },
};

try {
  const sampleResult = await collectBlockingSamples();
  report.samples = sampleResult.samples;
  report.observedSamples = sampleResult.observedSamples;
} catch (error) {
  report.sampleError = String(error?.message ?? error);
}

for (const name of ["saveFailure", "casConflict"]) {
  try {
    const result = await collectFailureEvidence(name);
    writeJson(failurePaths[name], {
      schemaVersion: "mknote.visual-editor.t4-save-cas-failure.v1",
      generatedAt: new Date().toISOString(),
      kind: name,
      ...result,
    });
    report.failureEvidence[name] = {
      status: result.status,
      sourcePath: relativeArtifactPath(failurePaths[name]),
      reason: result.reason,
    };
  } catch (error) {
    report.failureEvidence[name] = incompleteFailureEvidence(name, error);
  }
}

writeJson(outputPath, report);
const complete =
  report.samples.length === expectedSamples &&
  report.failureEvidence.saveFailure.status === "pass" &&
  report.failureEvidence.casConflict.status === "pass";
console.log(
  JSON.stringify(
    {
      output: relativeArtifactPath(outputPath),
      samples: `${report.samples.length}/${expectedSamples}`,
      failureEvidence: report.failureEvidence,
      status: complete ? "pass" : "incomplete",
    },
    null,
    2,
  ),
);
process.exitCode = complete ? 0 : 1;
