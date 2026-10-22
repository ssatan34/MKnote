import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const repositoryRoot = join(import.meta.dirname, "..");
const readSource = (...parts: string[]) => readFileSync(join(repositoryRoot, ...parts), "utf8");

const readToolbarIcon = (toolbar: string, testId: string) => {
  const buttonStart = toolbar.indexOf(`data-testid="${testId}"`);
  assert.ok(buttonStart >= 0, `工具条缺少按钮：${testId}`);

  const buttonEnd = toolbar.indexOf("</button>", buttonStart);
  assert.ok(buttonEnd > buttonStart, `按钮边界无法识别：${testId}`);

  const button = toolbar.slice(buttonStart, buttonEnd);
  const icon = button.match(/<Icon\s+name="([^"]+)"/);
  assert.ok(icon, `按钮缺少图标：${testId}`);
  return icon[1];
};

test("Visual Editor 预览工具条只保留查找、表格编辑和对齐操作", () => {
  const source = readSource("src", "components", "VisualEditor.tsx");
  const toolbarStart = source.indexOf('className="visual-editor-table-toolbar"');
  const toolbarEnd = source.indexOf("{findReplaceOpen &&", toolbarStart);
  assert.ok(toolbarStart >= 0, "缺少可视化编辑工具条");
  assert.ok(toolbarEnd > toolbarStart, "工具条边界无法识别");

  const toolbar = source.slice(toolbarStart, toolbarEnd);
  for (const label of ["查找替换", "添加行", "添加列", "删除行", "删除列", "左对齐", "居中", "右对齐"]) {
    assert.doesNotMatch(
      toolbar,
      new RegExp(`>\\s*${label}\\s*<\\/button>`),
      `工具条不应直接渲染文字：${label}`,
    );
  }

  assert.doesNotMatch(toolbar, /visual-editor-insert-divider|visual-editor-table-insert/);
  assert.doesNotMatch(toolbar, /<Minus\\b|<Table2\\b/);
  for (const icon of [
    "insert_table_row",
    "delete_table_row",
    "insert_table_column",
    "delete_table_column",
    "align_left",
    "align_center",
    "align_right",
  ]) {
    assert.match(toolbar, new RegExp(`<Icon\\s+name="${icon}"`), `工具条缺少指定图标：${icon}`);
  }

  assert.ok(
    toolbar.indexOf('data-testid="visual-editor-table-add-row"') <
      toolbar.indexOf('data-testid="visual-editor-table-delete-row"'),
    "添加行和删去行必须相邻且按添加、删去排列",
  );
  assert.ok(
    toolbar.indexOf('data-testid="visual-editor-table-add-column"') <
      toolbar.indexOf('data-testid="visual-editor-table-delete-column"'),
    "添加列和删去列必须相邻且按添加、删去排列",
  );
  assert.ok(
    toolbar.indexOf('data-testid="visual-editor-table-delete-row"') <
      toolbar.indexOf('data-testid="visual-editor-table-add-column"'),
    "行操作组必须位于列操作组之前",
  );
  assert.equal(
    readToolbarIcon(toolbar, "visual-editor-table-add-row"),
    "insert_table_column",
    "添加行必须使用添加列图标",
  );
  assert.equal(
    readToolbarIcon(toolbar, "visual-editor-table-add-column"),
    "insert_table_row",
    "添加列必须使用添加行图标",
  );
});

test("资料库打开状态必须支持点击资料库外部关闭", () => {
  const source = readSource("src", "components", "CompactView.tsx");
  const statusBarSource = readSource("src", "components", "compact", "CompactStatusBar.tsx");

  assert.match(source, /onCloseLibrary/);
  assert.match(source, /data-library-surface/);
  assert.match(source, /data-library-toggle/);
  assert.match(source, /document\.addEventListener\("pointerdown"/);
  assert.match(source, /onCloseLibrary\?\.\(\)/);
  assert.match(statusBarSource, /data-library-toggle/);
});

test("资料库笔记必须提供 Lab 与便签两种打开动作", () => {
  const panelSource = readSource("src", "components", "compact", "LibraryPanel.tsx");
  const viewSource = readSource("src", "components", "CompactView.tsx");
  const appSource = readSource("src", "App.tsx");

  assert.match(panelSource, /onOpenNoteInMain/);
  assert.match(panelSource, /onOpenNoteAsSticky/);
  assert.match(panelSource, /data-testid="library-note-open-main"/);
  assert.match(panelSource, /data-testid="library-note-open-sticky"/);
  assert.match(panelSource, /title="在主界面打开（Lab）"/);
  assert.match(panelSource, /title="以便签模式打开"/);
  assert.match(panelSource, /<Icon name="open_lab" size=\{14\} \/>/);
  assert.match(panelSource, /<Icon name="open_sticky" size=\{14\} \/>/);
  assert.match(viewSource, /onOpenNoteInMain/);
  assert.match(viewSource, /onOpenNoteAsSticky/);
  assert.match(appSource, /onOpenNote=\{\(zone, name\) => void handleOpenNote\(zone, name\)\}/);
  assert.match(appSource, /onOpenNoteInMain=\{\(zone, name\) => void handleOpenNote\(zone, name\)\}/);
  assert.match(appSource, /onOpenNoteAsSticky=\{\(zone, name\) => void handlePopoutTab\(zone, name\)\}/);
});

test("用户提供的七个表格/对齐图标和两个资料库打开图标已登记", () => {
  const manifestSource = readSource("src", "assets", "icon-manifest.json");
  const iconFiles = [
    "insert-table-row.svg",
    "delete-table-row.svg",
    "insert-table-column.svg",
    "delete-table-column.svg",
    "align-left.svg",
    "align-center.svg",
    "align-right.svg",
    "open-lab.svg",
    "open-sticky.svg",
  ];

  for (const file of iconFiles) {
    const iconId = file.replace(/\.svg$/, "").replace(/-/g, "_");
    assert.match(manifestSource, new RegExp(`"id":\\s*"${iconId}"`), `图标未登记：${iconId}`);
    const iconSource = readSource("src", "assets", "icons", file);
    assert.match(iconSource, /viewBox=/, `图标缺少 viewBox：${file}`);
  }
});
