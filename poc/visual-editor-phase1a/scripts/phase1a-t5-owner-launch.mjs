/**
 * 启动隔离的 Phase 1A T5 Owner 手工验收窗口。
 *
 * 该入口只启动 PoC Tauri harness，并为本次运行分配独立的前端端口、
 * WebView2 用户数据目录、Cargo target 目录和临时用户目录。它不会连接
 * 生产 MKnote，也不会自动执行编辑操作；Playwright/CDP 只保留给人工
 * 验收后的观察与取证使用。
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn, spawnSync } from "node:child_process";

const DEFAULT_DEV_PORT = 4205;
const DEFAULT_CDP_PORT = 9265;
const OWNER_DEV_PORT = 4173;
const STARTUP_TIMEOUT_MS = 300000;

const scriptPath = fileURLToPath(import.meta.url);
const pocRoot = path.resolve(path.dirname(scriptPath), "..");
const repositoryRoot = path.resolve(pocRoot, "..", "..");
const tauriCommand = path.join(
  repositoryRoot,
  "node_modules",
  "@tauri-apps",
  "cli",
  "tauri.js",
);
const tauriConfigRelativePath = "src-tauri/tauri.conf.json";
const tauriConfigPath = path.resolve(pocRoot, tauriConfigRelativePath);
const artifactRoot = path.join(pocRoot, "artifacts", "t5-owner");

const wait = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

function parsePositivePort(rawValue, name) {
  const value = Number(rawValue);
  if (!Number.isInteger(value) || value < 1024 || value > 65535) {
    throw new Error(`${name} must be an integer between 1024 and 65535`);
  }
  return value;
}

function parseRunId(rawValue) {
  const value = rawValue || `manual-${new Date().toISOString().replaceAll(":", "-")}`;
  if (!/^[A-Za-z0-9._-]+$/.test(value)) {
    throw new Error("run id may contain only letters, numbers, dot, underscore and hyphen");
  }
  return value;
}

export function parseArgs(argv = process.argv.slice(2), env = process.env) {
  let devPort = parsePositivePort(
    env.MKN_PHASE1A_T5_DEV_PORT ?? DEFAULT_DEV_PORT,
    "dev port",
  );
  let cdpPort = parsePositivePort(
    env.MKN_PHASE1A_T5_CDP_PORT ?? DEFAULT_CDP_PORT,
    "CDP port",
  );
  let runId = env.MKN_PHASE1A_T5_RUN_ID ?? null;

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    const value = argv[index + 1];
    if (argument === "--dev-port") {
      devPort = parsePositivePort(value, "dev port");
      index += 1;
    } else if (argument === "--cdp-port") {
      cdpPort = parsePositivePort(value, "CDP port");
      index += 1;
    } else if (argument === "--run-id") {
      runId = value;
      index += 1;
    } else if (argument === "--help" || argument === "-h") {
      return { help: true };
    } else {
      throw new Error(`unknown argument: ${argument}`);
    }
  }

  if (devPort === 4173) {
    throw new Error(
      "T5 launcher refuses Owner acceptance port 4173; choose an isolated port",
    );
  }
  if (cdpPort === devPort) {
    throw new Error("CDP port must be different from the frontend port");
  }

  return {
    help: false,
    devPort,
    cdpPort,
    runId: parseRunId(runId),
  };
}

function printHelp() {
  console.log(`T5 Owner 隔离窗口启动器

用法：
  node scripts/phase1a-t5-owner-launch.mjs [--dev-port 4205] [--cdp-port 9265] [--run-id NAME]

默认不会使用 Owner 的 127.0.0.1:4173；窗口关闭后启动器随之退出。
`);
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function waitForCdp(cdpPort, child, timeoutMs = STARTUP_TIMEOUT_MS) {
  const deadline = Date.now() + timeoutMs;
  let lastError = null;

  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`Tauri harness exited before CDP was ready: ${child.exitCode}`);
    }

    try {
      const response = await fetch(`http://127.0.0.1:${cdpPort}/json/list`);
      if (response.ok) return;
    } catch (error) {
      lastError = error;
    }
    await wait(250);
  }

  throw new Error(
    `CDP did not become ready within ${timeoutMs}ms${lastError ? `: ${lastError.message}` : ""}`,
  );
}

function stopProcessTree(child) {
  if (!child || child.exitCode !== null || !child.pid) return;
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], {
      stdio: "ignore",
      windowsHide: true,
    });
  } else {
    child.kill("SIGTERM");
  }
}

async function launch(options) {
  if (!fs.existsSync(tauriCommand)) {
    throw new Error(`Tauri CLI not found: ${tauriCommand}`);
  }
  if (!fs.existsSync(tauriConfigPath)) {
    throw new Error(`Phase 1A Tauri config not found: ${tauriConfigPath}`);
  }

  const runRoot = path.join(artifactRoot, options.runId);
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "mknote-phase1a-t5-"));
  const webviewData = path.join(sandbox, "WebView2");
  const cargoTarget = path.join(sandbox, "cargo-target");
  const tempRoot = path.join(sandbox, "Temp");
  const appData = path.join(sandbox, "AppData", "Roaming");
  const localAppData = path.join(sandbox, "AppData", "Local");
  const stdoutPath = path.join(runRoot, "tauri.stdout.log");
  const stderrPath = path.join(runRoot, "tauri.stderr.log");
  const launchRecordPath = path.join(runRoot, "launch.json");

  for (const directory of [
    runRoot,
    webviewData,
    cargoTarget,
    tempRoot,
    appData,
    localAppData,
  ]) {
    fs.mkdirSync(directory, { recursive: true });
  }

  const devUrl = `http://127.0.0.1:${options.devPort}`;
  const devServerConfig = JSON.stringify({
    build: {
      beforeDevCommand: `npm run dev -- --host 127.0.0.1 --port ${options.devPort}`,
      devUrl,
    },
  });
  const environment = {
    ...process.env,
    APPDATA: appData,
    LOCALAPPDATA: localAppData,
    TEMP: tempRoot,
    TMP: tempRoot,
    WEBVIEW2_USER_DATA_FOLDER: webviewData,
    WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${options.cdpPort}`,
    CARGO_TARGET_DIR: cargoTarget,
    MKN_PHASE1A_T5_RUN_ID: options.runId,
  };

  const child = spawn(
    process.execPath,
    [
      tauriCommand,
      "dev",
      "--config",
      tauriConfigPath,
      "--config",
      devServerConfig,
    ],
    {
      cwd: pocRoot,
      env: environment,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    },
  );
  const stdout = fs.createWriteStream(stdoutPath, { flags: "a" });
  const stderr = fs.createWriteStream(stderrPath, { flags: "a" });
  child.stdout?.pipe(stdout);
  child.stderr?.pipe(stderr);

  const launchRecord = {
    schemaVersion: "mknote.visual-editor.t5-owner-launch.v1",
    runId: options.runId,
    status: "starting",
    ownerEvidence: "pending",
    launchedAt: new Date().toISOString(),
    launcherPid: process.pid,
    childPid: child.pid ?? null,
    pocRoot,
    tauriConfig: tauriConfigRelativePath,
    devPort: options.devPort,
    cdpPort: options.cdpPort,
    reservedOwnerPort: OWNER_DEV_PORT,
    sandbox,
    webviewData,
    cargoTarget,
    artifactDir: runRoot,
    stdoutLog: stdoutPath,
    stderrLog: stderrPath,
    note: "此记录只证明隔离窗口启动状态；Owner 结果必须由人工写入 T5 清单。",
  };
  writeJson(launchRecordPath, launchRecord);

  let stopping = false;
  const stop = () => {
    if (stopping) return;
    stopping = true;
    stopProcessTree(child);
  };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);

  try {
    await waitForCdp(options.cdpPort, child);
    launchRecord.status = "ready";
    launchRecord.readyAt = new Date().toISOString();
    writeJson(launchRecordPath, launchRecord);
    console.log(`T5 隔离窗口已就绪：${devUrl}`);
    console.log(`CDP：127.0.0.1:${options.cdpPort}`);
    console.log(`记录：${launchRecordPath}`);
    console.log(
      "请按 docs/visual-editor-t5-owner-checklist.md 手工操作；启动器不会自动输入或替 Owner 判定结果。",
    );

    await new Promise((resolve) => child.once("exit", resolve));
    launchRecord.status = "closed";
    launchRecord.closedAt = new Date().toISOString();
    writeJson(launchRecordPath, launchRecord);
  } catch (error) {
    launchRecord.status = "failed";
    launchRecord.error = String(error?.stack ?? error?.message ?? error);
    writeJson(launchRecordPath, launchRecord);
    stop();
    throw error;
  } finally {
    stdout.end();
    stderr.end();
    process.removeListener("SIGINT", stop);
    process.removeListener("SIGTERM", stop);
  }
}

export async function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  if (options.help) {
    printHelp();
    return;
  }
  await launch(options);
}

if (path.resolve(process.argv[1] ?? "") === scriptPath) {
  main().catch((error) => {
    console.error(error?.stack ?? error?.message ?? error);
    process.exitCode = 1;
  });
}
