import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createQuickPocketService } from "../src/utils/quickPocketService.ts";
import { DEFAULT_QUICK_POCKET_ID, MAX_QUICK_POCKET_NAME_LENGTH, isValidQuickPocketName, mergeQuickPocketDefinitions } from "../src/utils/quickPocketRegistry.ts";
import { buildQuickPocketListNodes, filterQuickPocketItems, hasQuickPocketContent, isLatestQuickPocketRequest, maskPrivateBody, moveQuickPocketItem, moveQuickPocketItemWithinTag, resolveQuickPocketDropPlacement, summarizeQuickPocketBody, type QuickPocketItem } from "../src/utils/quickPocketModel.ts";

test("空标题和空内文的 Quick Pocket 不应提交，只有一项内容时允许保存", () => {
  assert.equal(hasQuickPocketContent("   ", "\n\t"), false);
  assert.equal(hasQuickPocketContent("标题", ""), true);
  assert.equal(hasQuickPocketContent("", "内文"), true);
});

test("Quick Pocket 摘要限制为一行并使用省略号", () => {
  assert.equal(summarizeQuickPocketBody("npm\nrun\ttauri dev", 12), "npm run tau…");
});

test("Quick Pocket 隐私摘要打码但不修改原文", () => {
  assert.equal(maskPrivateBody("secret"), "••••••••");
});

test("Quick Pocket 首次新增在顶部，拖拽后保持用户顺序", () => {
  const items: QuickPocketItem[] = [
    { id: "a", title: "A", body: "a", tag: null, groupId: null },
    { id: "b", title: "B", body: "b", tag: null, groupId: null },
  ];
  assert.deepEqual(moveQuickPocketItem(items, "b", 0).map((item) => item.id), ["b", "a"]);
  assert.deepEqual(items.map((item) => item.id), ["a", "b"]);
});

test("Quick Pocket 按标签筛选，再次选择同一标签可恢复全部条目", () => {
  const items: QuickPocketItem[] = [
    { id: "a", title: "A", body: "a", tag: "command", groupId: null },
    { id: "b", title: "B", body: "b", tag: "text", groupId: null },
    { id: "c", title: "C", body: "c", tag: "command", groupId: null },
  ];
  assert.deepEqual(filterQuickPocketItems(items, "command").map((item) => item.id), ["a", "c"]);
  assert.deepEqual(filterQuickPocketItems(items, null).map((item) => item.id), ["a", "b", "c"]);
});

test("Quick Pocket 筛选状态下拖拽不会丢失未筛选条目", () => {
  const items: QuickPocketItem[] = [
    { id: "a", title: "A", body: "a", tag: "command", groupId: null },
    { id: "b", title: "B", body: "b", tag: "text", groupId: null },
    { id: "c", title: "C", body: "c", tag: "command", groupId: null },
  ];
  assert.deepEqual(moveQuickPocketItemWithinTag(items, "c", 0, "command").map((item) => item.id), ["c", "b", "a"]);
});

test("Quick Pocket service 使用独立 command 并复制内文契约", async () => {
  const calls: Array<[string, Record<string, unknown> | undefined]> = [];
  const service = createQuickPocketService(async <T>(command: string, args?: Record<string, unknown>) => {
    calls.push([command, args]);
    return [] as T;
  }, async () => () => undefined);
  await service.add("标题", "内文", "text", null);
  await service.update("qp_1", "标题", "密码内文", "private");
  await service.reorder(["qp_1"]);
  assert.deepEqual(calls.map(([command]) => command), ["quick_pocket_add", "quick_pocket_update", "quick_pocket_reorder"]);
  assert.equal(calls[0][1]?.body, "内文");
  assert.equal(calls[1][1]?.body, "密码内文");
});

test("旧 Quick Pocket 响应不能覆盖更新后的快照", () => {
  assert.equal(isLatestQuickPocketRequest(5, 5), true);
  assert.equal(isLatestQuickPocketRequest(4, 5), false);
});

test("Quick Pocket registry 永远保留未迁移的默认 Pocket", () => {
  assert.equal(DEFAULT_QUICK_POCKET_ID, "default");
  assert.deepEqual(mergeQuickPocketDefinitions([{ id: "p_01", name: "p_01" }]), [
    { id: "default", name: "Quick Pocket" },
    { id: "p_01", name: "p_01" },
  ]);
});

test("Quick Pocket service 按 pocketId 隔离列表和新增文件", async () => {
  const calls: Array<[string, Record<string, unknown> | undefined]> = [];
  const service = createQuickPocketService(async <T>(command: string, args?: Record<string, unknown>) => {
    calls.push([command, args]);
    return [] as T;
  }, async () => () => undefined);
  await service.list("p_01");
  await service.add("标题", "内文", "text", null, "p_01");
  assert.deepEqual(calls, [
    ["quick_pocket_list", { pocketId: "p_01" }],
    ["quick_pocket_add", { title: "标题", body: "内文", tag: "text", groupId: null, pocketId: "p_01" }],
  ]);
});

test("Quick Pocket 名称最多 6 个字符，默认 Pocket 不参与管理", () => {
  assert.equal(MAX_QUICK_POCKET_NAME_LENGTH, 6);
  assert.equal(isValidQuickPocketName("代码片段"), true);
  assert.equal(isValidQuickPocketName("代码片段收藏夹"), false);
  assert.equal(isValidQuickPocketName("   "), false);
  assert.equal(DEFAULT_QUICK_POCKET_ID, "default");
});

test("Quick Pocket 管理 command 覆盖新建、命名和删除", async () => {
  const calls: Array<[string, Record<string, unknown> | undefined]> = [];
  const service = createQuickPocketService(async <T>(command: string, args?: Record<string, unknown>) => {
    calls.push([command, args]);
    return [] as T;
  }, async () => () => undefined);
  await service.createPocket("代码片段");
  await service.renamePocket("p_01", "工作资料");
  await service.deletePocket("p_01");
  assert.deepEqual(calls, [
    ["quick_pocket_create", { name: "代码片段" }],
    ["quick_pocket_rename", { pocketId: "p_01", name: "工作资料" }],
    ["quick_pocket_delete_pocket", { pocketId: "p_01" }],
  ]);
});

test("Quick Pocket 入口使用弹出式选择器，独立窗口按 ID 打开", () => {
  const entry = readFileSync(new URL("../src/components/QuickPocketEntry.tsx", import.meta.url), "utf8");
  const windowSource = readFileSync(new URL("../src/utils/quickPocketWindow.ts", import.meta.url), "utf8");
  const main = readFileSync(new URL("../src/main.tsx", import.meta.url), "utf8");
  assert.match(entry, /QuickPocketPicker/);
  assert.doesNotMatch(entry, /createQuickPocket|createPocket/);
  assert.doesNotMatch(readFileSync(new URL("../src/components/QuickPocketPicker.tsx", import.meta.url), "utf8"), /新建|删除/);
  assert.match(readFileSync(new URL("../src/components/QuickPocketPicker.css", import.meta.url), "utf8"), /width:\s*130px/);
  assert.match(windowSource, /open: \(pocketId: string\)/);
  assert.match(main, /label\.startsWith\("quick-pocket-"\)/);
});

test("Quick Pocket 管理板块位于项目设置中", () => {
  const settings = readFileSync(new URL("../src/components/compact/UnifiedSettingsPanel.tsx", import.meta.url), "utf8");
  const panel = readFileSync(new URL("../src/components/QuickPocketSettingsPanel.tsx", import.meta.url), "utf8");
  assert.match(settings, /quickPockets/);
  assert.match(settings, /QuickPocketSettingsPanel/);
  assert.match(panel, /maxLength=\{6\}/);
  assert.match(panel, /quick-pocket-manager-input-wrap/);
  assert.doesNotMatch(panel, /<button[^>]*>新建<\/button>/);
  assert.match(panel, /DeleteButton/);
  assert.match(panel, /onDoubleClick/);
  assert.doesNotMatch(panel, /命名<\/button>/);
  assert.match(panel, /onBlur=\{\(\) => setEditingId\(null\)\}/);
  assert.match(panel, /className="mk-save-button"/);
  assert.match(panel, />Save<\/span>/);
  assert.match(panel, /quick-pocket-manager-create[\s\S]*className="mk-save-button"/);
  assert.match(panel, /default/);
  assert.match(readFileSync(new URL("../src/components/QuickPocketEntry.tsx", import.meta.url), "utf8"), /focusin|blur/);
  assert.match(readFileSync(new URL("../src/components/QuickPocketPicker.css", import.meta.url), "utf8"), /left:\s*0/);
});

test("Quick Pocket 设置页为列表与管理操作保留请求序号", () => {
  const panel = readFileSync(new URL("../src/components/QuickPocketSettingsPanel.tsx", import.meta.url), "utf8");
  assert.match(panel, /requestVersionRef/);
  assert.match(panel, /isLatestQuickPocketRequest/);
});

test("Quick Pocket 设置条目在删除按钮左侧提供复制 ID 操作", () => {
  const panel = readFileSync(new URL("../src/components/QuickPocketSettingsPanel.tsx", import.meta.url), "utf8");
  const css = readFileSync(new URL("../src/components/QuickPocketSettingsPanel.css", import.meta.url), "utf8");
  assert.match(panel, /CopyFeedbackIcon/);
  assert.match(panel, /navigator\.clipboard\.writeText\(pocketId\)/);
  assert.match(panel, /复制 Pocket ID/);
  assert.match(panel, /quick-pocket-manager-copy/);
  assert.match(css, /quick-pocket-manager-row:not\(\.is-default\):hover\s*\{\s*background:\s*color-mix/s);
  assert.match(css, /quick-pocket-manager-copy:hover[^{]*\{[^}]*background:\s*transparent\s*!important[^}]*color:\s*var\(--mk-primary\)/s);
});

test("Quick Pocket 窗口标题使用 Pocket 显示名称", () => {
  const shell = readFileSync(new URL("../src/components/QuickPocketShell.tsx", import.meta.url), "utf8");
  const panel = readFileSync(new URL("../src/components/QuickPocketPanel.tsx", import.meta.url), "utf8");
  assert.match(shell, /config\.quick_pockets\?\.find/);
  assert.match(shell, /pocketName=\{pocketName\}/);
  assert.match(panel, /\{pocketName\}/);
});

test("Quick Pocket 分组模型保留组内顺序并过滤无效单条分组", async () => {
  const { groupItems } = await import("../src/utils/quickPocketModel.ts");
  const items: QuickPocketItem[] = [
    { id: "a", title: "A", body: "a", tag: null, groupId: "g1" },
    { id: "c", title: "C", body: "c", tag: null, groupId: "g1" },
    { id: "b", title: "B", body: "b", tag: null, groupId: "g2" },
  ];
  assert.deepEqual(groupItems(items, [{ id: "g1", name: "工作" }, { id: "g2", name: "单条" }]).map((group) => group.items.map((item) => item.id)), [["a", "c"]]);
});

test("Quick Pocket 分组作为普通列表节点保留混合顺序", () => {
  const items: QuickPocketItem[] = [
    { id: "top", title: "顶部普通条目", body: "", tag: null, groupId: null },
    { id: "a", title: "A", body: "", tag: null, groupId: "g1" },
    { id: "bottom", title: "底部普通条目", body: "", tag: null, groupId: null },
    { id: "c", title: "C", body: "", tag: null, groupId: "g1" },
  ];
  const nodes = buildQuickPocketListNodes(items, [{ id: "g1", name: "G1" }]);
  assert.deepEqual(nodes.map((node) => node.type === "item" ? node.item.id : `group:${node.group.id}`), ["top", "group:g1", "bottom"]);
  assert.deepEqual(nodes[1]?.type === "group" ? nodes[1].items.map((item) => item.id) : [], ["a", "c"]);
});

test("Quick Pocket 拖拽命中按上 25%、中间 50%、下 25% 分区", () => {
  assert.equal(resolveQuickPocketDropPlacement(10, 0, 100, true), "before");
  assert.equal(resolveQuickPocketDropPlacement(25, 0, 100, true), "group");
  assert.equal(resolveQuickPocketDropPlacement(50, 0, 100, true), "group");
  assert.equal(resolveQuickPocketDropPlacement(75, 0, 100, true), "group");
  assert.equal(resolveQuickPocketDropPlacement(90, 0, 100, true), "after");
  assert.equal(resolveQuickPocketDropPlacement(50, 0, 100, false), "after");
});

test("Quick Pocket 指针捕获后按坐标重新命中条目", () => {
  const panel = readFileSync(new URL("../src/components/QuickPocketPanel.tsx", import.meta.url), "utf8");
  assert.match(panel, /document\.elementFromPoint\(event\.clientX, event\.clientY\)/);
  assert.doesNotMatch(panel, /\(event\.target as HTMLElement\)\.closest<HTMLElement>\("\[data-pocket-id\]"\)/);
});

test("Quick Pocket 只有两个未分组条目之间允许中部建组", () => {
  const panel = readFileSync(new URL("../src/components/QuickPocketPanel.tsx", import.meta.url), "utf8");
  assert.match(panel, /draggedId && !sourceItem\?\.groupId && !targetItem\.groupId && !selectedTag/);
  assert.match(panel, /quick-pocket-group-actions/);
  assert.doesNotMatch(panel, /quick-pocket-group-add/);
  assert.doesNotMatch(panel, /quick-pocket-ungrouped-label/);
});

test("Quick Pocket 分组使用紧凑标题栏、强调色手柄和整组轮廓线", () => {
  const css = readFileSync(new URL("../src/components/QuickPocketPanel.css", import.meta.url), "utf8");
  assert.match(css, /\.quick-pocket-group\s*\{[^}]*border:\s*1px solid color-mix\(in srgb, var\(--mk-primary\)/s);
  assert.match(css, /\.quick-pocket-group-header\s*\{[^}]*min-height:\s*20px/s);
  assert.match(css, /\.quick-pocket-group-drag\s*\{[^}]*color:\s*var\(--mk-primary\)\s*!important/s);
  assert.match(css, /\.quick-pocket-group-header svg\s*\{[^}]*width:\s*13px[^}]*height:\s*13px/s);
});

test("Quick Pocket 分组命名复用资料库新建文件夹的下划线输入样式", () => {
  const panel = readFileSync(new URL("../src/components/QuickPocketPanel.tsx", import.meta.url), "utf8");
  const css = readFileSync(new URL("../src/components/QuickPocketPanel.css", import.meta.url), "utf8");
  assert.match(panel, /className="quick-pocket-group-dialog-input"/);
  assert.match(panel, /className="quick-pocket-group-dialog-line"/);
  assert.match(panel, /className="quick-pocket-group-dialog-add"[\s\S]*?>Add<\/button>/);
  assert.doesNotMatch(panel, /<label htmlFor="quick-pocket-group-name">分组名称<\/label>/);
  assert.doesNotMatch(panel, />取消<\/button>/);
  assert.match(css, /\.quick-pocket-group-dialog\s*\{[^}]*top:\s*48px[^}]*left:\s*50%[^}]*display:\s*flex/s);
  assert.match(css, /\.quick-pocket-group-dialog\s*\{[^}]*--quick-pocket-group-dialog-control-height:\s*40px/s);
  assert.match(css, /\.quick-pocket-group-dialog-field\s*\{[^}]*height:\s*var\(--quick-pocket-group-dialog-control-height\)[^}]*box-sizing:\s*border-box/s);
  assert.match(css, /\.quick-pocket-group-dialog-input\s*\{[^}]*height:\s*100%[^}]*box-sizing:\s*border-box/s);
  assert.match(css, /\.quick-pocket-group-dialog-input\s*\{[^}]*padding:\s*0 1em/s);
  assert.match(css, /\.quick-pocket-group-dialog-add\s*\{[^}]*height:\s*var\(--quick-pocket-group-dialog-control-height\)[^}]*box-sizing:\s*border-box/s);
  assert.match(css, /\.quick-pocket-group-dialog-add\s*\{[^}]*padding:\s*0 1em/s);
  assert.match(css, /\.quick-pocket-group-dialog-input:focus\s*~\s*\.quick-pocket-group-dialog-line/);
});

test("Quick Pocket continuously monitors native foreground state before requesting close", () => {
  const panel = readFileSync(new URL("../src/components/QuickPocketPanel.tsx", import.meta.url), "utf8");
  const shell = readFileSync(new URL("../src/components/QuickPocketShell.tsx", import.meta.url), "utf8");
  const windowSource = readFileSync(new URL("../src-tauri/src/quick_pocket_window.rs", import.meta.url), "utf8");
  assert.match(panel, /onWindowDragStart/);
  assert.match(shell, /appBridge\.window\.startDragging\(\)/);
  assert.doesNotMatch(shell, /window\.addEventListener\("blur"/);
  assert.match(shell, /<LockToggleButton/);
  assert.match(shell, /locked=\{locked\}/);
  assert.match(windowSource, /start_foreground_monitor/);
  assert.match(windowSource, /std::thread::spawn/);
  assert.match(windowSource, /!crate::win_present::is_native_presented\(&window\)/);
  assert.match(windowSource, /crate::win_present::is_native_foreground\(&window\)/);
  assert.match(windowSource, /save_and_hide\(&window(?:, [^)]+)?\)/);
  assert.doesNotMatch(windowSource, /WindowEvent::Focused\(false\)\s*=>\s*\{\s*if let Err\(error\) = save_and_hide/s);
});

test("Quick Pocket input renders a dedicated save action", () => {
  const panel = readFileSync(new URL("../src/components/QuickPocketPanel.tsx", import.meta.url), "utf8");
  assert.match(panel, /quick-pocket-title-field/);
  assert.match(panel, /className="quick-pocket-save"[\s\S]*?>Add<\/button>/);
});

test("Quick Pocket 行操作仅在悬浮时显示，已设标签常显且使用标签自身颜色", () => {
  const panel = readFileSync(new URL("../src/components/QuickPocketPanel.tsx", import.meta.url), "utf8");
  const css = readFileSync(new URL("../src/components/QuickPocketPanel.css", import.meta.url), "utf8");
  const rowStart = panel.indexOf("displayItems.map");
  assert.ok(panel.indexOf("quick-pocket-row-action", rowStart) < panel.indexOf("quick-pocket-tag", rowStart));
  assert.match(panel, /item\.tag \? <button[\s\S]*?QuickTodoAddTagButton/);
  assert.match(css, /\.quick-pocket-row-action\s*\{[^}]*\bopacity:\s*0[^}]*\bvisibility:\s*hidden/s);
  assert.match(css, /\.quick-pocket-row:hover\s+\.quick-pocket-row-action,[\s\S]*?\.quick-pocket-row:focus-within\s+\.quick-pocket-row-action\s*\{[^}]*\bopacity:\s*1[^}]*\bvisibility:\s*visible/s);
  assert.match(css, /\.quick-pocket-row:not\(:has\(\.quick-pocket-tag--set\)\)\s+\.quick-pocket-tag\s*\{[^}]*\bopacity:\s*0/s);
  assert.match(css, /\.quick-pocket-tag\.tag-command\s*\{[^}]*color:\s*var\(--mk-pocket-command\)/s);
  assert.match(css, /\.quick-pocket-tag\.tag-path\s*\{[^}]*color:\s*var\(--mk-pocket-path\)/s);
  assert.match(css, /\.quick-pocket-tag\.tag-private\s*\{[^}]*color:\s*var\(--mk-pocket-private\)/s);
  assert.doesNotMatch(css, /\.quick-pocket-tag\s*\{[^}]*color:\s*var\(--mk-primary\)/s);
});

test("Quick Pocket 行标签复用待办式弹出选择器，并直接更新 Pocket 标签", () => {
  const panel = readFileSync(new URL("../src/components/QuickPocketPanel.tsx", import.meta.url), "utf8");
  const picker = readFileSync(new URL("../src/components/QuickPocketTagPicker.tsx", import.meta.url), "utf8");
  const css = readFileSync(new URL("../src/components/QuickPocketPanel.css", import.meta.url), "utf8");
  assert.match(panel, /activeTagPickerId/);
  assert.match(panel, /QuickPocketTagPicker/);
  assert.match(panel, /onUpdate\(item\.id, item\.title, item\.body, nextTag\)/);
  assert.match(picker, /QUICK_POCKET_TAGS\.map/);
  assert.match(picker, /role="radiogroup"/);
  assert.match(css, /\.quick-pocket-tag-picker-popover\s*\{[^}]*\bposition:\s*absolute[^}]*\bright:\s*calc\(100% \+ 6px\)/s);
  assert.match(css, /quick-pocket-tag-picker-enter/);
});
