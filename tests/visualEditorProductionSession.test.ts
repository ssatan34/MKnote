import assert from "node:assert/strict";
import test from "node:test";
import {
  createVisualEditorSession,
  type VisualEditorAdapter,
} from "../src/visual-editor/visualEditorSession.ts";
import {
  resolveVisualEditorMode,
  shouldUseVisualEditor,
} from "../src/utils/visualEditorMode.ts";

function createFakeAdapter(initialMarkdown = ""): VisualEditorAdapter & {
  emitMarkdown(markdown: string): void;
  focusCount: number;
  loadedMarkdown: string;
} {
  let currentMarkdown = initialMarkdown;
  const listeners = new Set<(markdown: string) => void>();
  return {
    focusCount: 0,
    loadedMarkdown: initialMarkdown,
    async loadMarkdown(markdown) {
      currentMarkdown = markdown;
      this.loadedMarkdown = markdown;
    },
    getMarkdown() {
      return currentMarkdown;
    },
    focus() {
      this.focusCount += 1;
    },
    getSelection() {
      return { from: 1, to: 1 };
    },
    replaceSelection(text) {
      currentMarkdown = text;
    },
    executeCommand() {
      return false;
    },
    undo() {
      return false;
    },
    redo() {
      return false;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    emitMarkdown(markdown) {
      currentMarkdown = markdown;
      for (const listener of listeners) listener(markdown);
    },
    destroy() {
      listeners.clear();
    },
  };
}

test("visual editor mode defaults to visual while explicit legacy remains a rollback switch", () => {
  assert.equal(resolveVisualEditorMode(undefined), "visual-prosemirror");
  assert.equal(resolveVisualEditorMode("visual-prosemirror"), "visual-prosemirror");
  assert.equal(resolveVisualEditorMode("legacy-preview"), "legacy-preview");
  assert.equal(resolveVisualEditorMode("unknown"), "visual-prosemirror");
  assert.equal(
    shouldUseVisualEditor({
      mode: "visual-prosemirror",
      viewMode: "preview",
      privateModeActive: false,
      privacyMask: false,
    }),
    true,
  );
  assert.equal(
    shouldUseVisualEditor({
      mode: "visual-prosemirror",
      viewMode: "edit",
      privateModeActive: false,
      privacyMask: false,
    }),
    false,
  );
  assert.equal(
    shouldUseVisualEditor({
      mode: "visual-prosemirror",
      viewMode: "preview",
      privateModeActive: true,
      privacyMask: false,
    }),
    false,
  );
});

test("visual editor session loads notes and forwards user markdown without owning App save state", async () => {
  const adapter = createFakeAdapter();
  const changes: string[] = [];
  const session = createVisualEditorSession(adapter, (markdown) => changes.push(markdown));

  await session.loadNote("default:note.md", "# 初始");
  assert.deepEqual(session.getState(), {
    noteKey: "default:note.md",
    markdown: "# 初始",
    selection: { from: 1, to: 1 },
  });
  assert.equal(adapter.loadedMarkdown, "# 初始");

  adapter.emitMarkdown("# 已编辑");
  assert.deepEqual(changes, ["# 已编辑"]);
  assert.equal(session.getMarkdown(), "# 已编辑");

  session.focus();
  assert.equal(adapter.focusCount, 1);
  session.destroy();
  adapter.emitMarkdown("# 销毁后不应回调");
  assert.deepEqual(changes, ["# 已编辑"]);
});

test("visual editor session rejects stale loading callbacks and reloads a different note", async () => {
  const adapter = createFakeAdapter();
  const changes: string[] = [];
  const session = createVisualEditorSession(adapter, (markdown) => changes.push(markdown));

  await session.loadNote("default:first.md", "first");
  await session.loadNote("inbox:second.md", "second");
  adapter.emitMarkdown("second edited");

  assert.equal(session.getState().noteKey, "inbox:second.md");
  assert.equal(session.getMarkdown(), "second edited");
  assert.deepEqual(changes, ["second edited"]);
});

test("leaving a note flushes edits before the debounced listener, without marking unchanged content dirty", async () => {
  const adapter = createFakeAdapter();
  const changes: string[] = [];
  const session = createVisualEditorSession(adapter, markdown => changes.push(markdown));
  session.flushPendingChanges();
  await session.loadNote("default:first.md", "original");
  session.flushPendingChanges();
  assert.deepEqual(changes, []);
  adapter.replaceSelection("last keystroke");
  assert.equal(session.getMarkdown(), "original");
  session.flushPendingChanges();
  assert.equal(session.getMarkdown(), "last keystroke");
  assert.deepEqual(changes, ["last keystroke"]);
  session.flushPendingChanges();
  assert.deepEqual(changes, ["last keystroke"]);
  session.destroy();
  adapter.replaceSelection("after destroy");
  session.flushPendingChanges();
  assert.deepEqual(changes, ["last keystroke"]);
});
