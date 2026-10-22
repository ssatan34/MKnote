import assert from "node:assert/strict";
import test from "node:test";
import {
  createVisualEditorSession,
  type VisualEditorAdapter,
} from "../src/visual-editor/visualEditorSession.ts";
import { readFileSync } from "node:fs";

function deferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T | PromiseLike<T>) => void;
} {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
}

function createAsyncAdapter(): VisualEditorAdapter & {
  resolveFirstLoad: () => void;
} {
  let markdown = "";
  let selection = { from: 0, to: 0 };
  const firstLoad = deferred<void>();
  let loadCount = 0;
  const listeners = new Set<(value: string) => void>();

  return {
    async loadMarkdown(nextMarkdown) {
      loadCount += 1;
      if (loadCount === 1) await firstLoad.promise;
      markdown = nextMarkdown;
      selection = { from: 0, to: 0 };
    },
    getMarkdown: () => markdown,
    focus: () => undefined,
    getSelection: () => selection,
    replaceSelection: () => undefined,
    findNext: () => false,
    replaceCurrent: () => false,
    replaceAll: () => 0,
    executeCommand: () => false,
    undo: () => false,
    redo: () => false,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    destroy: () => listeners.clear(),
    resolveFirstLoad: () => firstLoad.resolve(),
  };
}

test("并发切换笔记时，后发的 VisualEditor load 必须成为最终状态", async () => {
  const adapter = createAsyncAdapter();
  const session = createVisualEditorSession(adapter, () => undefined);

  const firstLoad = session.loadNote("default:first", "旧笔记");
  const secondLoad = session.loadNote("default:second", "新笔记");

  adapter.resolveFirstLoad();
  await Promise.all([firstLoad, secondLoad]);

  assert.deepEqual(session.getState(), {
    noteKey: "default:second",
    markdown: "新笔记",
    selection: { from: 0, to: 0 },
  });
});

test("显式 Markdown load 后必须同步 adapter 的去重标记，避免下一次更新误判为旧内容", () => {
  const adapterSource = readFileSync("src/visual-editor/visualEditorAdapter.ts", "utf8");
  assert.match(
    adapterSource,
    /view\.updateState\(state\);\s*currentMarkdown\s*=\s*normalizeVisualTaskMarkdown\(markdown\)/,
  );
});
