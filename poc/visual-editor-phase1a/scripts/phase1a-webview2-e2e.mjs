/**
 * 在隔离 Tauri harness 的真实 Windows WebView2 中运行 Phase 1A 探针。
 *
 * 该脚本只启动 poc/visual-editor-phase1a/src-tauri，不启动生产 MKnote，
 * 并把 WebView2 用户数据目录重定向到本次运行专属的临时目录。
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";

const playwrightExports = await import("playwright");
const chromium = playwrightExports.chromium ?? playwrightExports.default?.chromium;
if (!chromium) throw new Error("Playwright chromium export is unavailable");

const pocRoot = path.resolve(import.meta.dirname, "..");
const repositoryRoot = path.resolve(pocRoot, "..", "..");
const tauriCommand = path.join(repositoryRoot, "node_modules", "@tauri-apps", "cli", "tauri.js");
const configPath = path.join(pocRoot, "src-tauri", "tauri.conf.json");
const artifactDir = path.join(pocRoot, "artifacts");
const reportPath = process.env.MKN_PHASE1A_E2E_REPORT
  ? path.resolve(process.env.MKN_PHASE1A_E2E_REPORT)
  : path.join(artifactDir, "phase1a-webview2-e2e.json");
const screenshotPath = process.env.MKN_PHASE1A_E2E_SCREENSHOT
  ? path.resolve(process.env.MKN_PHASE1A_E2E_SCREENSHOT)
  : path.join(artifactDir, "phase1a-webview2-e2e.png");
const cdpPort = Number(process.env.MKN_PHASE1A_CDP_PORT ?? 9241);
const cdpTimeoutMs = Number(process.env.MKN_PHASE1A_CDP_TIMEOUT_MS ?? 300000);
if (!Number.isInteger(cdpTimeoutMs) || cdpTimeoutMs < 1000) {
  throw new Error(`invalid MKN_PHASE1A_CDP_TIMEOUT_MS: ${cdpTimeoutMs}`);
}
const devPort = Number(process.env.MKN_PHASE1A_DEV_PORT ?? 4173);
if (!Number.isInteger(devPort) || devPort < 1024 || devPort > 65535) {
  throw new Error(`invalid MKN_PHASE1A_DEV_PORT: ${devPort}`);
}
const benchmarkBytes = process.env.MKN_PHASE1A_E2E_BENCHMARK_BYTES ?? null;
const benchmarkFixture = process.env.MKN_PHASE1A_E2E_BENCHMARK_FIXTURE ?? "table";
const benchmarkEditorProfile =
  process.env.MKN_PHASE1A_E2E_EDITOR_PROFILE ?? "normal";
const allowedBenchmarkBytes = new Set(["102400", "512000"]);
const allowedEditorProfiles = new Set([
  "normal",
  "incremental-table-align-runtime",
]);
if (benchmarkBytes !== null && !allowedBenchmarkBytes.has(benchmarkBytes)) {
  throw new Error(
    `invalid MKN_PHASE1A_E2E_BENCHMARK_BYTES: ${benchmarkBytes}`,
  );
}
if (!allowedEditorProfiles.has(benchmarkEditorProfile)) {
  throw new Error(
    `invalid MKN_PHASE1A_E2E_EDITOR_PROFILE: ${benchmarkEditorProfile}`,
  );
}
if (benchmarkEditorProfile !== "normal" && benchmarkBytes === null) {
  throw new Error(
    "MKN_PHASE1A_E2E_BENCHMARK_BYTES is required for a diagnostic editor profile",
  );
}
if (benchmarkBytes !== null && benchmarkFixture !== "table") {
  throw new Error(
    `incremental table interaction requires table fixture: ${benchmarkFixture}`,
  );
}
const isIncrementalTableProfile =
  benchmarkEditorProfile === "incremental-table-align-runtime";
const devServerConfig = JSON.stringify({
  build: {
    beforeDevCommand: `npm run dev -- --host 127.0.0.1 --port ${devPort}`,
    devUrl: `http://127.0.0.1:${devPort}`,
  },
});
const scenarioPath =
  benchmarkBytes === null
    ? "/"
    : `/?benchmarkBytes=${encodeURIComponent(benchmarkBytes)}&benchmarkFixture=${encodeURIComponent(benchmarkFixture)}&benchmarkEditorProfile=${encodeURIComponent(benchmarkEditorProfile)}`;
const scenarioUrl = `http://127.0.0.1:${devPort}${scenarioPath}`;
const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "mknote-phase1a-webview2-"));
const webviewData = path.join(sandbox, "WebView2");
const cargoTarget = path.join(sandbox, "cargo-target");

for (const directory of [artifactDir, webviewData, cargoTarget]) {
  fs.mkdirSync(directory, { recursive: true });
}

const childOutput = [];
const results = {};
let browser;
let appProcess;

const wait = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

async function poll(callback, timeout = 8000, interval = 100) {
  const deadline = Date.now() + timeout;
  let lastError;

  while (Date.now() < deadline) {
    try {
      const value = await callback();
      if (value) return value;
    } catch (error) {
      lastError = error;
    }
    await wait(interval);
  }

  if (lastError) throw lastError;
  throw new Error(`condition was not met within ${timeout}ms`);
}

async function waitForCdp() {
  await poll(async () => {
    try {
      const response = await fetch(`http://127.0.0.1:${cdpPort}/json/list`);
      return response.ok;
    } catch {
      return false;
    }
  }, cdpTimeoutMs, 250);
}

async function waitForReady(page) {
  const status = page.locator("#editor-status");
  await status.waitFor({ state: "visible", timeout: 15000 });
  await poll(async () => (await status.getAttribute("data-state")) === "ready");
  await page.locator(".ProseMirror").waitFor({ state: "visible", timeout: 15000 });
}

async function reset(page) {
  await page.goto(scenarioUrl, { waitUntil: "domcontentloaded" });
  await waitForReady(page);
}

async function markdown(page) {
  return (await page.locator("#markdown-output").textContent()) ?? "";
}

async function listDepth(locator) {
  return locator.evaluate((element) => {
    let depth = 0;
    let list = element.closest("ul, ol");
    while (list) {
      depth += 1;
      list = list.parentElement?.closest("ul, ol") ?? null;
    }
    return depth;
  });
}

async function check(name, action) {
  try {
    results[name] = { pass: true, detail: await action() };
  } catch (error) {
    results[name] = {
      pass: false,
      error: String(error?.stack ?? error?.message ?? error),
    };
  }
}

const computedAlignment = async (locator) =>
  locator.evaluate((element) => getComputedStyle(element).textAlign);

const rowColumnAlignments = async (rows, columnIndex) =>
  rows.evaluateAll((elements, index) =>
    elements.map((row) => getComputedStyle(row.cells[index]).textAlign),
  columnIndex);

const waitForColumnAlignment = async (rows, columnIndex, expected) => {
  try {
    await poll(
      async () =>
        JSON.stringify(await rowColumnAlignments(rows, columnIndex)) ===
        JSON.stringify(expected),
    );
  } catch (error) {
    const observed = await rows.evaluateAll((elements, index) =>
      elements.map((row) => ({
        computed: getComputedStyle(row.cells[index]).textAlign,
        style: row.cells[index].getAttribute("style"),
        attributes: Array.from(row.cells[index].attributes).map(
          ({ name, value }) => [name, value],
        ),
      })),
    columnIndex);
    throw new Error(
      `${String(error?.message ?? error)}; expected=${JSON.stringify(expected)}; observed=${JSON.stringify(observed)}`,
    );
  }
};

async function runIncrementalTableInteraction(page) {
  await reset(page);

  const table = page.locator(".ProseMirror table").first();
  const bodyRows = table.locator("tr:has(td)");
  const headerCells = table.locator("tr").first().locator("th");
  const tools = page.locator("#table-tools");
  await table.waitFor({ state: "visible" });

  const initialBodyRowCount = await bodyRows.count();
  if (initialBodyRowCount < 1 || (await headerCells.count()) !== 2) {
    throw new Error(
      `initial table shape mismatch: headers=${await headerCells.count()}, bodyRows=${initialBodyRowCount}`,
    );
  }

  await headerCells.first().click();
  await tools.waitFor({ state: "visible" });
  await tools.getByRole("button", { name: "居中" }).click();
  await poll(async () => (await computedAlignment(headerCells.first())) === "center");
  await waitForColumnAlignment(
    bodyRows,
    0,
    new Array(initialBodyRowCount).fill("center"),
  );

  await headerCells.nth(1).click();
  await tools.getByRole("button", { name: "右对齐" }).click();
  await poll(async () => (await computedAlignment(headerCells.nth(1))) === "right");
  await waitForColumnAlignment(
    bodyRows,
    1,
    new Array(initialBodyRowCount).fill("right"),
  );

  await tools.getByRole("button", { name: "下方插入行" }).click();
  await poll(async () => (await bodyRows.count()) === initialBodyRowCount + 1);
  await waitForColumnAlignment(
    bodyRows,
    0,
    new Array(initialBodyRowCount + 1).fill("center"),
  );
  await waitForColumnAlignment(
    bodyRows,
    1,
    new Array(initialBodyRowCount + 1).fill("right"),
  );

  await tools.getByRole("button", { name: "右侧插入列" }).click();
  await poll(async () => (await table.locator("tr").first().locator("th, td").count()) === 3);

  await headerCells.first().click();
  await tools.getByRole("button", { name: "删除当前列" }).click();
  await poll(async () => (await table.locator("tr").first().locator("th, td").count()) === 2);

  await bodyRows.first().locator("td").first().click();
  await tools.getByRole("button", { name: "删除当前行" }).click();
  await poll(async () => (await bodyRows.count()) === initialBodyRowCount);

  return {
    profile: benchmarkEditorProfile,
    benchmarkBytes: Number(benchmarkBytes),
    initial: { headers: 2, bodyRows: initialBodyRowCount },
    final: {
      headers: await table.locator("tr").first().locator("th, td").count(),
      bodyRows: await bodyRows.count(),
      firstBodyColumnAlignment: await rowColumnAlignments(bodyRows, 0),
      secondBodyColumnAlignment: await rowColumnAlignments(bodyRows, 1),
    },
  };
}

function stopHarness() {
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

try {
  appProcess = spawn(
    process.execPath,
    [
      tauriCommand,
      "dev",
      "--config",
      configPath,
      "--config",
      devServerConfig,
    ],
    {
      cwd: pocRoot,
      env: {
        ...process.env,
        APPDATA: path.join(sandbox, "AppData", "Roaming"),
        LOCALAPPDATA: path.join(sandbox, "AppData", "Local"),
        TEMP: path.join(sandbox, "Temp"),
        TMP: path.join(sandbox, "Temp"),
        WEBVIEW2_USER_DATA_FOLDER: webviewData,
        WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${cdpPort}`,
        CARGO_TARGET_DIR: cargoTarget,
      },
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    },
  );
  appProcess.stdout?.on("data", (chunk) => childOutput.push(String(chunk)));
  appProcess.stderr?.on("data", (chunk) => childOutput.push(String(chunk)));

  await waitForCdp();
  browser = await chromium.connectOverCDP(`http://127.0.0.1:${cdpPort}`);
  const context = browser.contexts()[0];
  const page = await poll(() => context.pages()[0] ?? false, 15000, 100);
  await waitForReady(page);
  if (page.url() !== scenarioUrl) {
    await page.goto(scenarioUrl, { waitUntil: "domcontentloaded" });
    await waitForReady(page);
  }

  results["webview2-ready"] = {
    pass: true,
    detail: {
      cdpPort,
      devPort,
      url: scenarioUrl,
      benchmarkBytes: benchmarkBytes === null ? null : Number(benchmarkBytes),
      benchmarkFixture,
      benchmarkEditorProfile,
      userAgent: await page.evaluate(() => navigator.userAgent),
      title: await page.title(),
    },
  };

  if (isIncrementalTableProfile) {
    await check(
      "incremental-table-profile-row-column-alignment",
      () => runIncrementalTableInteraction(page),
    );
  } else {
  await check("chinese-input-undo-redo", async () => {
    await reset(page);
    const editor = page.locator(".ProseMirror");
    await editor.click();
    await page.keyboard.press("Control+End");
    await page.keyboard.press("Enter");
    await page.keyboard.insertText("中文输入事务");
    await poll(async () => (await markdown(page)).includes("中文输入事务"));
    await page.keyboard.press("Control+Z");
    await poll(async () => !(await markdown(page)).includes("中文输入事务"));
    await page.keyboard.press("Control+Y");
    await poll(async () => (await markdown(page)).includes("中文输入事务"));
    return await markdown(page);
  });

  await check("nested-list-keyboard-commands", async () => {
    await reset(page);
    const source = page.locator(".ProseMirror p").filter({ hasText: "先写事实" }).first();
    await source.click();
    await page.keyboard.press("End");
    await page.keyboard.press("Enter");
    await page.keyboard.insertText("新增同级行动项");
    const item = page
      .locator(".ProseMirror li > p")
      .filter({ hasText: "新增同级行动项" })
      .first()
      .locator("..");
    await poll(async () => (await listDepth(item)) === 1);
    await page.keyboard.press("Tab");
    await poll(async () => (await listDepth(item)) === 2);
    await page.keyboard.press("Shift+Tab");
    await poll(async () => (await listDepth(item)) === 1);
    return await markdown(page);
  });

  await check("task-transaction-undo-redo", async () => {
    await reset(page);
    const task = page
      .locator('li[data-item-type="task"]')
      .filter({ hasText: "待完成的事情" })
      .first();
    await task.waitFor({ state: "visible", timeout: 5000 });
    const box = await task.boundingBox();
    if (!box) throw new Error("task bounding box unavailable");
    await page.mouse.click(box.x + 6, box.y + box.height / 2);
    await poll(async () => (await task.getAttribute("data-checked")) === "true");
    await poll(async () => /\[[xX]\]\s+待完成的事情/.test(await markdown(page)));
    await page.keyboard.press("Control+Z");
    await poll(async () => (await task.getAttribute("data-checked")) === "false");
    await page.keyboard.press("Control+Y");
    await poll(async () => (await task.getAttribute("data-checked")) === "true");
    return await markdown(page);
  });

  await check("selection-replace", async () => {
    await reset(page);
    const paragraph = page
      .locator(".ProseMirror p")
      .filter({ hasText: "这是一份不连接生产保存的临时文档" })
      .first();
    // Home/End only cover one visual line after wrapping. Use the DOM range
    // selection so the probe is stable across WebView2 window metrics.
    await paragraph.selectText();
    await page.keyboard.insertText("替换后的中文段落");
    const text = await page.locator(".ProseMirror").innerText();
    if (!text.includes("替换后的中文段落") || text.includes("这是一份不连接生产保存的临时文档")) {
      throw new Error(`selection replacement mismatch: ${JSON.stringify(text)}`);
    }
    return text;
  });

  await check("keyboard-clipboard", async () => {
    await reset(page);
    const source = page.locator(".ProseMirror p").filter({ hasText: "先写事实" }).first();
    await source.selectText();
    await page.keyboard.press("Control+C");
    const target = page
      .locator(".ProseMirror p")
      .filter({ hasText: "这是一份不连接生产保存的临时文档" })
      .first();
    await target.waitFor({ state: "visible" });
    await page.locator(".ProseMirror").click();
    await page.keyboard.press("Control+End");
    await page.keyboard.press("Enter");
    await page.keyboard.press("Control+V");
  await poll(async () => (await markdown(page)).match(/先写事实/g)?.length >= 2);
  return await markdown(page);
});

await check("table-keyboard-and-context-tools", async () => {
  await reset(page);
  const table = page.locator(".ProseMirror table");
  const bodyRows = table.locator("tr:has(td)");
  await table.waitFor({ state: "visible" });
  if ((await bodyRows.count()) !== 2) {
    throw new Error(`table body row count mismatch: ${await bodyRows.count()}`);
  }

  const firstBodyRow = bodyRows.first();
  await firstBodyRow.locator("td").first().click();
  await page.keyboard.press("End");
  await page.keyboard.press("Tab");
  await page.keyboard.insertText("已确认");
  await poll(async () => (await firstBodyRow.locator("td").nth(1).innerText()).includes("已确认"));

  const lastBodyCell = bodyRows.last().locator("td").last();
  await lastBodyCell.click();
  await page.keyboard.press("End");
  await page.keyboard.press("Tab");
  await page.keyboard.insertText("新增行动项");
  await poll(async () => (await bodyRows.count()) === 3);

  const tools = page.locator("#table-tools");
  await tools.waitFor({ state: "visible" });
  await tools.getByRole("button", { name: "下方插入行" }).click();
  await poll(async () => (await bodyRows.count()) === 4);
  await tools.getByRole("button", { name: "右侧插入列" }).click();
  await poll(async () => (await table.locator("tr").first().locator("th, td").count()) === 3);
  await tools.getByRole("button", { name: "删除当前列" }).click();
  await poll(async () => (await table.locator("tr").first().locator("th, td").count()) === 2);
  await tools.getByRole("button", { name: "删除当前行" }).click();
  await poll(async () => (await bodyRows.count()) === 3);
  return await markdown(page);
});
  }

await page.screenshot({ path: screenshotPath, fullPage: false });
  results["real-os-ime"] = {
    pass: false,
    status: "not-run",
    detail: "CDP keyboard events do not prove Microsoft Pinyin composition; requires user OS IME acceptance.",
  };
} catch (error) {
  results.fatal = {
    pass: false,
    error: String(error?.stack ?? error?.message ?? error),
    harnessOutput: childOutput.join("").slice(-8000),
  };
} finally {
  if (browser) {
    await Promise.race([
      browser.close().catch(() => {}),
      wait(1500),
    ]);
  }
  stopHarness();
  try {
    fs.rmSync(sandbox, { recursive: true, force: true, maxRetries: 5, retryDelay: 250 });
  } catch (error) {
    results.cleanup = { pass: false, error: String(error?.message ?? error) };
  }
}

fs.writeFileSync(
  reportPath,
  JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      harness: configPath,
      results,
    },
    null,
    2,
  ),
  "utf8",
);

const failed = Object.values(results).filter(
  (result) => result.pass === false && result.status !== "not-run",
).length;
console.log(JSON.stringify({ report: reportPath, screenshot: screenshotPath, results, failed }, null, 2));
process.exitCode = failed === 0 ? 0 : 1;
