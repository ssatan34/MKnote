import type { NoteZone } from "../types";

/** 文件夹选择始终回到该文件夹的完整笔记列表。 */
export function getFolderSelection(zone: NoteZone): { zone: NoteZone; color: null } {
  return { zone, color: null };
}

/** 标签筛选展示的是全库结果，不保留任何文件夹的选中视觉。 */
export function isFolderSelectionActive(activeColor: string | null): boolean {
  return activeColor === null;
}
