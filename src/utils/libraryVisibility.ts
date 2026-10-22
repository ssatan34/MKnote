import type { NoteSummary } from "../types";

const HIDDEN_LIBRARY_NOTE_NAMES = new Set(["Quick Todo.md", "Quick Pocket.md"]);

/** 系统快捷笔记保留在磁盘中供对应独立窗口使用，但不应出现在资料库。 */
export function filterLibraryNotes<T extends Pick<NoteSummary, "name">>(notes: T[]): T[] {
  return notes.filter((note) => !HIDDEN_LIBRARY_NOTE_NAMES.has(note.name));
}
