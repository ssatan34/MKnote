/**
 * Quick data directory acceptance with isolated WebView2, app identity and files.
 * Build --debug --no-bundle with identifier com.sin.mdnote-quick-data-e2e,
 * productName MKnote Quick Data E2E; run with MKN_PLAYWRIGHT_MODULE if needed.
 * MKN_QUICK_NATIVE_PICKER=1 pauses for the native folder picker to be operated.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import { spawn, execFileSync } from "node:child_process";
const { chromium } = await import(process.env.MKN_PLAYWRIGHT_MODULE ?? "playwright");
const root = process.cwd();
const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "mknote-quick-data-e2e-"));
const appRoot = path.join(sandbox, "App");
const todoDir = path.join(sandbox, "Todo");
const pocketDir = path.join(sandbox, "Pocket");
const sharedDir = path.join(sandbox, "Allnote");
const reportDir = path.join(root, ".codex-smoke");
const ordinary = path.join(appRoot, "File", "default", "Ordinary.md");
const configPath = path.join(appRoot, "config.json");
const port = Number(process.env.MKN_QUICK_CDP_PORT ?? 9307);
const result = { pass: false, checks: [] };
let child, browser, page;
for (const dir of [appRoot, path.dirname(ordinary), todoDir, pocketDir, sharedDir, reportDir,
  ...["Roaming", "Local", "Temp"].map((name) => path.join(sandbox, name))]) fs.mkdirSync(dir, { recursive: true });
const executable = path.join(appRoot, "md-sticky-note.exe");
fs.copyFileSync(path.join(root, "src-tauri", "target", "debug", "md-sticky-note.exe"), executable);
const productName = execFileSync("powershell", ["-NoProfile", "-Command",
  "(Get-Item -LiteralPath $env:MKN_QUICK_TEST_EXE).VersionInfo.ProductName"], {
  encoding: "utf8", env: { ...process.env, MKN_QUICK_TEST_EXE: executable }, windowsHide: true,
}).trim();
assert.equal(productName, "MKnote Quick Data E2E", "build an isolated test application before running");
fs.writeFileSync(ordinary, "ordinary note must remain unchanged\n");
fs.writeFileSync(configPath, JSON.stringify({ last_note: "Ordinary.md", last_note_zone: "default",
  open_tabs: [{ zone: "default", name: "Ordinary.md", title: "Ordinary" }],
  autostart: false, always_on_top: false, clip_server_enabled: false, sync_enabled: false, sync_initialized: false,
  global_hotkeys: { toggle_window: "", focus_window: "", quick_capture: "", clipboard_inbox: "", quick_search: "" } }));
const readConfig = () => JSON.parse(fs.readFileSync(configPath, "utf8"));
const waitFor = async (predicate, message, timeout = 20000) => {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Timeout: ${message}`);
};
const ipc = (command, args = {}) => page.evaluate(({ command, args }) =>
  window.__TAURI_INTERNALS__.invoke(command, args), { command, args });
const start = async () => {
  child = spawn(executable, [], { cwd: appRoot, windowsHide: true, stdio: "ignore", env: {
    ...process.env, APPDATA: path.join(sandbox, "Roaming"), LOCALAPPDATA: path.join(sandbox, "Local"),
    TEMP: path.join(sandbox, "Temp"), TMP: path.join(sandbox, "Temp"),
    WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${port}`,
  } });
  await waitFor(async () => { try { return (await fetch(`http://127.0.0.1:${port}/json/list`)).ok; } catch { return false; } }, "CDP startup");
  browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
  page = browser.contexts()[0].pages()[0];
  await page.locator('[data-testid="mknote-editor-pane"]').waitFor({ state: "visible" });
  assert.equal(await ipc("plugin:app|identifier"), "com.sin.mdnote-quick-data-e2e");
  assert.equal(await ipc("plugin:app|name"), "MKnote Quick Data E2E");
};
const stop = async () => {
  if (browser) await browser.close().catch(() => {});
  browser = null; page = null;
  if (child?.pid) {
    const stopped = new Promise((resolve) => child.once("exit", resolve));
    try { execFileSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore" }); } catch { /* already exited */ }
    if (child.exitCode === null) await stopped;
  }
  child = null;
  await waitFor(async () => { try { await fetch(`http://127.0.0.1:${port}/json/list`); return false; } catch { return true; } }, "CDP shutdown");
};
const openSettings = async (name) => {
  if (!(await page.locator(".settings-section-stack").count())) await page.getByRole("button", { name: "设置", exact: true }).click();
  await page.getByRole("button", { name, exact: true }).click();
  await page.getByLabel(`${name} 数据目录`, { exact: true }).waitFor({ state: "visible" });
  await waitFor(async () => !(await page.getByLabel(`${name} 数据目录`, { exact: true }).isDisabled()), "directory loaded");
};
const saveDirectory = async (kind, directory) => {
  const name = kind === "todo" ? "Quick Todo" : "Quick Pocket";
  await openSettings(name);
  await page.getByLabel(`${name} 数据目录`, { exact: true }).fill(directory);
  await page.getByRole("button", { name: "保存目录", exact: true }).click();
  await waitFor(() => (readConfig()[`quick_${kind}_data_dir`] ?? "") === directory, "directory saved");
  await waitFor(async () => !(await page.getByRole("button", { name: "保存目录", exact: true }).isDisabled()), "save response");
};
const addTodo = (todoId, text) => ipc("quick_todo_add", { todoId, text, tag: "important", parentId: null });
const addPocket = (pocketId, title) => ipc("quick_pocket_add", { pocketId, title, body: "fixture body", tag: "text", groupId: null });
try {
  await start();
  const work = await ipc("quick_todo_create", { name: "Work" });
  const prompt = await ipc("quick_pocket_create", { name: "Prompt" });
  for (const id of ["default", work.id]) await addTodo(id, "old todo");
  for (const id of ["default", prompt.id]) await addPocket(id, "old pocket");
  const oldPaths = ["Quick Todo.md", `Quick Todo/${work.id}.md`, "Quick Pocket.md", `Quick Pocket/${prompt.id}.md`]
    .map((relative) => path.join(appRoot, "inbox", relative));
  let oldBytes = oldPaths.map((file) => fs.readFileSync(file, "utf8"));
  await openSettings("Quick Todo");
  const input = page.getByLabel("Quick Todo 数据目录", { exact: true });
  await input.fill("relative-path");
  await page.getByRole("button", { name: "保存目录", exact: true }).click();
  await page.getByRole("alert").waitFor({ state: "visible" });
  assert.equal(readConfig().quick_todo_data_dir, null);
  result.checks.push("invalid directory rejected without modifying config");
  if (process.env.MKN_QUICK_NATIVE_PICKER === "1") {
    await page.getByRole("button", { name: "选择 Quick Todo 数据目录", exact: true }).click();
    console.log(`NATIVE_PICKER_READY: choose ${todoDir}`);
    await waitFor(async () => (await input.inputValue()) === todoDir, "native directory selection", 180000);
    await page.getByRole("button", { name: "保存目录", exact: true }).click();
    await waitFor(() => readConfig().quick_todo_data_dir === todoDir, "native selection saved");
    result.checks.push("native folder picker selects and saves the directory");
  } else await saveDirectory("todo", todoDir);
  await page.getByRole("status").filter({ hasText: "重新启动" }).waitFor({ state: "visible" });
  await page.screenshot({ path: path.join(reportDir, "quick-data-todo-settings.png") });
  await saveDirectory("pocket", pocketDir);
  await page.screenshot({ path: path.join(reportDir, "quick-data-pocket-settings.png") });
  assert.equal(fs.readdirSync(todoDir).length, 0);
  assert.equal(fs.readdirSync(pocketDir).length, 0);
  await addTodo("default", "before restart");
  await addPocket("default", "before restart");
  oldBytes = oldPaths.map((file) => fs.readFileSync(file, "utf8"));
  assert.match(oldBytes[0], /before restart/);
  assert.match(oldBytes[2], /before restart/);
  assert.equal(fs.readdirSync(todoDir).length, 0);
  assert.equal(fs.readdirSync(pocketDir).length, 0);
  result.checks.push("independent settings persist; no migration; active paths remain fixed until restart");
  await stop(); await start();
  const status = await ipc("get_quick_data_directories");
  assert.equal(status.active_todo_dir, todoDir);
  assert.equal(status.active_pocket_dir, pocketDir);
  assert.equal(status.todo_restart_required, false);
  assert.equal(status.pocket_restart_required, false);
  assert.equal((await ipc("quick_todo_registry_list")).find((item) => item.id === work.id).name, "Work");
  assert.equal((await ipc("quick_pocket_registry_list")).find((item) => item.id === prompt.id).name, "Prompt");
  for (const id of ["default", work.id]) {
    assert.equal((await ipc("quick_todo_list", { todoId: id })).length, 0);
    const items = await addTodo(id, "new todo");
    await ipc("quick_todo_edit", { todoId: id, id: items[0].id, text: "edited todo" });
    await ipc("quick_todo_toggle", { todoId: id, id: items[0].id });
    assert.equal((await ipc("quick_todo_list", { todoId: id }))[0].completed, true);
    await ipc("quick_todo_delete", { todoId: id, id: items[0].id });
  }
  for (const id of ["default", prompt.id]) {
    assert.equal((await ipc("quick_pocket_list", { pocketId: id })).items.length, 0);
    const snapshot = await addPocket(id, "new pocket");
    await ipc("quick_pocket_update", { pocketId: id, id: snapshot.items[0].id, title: "edited pocket", body: "edited body", tag: "command" });
    assert.equal((await ipc("quick_pocket_list", { pocketId: id })).items[0].title, "edited pocket");
    await ipc("quick_pocket_delete", { pocketId: id, id: snapshot.items[0].id });
  }
  const tempTodo = await ipc("quick_todo_create", { name: "Temp" });
  const tempPocket = await ipc("quick_pocket_create", { name: "Temp" });
  const tempTodoPath = path.join(todoDir, "Quick Todo", `${tempTodo.id}.md`);
  const tempPocketPath = path.join(pocketDir, "Quick Pocket", `${tempPocket.id}.md`);
  assert.ok(fs.existsSync(tempTodoPath)); assert.ok(fs.existsSync(tempPocketPath));
  await ipc("quick_todo_delete_todo", { todoId: tempTodo.id });
  await ipc("quick_pocket_delete_pocket", { pocketId: tempPocket.id });
  assert.equal(fs.existsSync(tempTodoPath), false); assert.equal(fs.existsSync(tempPocketPath), false);
  assert.deepEqual(oldPaths.map((file) => fs.readFileSync(file, "utf8")), oldBytes);
  result.checks.push("restart uses separate directories; default and registered CRUD, completion, create/delete all pass; old files preserved");
  await saveDirectory("todo", sharedDir); await saveDirectory("pocket", sharedDir);
  await stop(); await start();
  await addTodo("default", "shared todo"); await addTodo(work.id, "shared work");
  await addPocket("default", "shared pocket"); await addPocket(prompt.id, "shared prompt");
  for (const [relative, text] of [["Quick Todo.md", "shared todo"], [`Quick Todo/${work.id}.md`, "shared work"],
    ["Quick Pocket.md", "shared pocket"], [`Quick Pocket/${prompt.id}.md`, "shared prompt"]]) {
    assert.match(fs.readFileSync(path.join(sharedDir, relative), "utf8"), new RegExp(text));
  }
  result.checks.push("one shared Allnote directory retains four independent paths and stable IDs");
  if (process.env.MKN_QUICK_WORK_CHECKS === "1") {
    const { verifyQuickWork } = await import("./quick-work-e2e-checks.mjs");
    result.checks.push(...await verifyQuickWork({ browser, ipc, sharedDir, work, reportDir }));
  }
  await saveDirectory("todo", ""); await saveDirectory("pocket", "");
  await stop(); await start();
  assert.equal((await ipc("quick_todo_list", { todoId: work.id }))[0].text, "old todo");
  assert.equal((await ipc("quick_pocket_list", { pocketId: prompt.id })).items[0].title, "old pocket");
  assert.deepEqual(oldPaths.map((file) => fs.readFileSync(file, "utf8")), oldBytes);
  assert.equal(fs.readFileSync(ordinary, "utf8"), "ordinary note must remain unchanged\n");
  assert.equal(readConfig().sync_enabled, false);
  result.checks.push("blank restores default after restart; original Quick files and ordinary note remain unchanged");
  result.pass = true;
} catch (error) {
  result.error = String(error?.stack ?? error);
  if (page) await page.screenshot({ path: path.join(reportDir, "quick-data-failure.png") }).catch(() => {});
} finally {
  await stop().catch((error) => { result.stopError = String(error); });
  // sandbox was created above by this script and is never derived from app configuration.
  for (let attempt = 0; attempt < 30; attempt++) {
    try { fs.rmSync(sandbox, { recursive: true, force: true }); break; }
    catch (error) { if (attempt === 29) result.cleanupError = String(error); else await new Promise((resolve) => setTimeout(resolve, 200)); }
  }
  fs.writeFileSync(path.join(reportDir, "quick-data-directory-e2e.json"), JSON.stringify(result, null, 2));
}
console.log(JSON.stringify(result, null, 2));
process.exitCode = result.pass ? 0 : 1;
