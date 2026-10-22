import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("资料库单击笔记标题在主界面 Lab 打开并收起资料库", () => {
  const source = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");

  assert.match(source, /onOpenNote=\{\(zone, name\) => void handleOpenNote\(zone, name\)\}/);
  assert.match(source, /const handleOpenNote[\s\S]*?setLibraryOpen\(false\)/);
  assert.match(source, /onOpenNoteAsSticky=\{\(zone, name\) => void handlePopoutTab\(zone, name\)\}/);
});

test("Popout 关闭事件仍归还主窗口 Tab", () => {
  const source = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");

  assert.match(source, /mknote:popout-closed/);
  assert.match(source, /returnPoppedOutTabToMain\(event\.payload\.zone as NoteZone, event\.payload\.name\)/);

  const returnSource = source.slice(
    source.indexOf("const returnPoppedOutTabToMain"),
    source.indexOf("useEffect(() => {", source.indexOf("const returnPoppedOutTabToMain")),
  );
  assert.match(returnSource, /commitOpenTabs\(nextTabs\)/);
});

test("从主窗口移出到 Popout 时移除 Tab 但保留置顶元数据", () => {
  const source = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
  const popoutSource = source.slice(
    source.indexOf("const handlePopoutTab"),
    source.indexOf("const handleOpenContainingFolder"),
  );

  assert.match(popoutSource, /const nextTabs = wasOpenInMain[\s\S]*?originalTabs\.filter/);
  assert.match(popoutSource, /commitOpenTabs\(nextTabs\)/);
  assert.match(popoutSource, /pinnedTabs: pinnedTabsRef\.current/);
});

test("Popout 删除按钮复用 Quick Todo 删除样式并要求二次确认", () => {
  const source = readFileSync(new URL("../src/components/PopoutView.tsx", import.meta.url), "utf8");

  assert.match(source, /import \{ DeleteButton \} from "\.\/DeleteButton"/);
  assert.match(source, /deleteConfirming/);
  assert.match(source, /DeleteButton[\s\S]*iconSize=\{11\}/);
  assert.match(source, /Icon name="confirm" size=\{16\}/);
  assert.match(source, /windowService\.deleteNotePopout\(/);
});

test("Popout 删除命令移入回收站并抑制 Tab 归还事件", () => {
  const service = readFileSync(new URL("../src/services/windowService.ts", import.meta.url), "utf8");
  const detach = readFileSync(new URL("../src-tauri/src/detach.rs", import.meta.url), "utf8");
  const commands = readFileSync(new URL("../src-tauri/src/lib.rs", import.meta.url), "utf8");

  assert.match(service, /deleteNotePopout/);
  assert.match(detach, /pub async fn delete_note_popout/);
  assert.match(detach, /notes::delete_note\(&app, source_zone, &name\)/);
  assert.match(detach, /suppressed_popout_close_events\(\)/);
  assert.match(commands, /detach::delete_note_popout/);
});

test("Popout 删除事件清理主窗口残留 Tab 和置顶状态", () => {
  const source = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
  const deletedSource = source.slice(
    source.indexOf("const handlePoppedOutDeleted"),
    source.indexOf("const handleCompletedArchived"),
  );

  assert.match(deletedSource, /pinnedTabsRef\.current\.filter/);
  assert.match(deletedSource, /commitOpenTabs\(nextTabs\)/);
});

test("资料库中的 Popout 删除只刷新资料库，避免主窗口导航状态抖动", () => {
  const source = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
  const deletedSource = source.slice(
    source.indexOf("const handlePoppedOutDeleted"),
    source.indexOf("const handleCompletedArchived"),
  );

  assert.match(deletedSource, /refreshLibrary\(\)/);
  assert.doesNotMatch(deletedSource, /refreshAll\(\)/);
});
