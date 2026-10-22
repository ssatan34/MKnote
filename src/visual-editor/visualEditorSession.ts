import type { VisualImageInput } from "./visualEditorImage.ts";

export interface VisualEditorSelection {
  from: number;
  to: number;
}

export type VisualEditorCommand =
  | "bold"
  | "italic"
  | "strikethrough"
  | "underline"
  | "highlight"
  | "heading-1"
  | "heading-2"
  | "heading-3"
  | "bullet-list"
  | "ordered-list"
  | "blockquote"
  | "inline-code"
  | "code-block"
  | "task"
  | "task-done"
  | "indent"
  | "outdent"
  | "case-transform"
  | "clear-format"
  | "link"
  | "insert-divider"
  | "insert-table"
  | "add-table-row"
  | "add-table-column"
  | "delete-table-row"
  | "delete-table-column"
  | "align-table-left"
  | "align-table-center"
  | "align-table-right"
  | { type: "insert-image"; image: VisualImageInput };

export interface VisualEditorAdapter {
  loadMarkdown(markdown: string): Promise<void>;
  getMarkdown(): string;
  focus(): void;
  getSelection(): VisualEditorSelection;
  replaceSelection(text: string): void;
  findNext(query: string): boolean;
  replaceCurrent(text: string): boolean;
  replaceAll(query: string, replacement: string): number;
  executeCommand(command: VisualEditorCommand): boolean;
  undo(): boolean;
  redo(): boolean;
  subscribe(listener: (markdown: string) => void): () => void;
  destroy(): void;
}

export interface VisualEditorSessionState {
  noteKey: string | null;
  markdown: string;
  selection: VisualEditorSelection | null;
}

export interface VisualEditorSession {
  loadNote(noteKey: string, markdown: string): Promise<void>;
  getMarkdown(): string;
  flushPendingChanges(): void;
  getState(): VisualEditorSessionState;
  focus(): void;
  findNext(query: string): boolean;
  replaceCurrent(text: string): boolean;
  replaceAll(query: string, replacement: string): number;
  executeCommand(command: VisualEditorCommand): boolean;
  destroy(): void;
}

export type VisualEditorCommandSurface = Pick<VisualEditorSession, "executeCommand" | "flushPendingChanges">;

export function createVisualEditorSession(
  adapter: VisualEditorAdapter,
  onMarkdownChange: (markdown: string) => void,
): VisualEditorSession {
  let state: VisualEditorSessionState = {
    noteKey: null,
    markdown: "",
    selection: null,
  };
  let loading = false;
  let destroyed = false;
  let loadQueue = Promise.resolve();

  const unsubscribe = adapter.subscribe((markdown) => {
    if (destroyed || loading) return;
    state = {
      ...state,
      markdown,
      selection: adapter.getSelection(),
    };
    onMarkdownChange(markdown);
  });

  return {
    loadNote(noteKey, markdown) {
      const operation = loadQueue.then(async () => {
        if (destroyed) throw new Error("VisualEditorSession 已销毁");
        loading = true;
        state = { noteKey, markdown, selection: null };
        try {
          await adapter.loadMarkdown(markdown);
          if (!destroyed) {
            state = {
              noteKey,
              markdown: adapter.getMarkdown(),
              selection: adapter.getSelection(),
            };
          }
        } finally {
          loading = false;
        }
      });
      // 队列本身不能因一次加载失败而阻塞后续笔记切换；调用方仍会收到本次 operation 的错误。
      loadQueue = operation.catch(() => undefined);
      return operation;
    },
    getMarkdown() {
      return state.markdown;
    },
    flushPendingChanges() {
      if (destroyed || loading || state.noteKey === null) return;
      const markdown = adapter.getMarkdown();
      if (markdown === state.markdown) return;
      state = { ...state, markdown, selection: adapter.getSelection() };
      onMarkdownChange(markdown);
    },
    getState() {
      return { ...state };
    },
    focus() {
      if (!destroyed) adapter.focus();
    },
    findNext(query) {
      if (destroyed) return false;
      const found = adapter.findNext(query);
      if (found) adapter.focus();
      return found;
    },
    replaceCurrent(text) {
      if (destroyed) return false;
      const replaced = adapter.replaceCurrent(text);
      if (replaced) adapter.focus();
      return replaced;
    },
    replaceAll(query, replacement) {
      if (destroyed) return 0;
      const replaced = adapter.replaceAll(query, replacement);
      if (replaced > 0) adapter.focus();
      return replaced;
    },
    executeCommand(command) {
      if (destroyed) return false;
      const executed = adapter.executeCommand(command);
      if (executed) adapter.focus();
      return executed;
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      unsubscribe();
      adapter.destroy();
    },
  };
}
