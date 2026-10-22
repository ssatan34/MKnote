/**
 * 在隔离 Phase 1A Tauri harness 的真实 Windows WebView2 中采集编辑器基准。
 *
 * 该探针只启动 PoC，不启动生产 MKnote；每次 harness 使用独立的临时
 * WebView2/AppData 目录，CDP 的键盘输入也明确不代表真实 OS IME。
 */
import crypto from "node:crypto";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { spawn, spawnSync } from "node:child_process";
import { normalizeEditorStructure } from "./editor-structure.mjs";

const playwrightExports = await import("playwright");
const chromium = playwrightExports.chromium ?? playwrightExports.default?.chromium;
if (!chromium) throw new Error("Playwright chromium export is unavailable");

const pocRoot = path.resolve(import.meta.dirname, "..");
const repositoryRoot = path.resolve(pocRoot, "..", "..");
const tauriCommand = path.join(
  repositoryRoot,
  "node_modules",
  "@tauri-apps",
  "cli",
  "tauri.js",
);
const configPath = path.join(pocRoot, "src-tauri", "tauri.conf.json");
const artifactDir = path.join(pocRoot, "artifacts");
const reportPath = process.env.MKN_PHASE1A_BENCHMARK_REPORT
  ? path.resolve(process.env.MKN_PHASE1A_BENCHMARK_REPORT)
  : path.join(artifactDir, "phase1a-webview2-benchmark.json");

const benchmarkSizes = Object.freeze([100 * 1024, 500 * 1024]);
const benchmarkFixture = process.env.MKN_PHASE1A_BENCHMARK_FIXTURE ?? "table";
if (!["table", "paragraph", "single-table"].includes(benchmarkFixture)) {
  throw new Error(
    `invalid MKN_PHASE1A_BENCHMARK_FIXTURE: ${benchmarkFixture}`,
  );
}
const benchmarkEditorProfile =
  process.env.MKN_PHASE1A_BENCHMARK_EDITOR_PROFILE ?? "normal";
if (
  [
    "normal",
    "no-gfm",
    "no-table-runtime",
    "no-table-align-runtime",
  "no-table-editing-runtime",
  "incremental-table-align-runtime",
  "virtualized-blocks",
].includes(benchmarkEditorProfile) === false
) {
  throw new Error(
    `invalid MKN_PHASE1A_BENCHMARK_EDITOR_PROFILE: ${benchmarkEditorProfile}`,
  );
}
const benchmarkLayout = process.env.MKN_PHASE1A_BENCHMARK_LAYOUT ?? "normal";
if (!["normal", "no-table-layout"].includes(benchmarkLayout)) {
  throw new Error(
    `invalid MKN_PHASE1A_BENCHMARK_LAYOUT: ${benchmarkLayout}`,
  );
}
const devPort = readPort(
  "MKN_PHASE1A_BENCHMARK_DEV_PORT",
  4181,
  "benchmark dev",
);
const cdpPort = readPort(
  "MKN_PHASE1A_BENCHMARK_CDP_PORT",
  9251,
  "benchmark CDP",
);
if (devPort === 4173) {
  throw new Error(
    "benchmark dev port 4173 is reserved for the Owner acceptance window; choose another port",
  );
}

const coldSamples = readCount("MKN_PHASE1A_BENCHMARK_COLD_SAMPLES", 30);
const hotWarmup = readCount("MKN_PHASE1A_BENCHMARK_HOT_WARMUP", 5);
const hotSamples = readCount("MKN_PHASE1A_BENCHMARK_HOT_SAMPLES", 100);
const keyWarmup = readCount("MKN_PHASE1A_BENCHMARK_KEY_WARMUP", 5);
const keySamples = readCount("MKN_PHASE1A_BENCHMARK_KEY_SAMPLES", 1000);
const operationTimeoutMs = readCount(
  "MKN_PHASE1A_BENCHMARK_OPERATION_TIMEOUT_MS",
  120000,
  1000,
);
const keyEventTimeoutMs = readCount(
  "MKN_PHASE1A_BENCHMARK_KEY_EVENT_TIMEOUT_MS",
  operationTimeoutMs,
  1000,
);
const keyGapMs = readCount("MKN_PHASE1A_BENCHMARK_KEY_GAP_MS", 16, 0);
const keyInitialWaitMs = readCount(
  "MKN_PHASE1A_BENCHMARK_KEY_INITIAL_WAIT_MS",
  0,
  0,
);
const keyInputMode = process.env.MKN_PHASE1A_BENCHMARK_KEY_INPUT_MODE ?? "press";
if (!["press", "insert-text", "exec-command"].includes(keyInputMode)) {
  throw new Error(
    `invalid MKN_PHASE1A_BENCHMARK_KEY_INPUT_MODE: ${keyInputMode}`,
  );
}
const focusMode = process.env.MKN_PHASE1A_BENCHMARK_FOCUS_MODE ?? "programmatic";
if (!["programmatic", "click"].includes(focusMode)) {
  throw new Error(`invalid MKN_PHASE1A_BENCHMARK_FOCUS_MODE: ${focusMode}`);
}
const cdpTimeoutMs = readCount(
  "MKN_PHASE1A_BENCHMARK_CDP_TIMEOUT_MS",
  300000,
  1000,
);

const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "mknote-phase1a-benchmark-"));
const cargoTarget = path.join(sandbox, "cargo-target");
fs.mkdirSync(cargoTarget, { recursive: true });

const devServerConfig = (size) =>
  JSON.stringify({
    build: {
      beforeDevCommand: `npm run dev -- --host 127.0.0.1 --port ${devPort}`,
      devUrl: `http://127.0.0.1:${devPort}/?benchmarkBytes=${size}&benchmarkFixture=${encodeURIComponent(benchmarkFixture)}&benchmarkLayout=${encodeURIComponent(benchmarkLayout)}&benchmarkEditorProfile=${encodeURIComponent(benchmarkEditorProfile)}`,
    },
  });

const sourceFiles = [
  "poc/visual-editor-phase1a/index.html",
  "poc/visual-editor-phase1a/package.json",
  "poc/visual-editor-phase1a/scripts/editor-structure.mjs",
  "poc/visual-editor-phase1a/scripts/phase1a-webview2-benchmark.mjs",
  "poc/visual-editor-phase1a/src/benchmarkMode.ts",
  "poc/visual-editor-phase1a/src/benchmarkDomVirtualization.ts",
  "poc/visual-editor-phase1a/src/fastGfmTableParser.ts",
  "poc/visual-editor-phase1a/src/main.ts",
  "poc/visual-editor-phase1a/src/rawHtmlComment.ts",
  "poc/visual-editor-phase1a/src/tableAlignmentRuntime.ts",
  "poc/visual-editor-phase1a/src/style.css",
  "poc/visual-editor-phase1a/src-tauri/tauri.conf.json",
];

function readPort(name, fallback, label) {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isInteger(value) || value < 1024 || value > 65535) {
    throw new Error(`invalid ${name} for ${label}: ${value}`);
  }
  return value;
}

function readCount(name, fallback, minimum = 0) {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isInteger(value) || value < minimum) {
    throw new Error(`invalid ${name}: ${value}`);
  }
  return value;
}

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function poll(callback, timeoutMs, intervalMs = 100) {
  const deadline = Date.now() + timeoutMs;
  let lastError;

  while (Date.now() < deadline) {
    try {
      const value = await callback();
      if (value) return value;
    } catch (error) {
      lastError = error;
    }
    await wait(intervalMs);
  }

  if (lastError) throw lastError;
  throw new Error(`condition was not met within ${timeoutMs}ms`);
}

function isPortOpen(port) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host: "127.0.0.1", port });
    let settled = false;
    const finish = (open) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(open);
    };

    socket.setTimeout(500, () => finish(false));
    socket.once("connect", () => finish(true));
    socket.once("error", () => finish(false));
  });
}

async function assertPortFree(port, label) {
  if (await isPortOpen(port)) {
    throw new Error(
      `${label} port ${port} is already in use; refusing to attach to an existing process`,
    );
  }
}

async function waitForPort(port, expectedOpen, timeoutMs) {
  await poll(
    async () => (await isPortOpen(port)) === expectedOpen,
    timeoutMs,
    250,
  );
}

async function waitForCdp() {
  await poll(
    async () => {
      try {
        const response = await fetch(`http://127.0.0.1:${cdpPort}/json/list`);
        return response.ok;
      } catch {
        return false;
      }
    },
    cdpTimeoutMs,
    250,
  );
}

async function waitForReady(page) {
  const status = page.locator("#editor-status");
  await status.waitFor({ state: "visible", timeout: operationTimeoutMs });
  await poll(
    async () => (await status.getAttribute("data-state")) === "ready",
    operationTimeoutMs,
  );
  await page
    .locator(".ProseMirror")
    .waitFor({ state: "visible", timeout: operationTimeoutMs });

  const timing = await page.evaluate(() => {
    const readyEntries = performance.getEntriesByName("mknote-editor-ready");
    const createStartEntries = performance.getEntriesByName(
      "mknote-editor-create-start",
    );
    const createEndEntries = performance.getEntriesByName(
      "mknote-editor-create-end",
    );
    const stateInitEntries = performance.getEntriesByName(
      "mknote-editor-state-init",
    );
    const viewInitEntries = performance.getEntriesByName(
      "mknote-editor-view-init",
    );
    const editorReadyMs = readyEntries.at(-1)?.startTime ?? null;
    const createStartMs = createStartEntries.at(-1)?.startTime ?? null;
    const createEndMs = createEndEntries.at(-1)?.startTime ?? null;
    const stateInitMs = stateInitEntries.at(-1)?.startTime ?? null;
    const viewInitMs = viewInitEntries.at(-1)?.startTime ?? null;

    if (
      typeof editorReadyMs !== "number" ||
      typeof createStartMs !== "number" ||
      typeof createEndMs !== "number" ||
      typeof stateInitMs !== "number" ||
      typeof viewInitMs !== "number"
    ) {
      throw new Error("editor creation timing marks are incomplete");
    }

    return new Promise((resolve) => {
      requestAnimationFrame(() => {
        resolve({
          createDurationMs: createEndMs - createStartMs,
          stateInitMs: stateInitMs - createStartMs,
          viewInitMs: viewInitMs - stateInitMs,
          editorReadyMs,
          readyToFirstFrameMs: performance.now() - editorReadyMs,
        });
      });
    });
  });

  return timing;
}

async function getRuntimeMetadata(page) {
  return page.evaluate(() => ({
    userAgent: navigator.userAgent,
    platform: navigator.platform,
    devicePixelRatio: window.devicePixelRatio,
  }));
}

async function getEditorStructure(page) {
  const rawSnapshot = await page.evaluate(() => {
    const editor = document.querySelector(".ProseMirror");
    if (!(editor instanceof HTMLElement)) {
      throw new Error("ProseMirror root missing");
    }

    const directBlocks = Array.from(editor.children);
    const visibleDirectBlockCount = directBlocks.filter(
      (block) =>
        block instanceof HTMLElement &&
        getComputedStyle(block).display !== "none" &&
        block.getClientRects().length > 0,
    ).length;

    return {
      rootChildCount: editor.children.length,
      descendantElementCount: editor.querySelectorAll("*").length,
      tableCount: editor.querySelectorAll("table").length,
      rowCount: editor.querySelectorAll("tr").length,
      cellCount: editor.querySelectorAll("th, td").length,
      paragraphCount: editor.querySelectorAll("p").length,
      listItemCount: editor.querySelectorAll("li").length,
      headingCount: editor.querySelectorAll("h1, h2, h3, h4, h5, h6").length,
      imageCount: editor.querySelectorAll("img").length,
      textContentLength: editor.textContent?.length ?? 0,
      visibleDirectBlockCount,
      hiddenDirectBlockCount: directBlocks.length - visibleDirectBlockCount,
    };
  });

  return normalizeEditorStructure(rawSnapshot);
}

async function waitForBenchmarkUrl(page, size) {
  await poll(
    async () => {
      try {
        const url = new URL(page.url());
        return (
          url.port === String(devPort) &&
          url.searchParams.get("benchmarkBytes") === String(size) &&
          url.searchParams.get("benchmarkFixture") === benchmarkFixture &&
          url.searchParams.get("benchmarkLayout") === benchmarkLayout &&
          url.searchParams.get("benchmarkEditorProfile") ===
            benchmarkEditorProfile
        );
      } catch {
        return false;
      }
    },
    operationTimeoutMs,
  );
}

function extractWebView2Version(userAgent) {
  return userAgent.match(/(?:Edg|Edge)\/([\d.]+)/)?.[1] ?? null;
}

function detectInstalledWebView2Version() {
  const roots = [
    path.join(
      process.env["ProgramFiles(x86)"] ?? "C:\\Program Files (x86)",
      "Microsoft",
      "EdgeWebView",
      "Application",
    ),
    path.join(
      process.env.ProgramFiles ?? "C:\\Program Files",
      "Microsoft",
      "EdgeWebView",
      "Application",
    ),
    path.join(
      process.env.LOCALAPPDATA ?? "",
      "Microsoft",
      "EdgeWebView",
      "Application",
    ),
  ];
  const versions = [];
  for (const root of roots) {
    try {
      for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
        if (entry.isDirectory() && /^\d+(?:\.\d+){2,3}$/.test(entry.name)) {
          versions.push(entry.name);
        }
      }
    } catch {
      // A machine may install WebView2 in only one of the standard roots.
    }
  }
  return versions.sort(compareVersions).at(-1) ?? null;
}

function compareVersions(left, right) {
  const leftParts = left.split(".").map(Number);
  const rightParts = right.split(".").map(Number);
  for (let index = 0; index < Math.max(leftParts.length, rightParts.length); index += 1) {
    const difference = (leftParts[index] ?? 0) - (rightParts[index] ?? 0);
    if (difference !== 0) return difference;
  }
  return 0;
}

function buildHash() {
  const hash = crypto.createHash("sha256");
  for (const relativePath of sourceFiles) {
    const absolutePath = path.join(repositoryRoot, relativePath);
    hash.update(relativePath);
    hash.update("\0");
    hash.update(fs.readFileSync(absolutePath));
    hash.update("\0");
  }
  return hash.digest("hex");
}

function gitHead() {
  const result = spawnSync("git", ["rev-parse", "HEAD"], {
    cwd: repositoryRoot,
    encoding: "utf8",
    windowsHide: true,
  });
  return result.status === 0 ? result.stdout.trim() : null;
}

function worktreeDirty() {
  const result = spawnSync("git", ["diff", "--quiet", "--"], {
    cwd: repositoryRoot,
    windowsHide: true,
  });
  return result.status !== 0;
}

function percentile(samples, quantile) {
  if (samples.length === 0) return null;
  const sorted = [...samples].sort((left, right) => left - right);
  const index = Math.min(
    sorted.length - 1,
    Math.ceil(sorted.length * quantile) - 1,
  );
  return sorted[index];
}

function summarize(samples, expectedSamples, failures = []) {
  const sorted = [...samples].sort((left, right) => left - right);
  return {
    status:
      failures.length > 0
        ? "failed"
        : expectedSamples > 0 && samples.length !== expectedSamples
          ? "incomplete"
          : "pass",
    count: samples.length,
    expected: expectedSamples,
    median: percentile(sorted, 0.5),
    p95: percentile(sorted, 0.95),
    min: sorted[0] ?? null,
    max: sorted.at(-1) ?? null,
    failures,
  };
}

function createRunDirectories(label) {
  const runRoot = fs.mkdtempSync(path.join(sandbox, `${label}-`));
  const appData = path.join(runRoot, "AppData");
  const tempDir = path.join(runRoot, "Temp");
  const directories = {
    runRoot,
    appData,
    localAppData: path.join(appData, "Local"),
    roamingAppData: path.join(appData, "Roaming"),
    tempDir,
    webviewData: path.join(runRoot, "WebView2"),
  };
  for (const directory of Object.values(directories)) {
    fs.mkdirSync(directory, { recursive: true });
  }
  return directories;
}

function startHarness(size, label) {
  const directories = createRunDirectories(label);
  const output = [];
  const appProcess = spawn(
    process.execPath,
    [
      tauriCommand,
      "dev",
      "--config",
      configPath,
      "--config",
      devServerConfig(size),
    ],
    {
      cwd: pocRoot,
      env: {
        ...process.env,
        APPDATA: directories.roamingAppData,
        LOCALAPPDATA: directories.localAppData,
        TEMP: directories.tempDir,
        TMP: directories.tempDir,
        WEBVIEW2_USER_DATA_FOLDER: directories.webviewData,
        CARGO_TARGET_DIR: cargoTarget,
        WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${cdpPort}`,
      },
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    },
  );
  const collect = (chunk) => {
    output.push(String(chunk).slice(-4000));
    if (output.length > 8) output.shift();
  };
  appProcess.stdout?.on("data", collect);
  appProcess.stderr?.on("data", collect);
  return { appProcess, directories, output, startedAt: performance.now() };
}

function stopHarness(appProcess) {
  if (!appProcess || appProcess.killed || !appProcess.pid) return;
  try {
    spawnSync(
      "taskkill",
      ["/PID", String(appProcess.pid), "/T", "/F"],
      { stdio: "ignore", windowsHide: true },
    );
  } catch {
    appProcess.kill();
  }
}

async function cleanupHarness(session) {
  const cleanupErrors = [];
  if (session?.browser) {
    await session.browser.close().catch((error) => {
      cleanupErrors.push(`browser: ${String(error?.message ?? error)}`);
    });
  }
  stopHarness(session?.appProcess);
  try {
    await waitForPort(cdpPort, false, 15000);
    await waitForPort(devPort, false, 15000);
  } catch (error) {
    cleanupErrors.push(`ports: ${String(error?.message ?? error)}`);
  }
  if (session?.directories?.runRoot) {
    let lastError;
    for (let attempt = 0; attempt < 20; attempt += 1) {
      try {
        fs.rmSync(session.directories.runRoot, {
          recursive: true,
          force: true,
          maxRetries: 5,
          retryDelay: 250,
        });
        if (!fs.existsSync(session.directories.runRoot)) break;
      } catch (error) {
        lastError = error;
      }
      await wait(500);
    }
    if (fs.existsSync(session.directories.runRoot)) {
      cleanupErrors.push(
        `sandbox: ${String(lastError?.message ?? "temporary directory remained locked")}`,
      );
    }
  }
  return cleanupErrors;
}

async function openHarness(size, label) {
  await assertPortFree(devPort, "benchmark dev");
  await assertPortFree(cdpPort, "benchmark CDP");

  const launch = startHarness(size, label);
  let browser;
  try {
    await waitForCdp();
    browser = await chromium.connectOverCDP(`http://127.0.0.1:${cdpPort}`);
    const context = browser.contexts()[0];
    if (!context) throw new Error("WebView2 CDP context is missing");
    const page = await poll(
      async () => {
        for (const candidate of context.pages()) {
          try {
            const url = new URL(candidate.url());
            if (
              url.port === String(devPort) &&
              url.searchParams.get("benchmarkBytes") === String(size) &&
              url.searchParams.get("benchmarkFixture") === benchmarkFixture
            ) {
              return candidate;
            }
          } catch {
            // about:blank can be exposed briefly before the Vite page exists.
          }
        }
        return false;
      },
      operationTimeoutMs,
      100,
    );
    await waitForBenchmarkUrl(page, size);
    const ready = await waitForReady(page);
    return {
      ...launch,
      appProcess: launch.appProcess,
    browser,
    context,
    page,
    ready,
    editorTiming: ready,
    hostReadyMs: performance.now() - launch.startedAt,
    runtime: await getRuntimeMetadata(page),
    editorStructure: await getEditorStructure(page),
  };
  } catch (error) {
    const cleanupErrors = await cleanupHarness({
      ...launch,
      browser,
    });
    const suffix = cleanupErrors.length > 0
      ? `; cleanup: ${cleanupErrors.join(" | ")}`
      : "";
    throw new Error(`${String(error?.message ?? error)}${suffix}`, {
      cause: error,
    });
  }
}

async function reloadAndMeasure(page, size) {
  const startedAt = performance.now();
  await page.reload({
    waitUntil: "domcontentloaded",
    timeout: operationTimeoutMs,
  });
  await waitForBenchmarkUrl(page, size);
  const ready = await waitForReady(page);
  return {
    hostReadyMs: performance.now() - startedAt,
    editorReadyMs: ready.editorReadyMs,
  };
}

async function snapshotKeyFailureContext(page, attempt) {
  return page.evaluate((input) => {
    const editor = document.querySelector(".ProseMirror");
    const activeElement = document.activeElement;
    const selection = window.getSelection();
    const previousAttempt = window.__mknoteBenchmarkKeyAttempt;

    const describeNode = (node) => {
      if (!(node instanceof Node)) return null;
      const element =
        node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
      return {
        nodeType: node.nodeType,
        tagName: element?.tagName ?? null,
        className:
          typeof element?.className === "string" ? element.className : null,
        isInsideEditor: Boolean(editor && element && editor.contains(element)),
      };
    };

    const describeElement = (element) =>
      element instanceof HTMLElement
        ? {
            tagName: element.tagName,
            id: element.id || null,
            className: element.className || null,
            contentEditable: element.contentEditable,
            isContentEditable: element.isContentEditable,
          }
        : null;

    return {
      phase: input.phase,
      keyIndex: input.keyIndex,
      expectedKey: input.expectedKey,
      document: {
        readyState: document.readyState,
        hidden: document.hidden,
        visibilityState: document.visibilityState,
        hasFocus: document.hasFocus(),
      },
      activeElement: describeElement(activeElement),
      editor:
        editor instanceof HTMLElement
          ? {
              isConnected: editor.isConnected,
              contentEditable: editor.contentEditable,
              isContentEditable: editor.isContentEditable,
        hasFocus: activeElement === editor,
        childCount: editor.children.length,
        descendantElementCount: editor.querySelectorAll("*").length,
        visibleDirectBlockCount: Array.from(editor.children).filter(
          (block) =>
            block instanceof HTMLElement &&
            getComputedStyle(block).display !== "none" &&
            block.getClientRects().length > 0,
        ).length,
        hiddenDirectBlockCount: Array.from(editor.children).filter(
          (block) =>
            block instanceof HTMLElement &&
            getComputedStyle(block).display === "none",
        ).length,
        textContentLength: editor.textContent?.length ?? 0,
            }
          : null,
      selection: selection
        ? {
            rangeCount: selection.rangeCount,
            isCollapsed: selection.isCollapsed,
            anchorOffset: selection.anchorOffset,
            focusOffset: selection.focusOffset,
            anchorNode: describeNode(selection.anchorNode),
            focusNode: describeNode(selection.focusNode),
          }
        : null,
      eventCounts: previousAttempt?.eventCounts ?? null,
      lastEvent: previousAttempt?.lastEvent ?? null,
    };
  }, attempt);
}

async function raiseKeyFailure(page, attempt, message) {
  let diagnostic;
  try {
    diagnostic = await snapshotKeyFailureContext(page, attempt);
  } catch (error) {
    diagnostic = {
      phase: attempt.phase,
      keyIndex: attempt.keyIndex,
      expectedKey: attempt.expectedKey,
      snapshotError: String(error?.message ?? error),
    };
  }

  const failure = new Error(message);
  failure.keyIndex = attempt.keyIndex;
  failure.keyDiagnostic = diagnostic;
  throw failure;
}

async function measureKeyToPaint(page, index, phase) {
  const expectedKey = index % 2 === 0 ? "x" : "y";
  const attempt = { phase, keyIndex: index, expectedKey };
  await page.bringToFront();
  if (focusMode === "click") {
    await page.locator(".ProseMirror").click({
      position: { x: 40, y: 24 },
      timeout: operationTimeoutMs,
    });
  } else {
    await page.evaluate(() => {
      const editor = document.querySelector(".ProseMirror");
      if (!(editor instanceof HTMLElement)) {
        throw new Error("ProseMirror root is missing before focus");
      }
      editor.focus({ preventScroll: true });
    });
  }
  const measurement = page.evaluate(
    ({ timeoutMs, keyIndex, expectedKey }) =>
      new Promise((resolve) => {
        const editor = document.querySelector(".ProseMirror");
        if (!(editor instanceof HTMLElement)) {
          resolve({
            status: "failed",
            message: "ProseMirror root is missing",
          });
          return;
        }

        const eventTypes = [
          "keydown",
          "beforeinput",
          "input",
          "keyup",
          "compositionstart",
          "compositionend",
        ];
        const eventCounts = Object.fromEntries(
          eventTypes.map((eventType) => [eventType, 0]),
        );
        const attemptState = {
          keyIndex,
          expectedKey,
          eventCounts,
          lastEvent: null,
        };
        window.__mknoteBenchmarkKeyAttempt = attemptState;

        const recordEvent = (event) => {
          eventCounts[event.type] += 1;
          attemptState.lastEvent = {
            type: event.type,
            timeMs: performance.now(),
            inputType: "inputType" in event ? event.inputType : null,
          };
        };
        for (const eventType of eventTypes) {
          editor.addEventListener(eventType, recordEvent);
        }

        const startedAt = performance.now();
        let timeout;
        const cleanup = () => {
          window.clearTimeout(timeout);
          for (const eventType of eventTypes) {
            editor.removeEventListener(eventType, recordEvent);
          }
          editor.removeEventListener("input", onInput);
        };
        timeout = window.setTimeout(() => {
          cleanup();
          resolve({
            status: "timeout",
            message: "input event was not observed before timeout",
          });
        }, timeoutMs);
        const onInput = (_event) => {
          const inputAt = performance.now();
          window.requestAnimationFrame(() => {
            cleanup();
            resolve({
              status: "pass",
              measurement: {
                keyToPaintMs: performance.now() - startedAt,
                inputToPaintMs: performance.now() - inputAt,
              },
            });
          });
        };
        editor.addEventListener("input", onInput, { once: true });
      }),
    { timeoutMs: keyEventTimeoutMs, keyIndex: index, expectedKey },
  );

  try {
    if (keyInputMode === "insert-text") {
      await page.keyboard.insertText(expectedKey);
    } else if (keyInputMode === "exec-command") {
      await page.evaluate((text) => {
        document.execCommand("insertText", false, text);
      }, expectedKey);
    } else {
      await page.keyboard.press(expectedKey);
    }
  } catch (error) {
    await raiseKeyFailure(
      page,
      attempt,
      `keyboard press failed: ${String(error?.message ?? error)}`,
    );
  }

  let result;
  try {
    result = await measurement;
  } catch (error) {
    await raiseKeyFailure(
      page,
      attempt,
      `key measurement failed: ${String(error?.message ?? error)}`,
    );
  }

  if (result.status !== "pass") {
    await raiseKeyFailure(page, attempt, result.message);
  }
  return result.measurement;
}

async function runColdStart(size) {
  const samples = [];
  const failures = [];
  let runtime = null;
  let editorStructure = null;
  let editorTiming = null;

  for (let index = 0; index < coldSamples; index += 1) {
    let session;
    try {
      session = await openHarness(size, `cold-${size}-${index}`);
      runtime ??= session.runtime;
      editorStructure ??= session.editorStructure;
      editorTiming ??= session.editorTiming;
      samples.push(session.hostReadyMs);
    } catch (error) {
      failures.push({ index, error: String(error?.message ?? error) });
    } finally {
      const cleanupErrors = await cleanupHarness(session);
      if (cleanupErrors.length > 0) {
        failures.push({ index, error: cleanupErrors.join(" | ") });
      }
    }
  }

  return {
    metric: summarize(samples, coldSamples, failures),
    runtime,
    editorStructure,
    editorTiming,
  };
}

async function runHotReload(size) {
  const samples = [];
  const failures = [];
  let session;
  try {
    session = await openHarness(size, `hot-${size}`);
    for (let index = 0; index < hotWarmup; index += 1) {
      await reloadAndMeasure(session.page, size);
    }
    for (let index = 0; index < hotSamples; index += 1) {
      samples.push((await reloadAndMeasure(session.page, size)).editorReadyMs);
    }
  } catch (error) {
    failures.push({ error: String(error?.message ?? error) });
  } finally {
    const cleanupErrors = await cleanupHarness(session);
    if (cleanupErrors.length > 0) failures.push({ error: cleanupErrors.join(" | ") });
  }
  return {
    metric: summarize(samples, hotSamples, failures),
    runtime: session?.runtime ?? null,
    editorStructure: session?.editorStructure ?? null,
    editorTiming: session?.editorTiming ?? null,
  };
}

async function runKeyToPaint(size) {
  const samples = [];
  const inputToPaint = [];
  const failures = [];
  let session;
  try {
    session = await openHarness(size, `key-${size}`);
    await wait(keyInitialWaitMs);
    for (let index = 0; index < keyWarmup; index += 1) {
      await measureKeyToPaint(session.page, index, "warmup");
      await wait(keyGapMs);
    }
    for (let index = 0; index < keySamples; index += 1) {
      const measurement = await measureKeyToPaint(session.page, index, "sample");
      samples.push(measurement.keyToPaintMs);
      inputToPaint.push(measurement.inputToPaintMs);
      await wait(keyGapMs);
    }
  } catch (error) {
    failures.push({
      phase: error?.keyDiagnostic?.phase ?? null,
      keyIndex: error?.keyIndex ?? null,
      error: String(error?.message ?? error),
      context: error?.keyDiagnostic ?? null,
    });
  } finally {
    const cleanupErrors = await cleanupHarness(session);
    if (cleanupErrors.length > 0) failures.push({ error: cleanupErrors.join(" | ") });
  }

  return {
    metric: {
      ...summarize(samples, keySamples, failures),
      inputToPaintP95: percentile(inputToPaint, 0.95),
    },
    runtime: session?.runtime ?? null,
    editorStructure: session?.editorStructure ?? null,
    editorTiming: session?.editorTiming ?? null,
  };
}

const results = {};
const runtimeBySize = {};
let fatal = null;

try {
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  for (const size of benchmarkSizes) {
    const key = `${size}B`;
    const cold = await runColdStart(size);
    const hotReload = await runHotReload(size);
    const keyToPaint = await runKeyToPaint(size);
    runtimeBySize[key] = cold.runtime ?? hotReload.runtime ?? keyToPaint.runtime;
    results[key] = {
      coldStart: cold.metric,
      hotReload: hotReload.metric,
      keyToPaint: keyToPaint.metric,
      editorStructure:
        cold.editorStructure ?? hotReload.editorStructure ?? keyToPaint.editorStructure,
      editorTiming:
        cold.editorTiming ?? hotReload.editorTiming ?? keyToPaint.editorTiming,
    };
  }
} catch (error) {
  fatal = String(error?.stack ?? error?.message ?? error);
}

const runtime = Object.values(runtimeBySize).find(Boolean) ?? null;
const installedWebView2Version = detectInstalledWebView2Version();
const reportedWebView2Version =
  installedWebView2Version ??
  (runtime ? extractWebView2Version(runtime.userAgent) : null);
const report = {
  generatedAt: new Date().toISOString(),
  protocol: {
    benchmarkSizes,
    benchmarkFixture,
    benchmarkLayout,
    benchmarkEditorProfile,
    coldSamples,
    hotWarmup,
    hotSamples,
    keyWarmup,
    keySamples,
    operationTimeoutMs,
    keyEventTimeoutMs,
    keyGapMs,
    keyInitialWaitMs,
    keyInputMode,
    focusMode,
    percentile: "ceil(n * q) - 1",
  },
  build: {
    buildHash: buildHash(),
    gitHead: gitHead(),
    worktreeDirty: worktreeDirty(),
  },
  environment: {
    os: {
      platform: os.platform(),
      release: os.release(),
      version: os.version(),
      arch: os.arch(),
      cpu: os.cpus()[0]?.model ?? null,
      totalMemoryBytes: os.totalmem(),
    },
    node: process.version,
    ports: { dev: devPort, cdp: cdpPort },
    webView2: reportedWebView2Version || runtime
      ? {
          version: reportedWebView2Version,
          userAgentVersion: runtime
            ? extractWebView2Version(runtime.userAgent)
            : null,
          userAgent: runtime?.userAgent ?? null,
          platform: runtime?.platform ?? null,
          devicePixelRatio: runtime?.devicePixelRatio ?? null,
        }
      : null,
  },
  results,
  fatal,
  limitations: [
    "仅测隔离 Phase 1A PoC 的 Tauri dev harness，不代表生产 Tab、Popout、EditorPane 或保存链。",
    "coldStart 是 harness 进程启动到 mknote-editor-ready 的主机计时；hotReload 是同一 harness 内 page reload 后的编辑器 ready 标记。",
    "keyToPaint 使用 Playwright/CDP keyboard events，不代表 Microsoft Pinyin 等真实 OS IME；IME 结果必须看独立 IME 探针和人工验收。",
    "本探针不测 CAS 保存、自动保存主线程阻塞、进程树内存增量或 ZIP 包体；这些指标仍未验收。",
    "stateInitMs 是 ProseMirror plugin state.init 的时间标记相对 create-start 的区间，包含 Milkdown 状态准备及此前的 Markdown→文档构建；viewInitMs 是 plugin view 初始化相对 state-init 的区间，只用于定位，不等同于单独 parser 或 DOM paint 时间。",
    "keyGapMs 是连续 CDP 键事件之间的探针节奏间隔，不计入单次 key-to-paint；它用于避免输入注入队列饱和，不代表真实 OS IME。",
    "keyInitialWaitMs 是编辑器 ready/结构快照之后、首次键输入之前的额外 settle 等待，不计入单次 key-to-paint。",
  "keyInputMode=insert-text 或 exec-command 仅用于区分 CDP/浏览器文本注入与物理键事件路径，不代表正式 key-to-paint 或真实 OS IME；正式默认值是 press。",
    "keyToPaint 失败时会记录有限的焦点、contentEditable、选区和键事件计数，不记录编辑器正文。",
    "报告只写字节数和时延统计，不写入 benchmark Markdown 正文。",
    ...(benchmarkLayout === "no-table-layout"
      ? ["no-table-layout 会隐藏表格，仅用于估算布局下界，不代表可交付编辑器行为。"]
      : []),
    ...(benchmarkEditorProfile === "no-gfm"
      ? ["no-gfm 会跳过 GFM preset，仅用于估算非表格 schema 成本，不代表可交付编辑器行为。"]
      : []),
  ...(benchmarkEditorProfile === "no-table-runtime"
    ? ["no-table-runtime 会移除 GFM 表格运行时修复插件，但保留表格 schema/解析，仅用于定位初始化成本，不代表可交付编辑器行为。"]
    : []),
  ...(benchmarkEditorProfile === "no-table-align-runtime"
    ? ["no-table-align-runtime 会移除 keepTableAlignPlugin，但保留 GFM 表格 schema/解析，仅用于定位运行时成本，不代表可交付编辑器行为。"]
    : []),
  ...(benchmarkEditorProfile === "no-table-editing-runtime"
    ? ["no-table-editing-runtime 会移除 tableEditingPlugin，但保留 GFM 表格 schema/解析，仅用于定位运行时成本，不代表可交付编辑器行为。"]
    : []),
  ...(benchmarkEditorProfile === "incremental-table-align-runtime"
    ? ["incremental-table-align-runtime 仅扫描事务触及的 table 并同步 body alignment，属于隔离 PoC，不代表可交付编辑器行为。"]
    : []),
  ...(benchmarkEditorProfile === "virtualized-blocks"
    ? ["virtualized-blocks 仅隐藏活动窗口之外的 PoC DOM block；不代表已解决滚动锚定、离屏选择或生产节点视图。"]
    : []),
  ],
};

try {
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), "utf8");
} finally {
  try {
    fs.rmSync(sandbox, {
      recursive: true,
      force: true,
      maxRetries: 5,
      retryDelay: 250,
    });
  } catch (error) {
    report.cleanup = { error: String(error?.message ?? error) };
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), "utf8");
  }
}

const metricFailures = Object.values(results).flatMap((result) => [
  result.coldStart,
  result.hotReload,
  result.keyToPaint,
]);
const failed = Boolean(
  fatal || metricFailures.some((metric) => metric.status !== "pass"),
);
console.log(
  JSON.stringify(
    {
      report: reportPath,
      buildHash: report.build.buildHash,
      webView2: report.environment.webView2?.version ?? null,
      results: Object.fromEntries(
        Object.entries(results).map(([size, result]) => [size, {
          coldStart: result.coldStart,
          hotReload: result.hotReload,
          keyToPaint: result.keyToPaint,
        }]),
      ),
      fatal,
      failed,
    },
    null,
    2,
  ),
);
process.exitCode = failed ? 1 : 0;
