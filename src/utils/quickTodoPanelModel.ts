import type { QuickTodoItem } from "./quickTodoModel.ts";
import type { QuickTodoTag } from "./quickTodoModel.ts";

export type QuickTodoKeyAction = "submit" | "close" | null;
export type QuickTodoViewMode = "active" | "completed";

export function flattenQuickTodoItems(items: QuickTodoItem[]): QuickTodoItem[] {
  const itemIds = new Set(items.map((item) => item.id));
  const childrenByParent = new Map<string, QuickTodoItem[]>();
  for (const item of items) {
    if (item.parentId && itemIds.has(item.parentId)) {
      const children = childrenByParent.get(item.parentId) ?? [];
      children.push(item);
      childrenByParent.set(item.parentId, children);
    }
  }
  const result: QuickTodoItem[] = [];
  for (const item of items) {
    if (item.parentId && itemIds.has(item.parentId)) continue;
    result.push(item, ...(childrenByParent.get(item.id) ?? []));
  }
  return result;
}

export function getQuickTodoSiblingItems(items: QuickTodoItem[], draggedId: string, completedView: boolean): QuickTodoItem[] {
  const dragged = items.find((item) => item.id === draggedId);
  const parentId = dragged?.parentId ?? null;
  return items.filter((item) => item.completed === completedView && (item.parentId ?? null) === parentId);
}

export function mergeQuickTodoParentOrder(
  items: QuickTodoItem[],
  viewMode: QuickTodoViewMode,
  parentId: string | null,
  visibleIds: string[],
): string[] {
  const completedView = viewMode === "completed";
  let visibleIndex = 0;
  return items.map((item) => (
    item.completed === completedView && (item.parentId ?? null) === parentId ? visibleIds[visibleIndex++] : item.id
  ));
}

export function mergeQuickTodoViewOrder(
  items: QuickTodoItem[],
  viewMode: QuickTodoViewMode,
  visibleIds: string[],
): string[] {
  const completedView = viewMode === "completed";
  let visibleIndex = 0;
  return items.map((item) => (
    item.completed === completedView ? visibleIds[visibleIndex++] : item.id
  ));
}

interface QuickTodoEscapeEvent {
  key: string;
  preventDefault(): void;
  stopPropagation(): void;
}

export function createQuickTodoEscapeHandler(
  close: () => void,
  isPickerOpen: () => boolean = () => false,
  closePicker: () => void = () => undefined,
) {
  return (event: QuickTodoEscapeEvent): void => {
    if (event.key !== "Escape") return;
    event.preventDefault();
    event.stopPropagation();
    if (isPickerOpen()) closePicker();
    else close();
  };
}

export function handleQuickTodoKey(key: string): QuickTodoKeyAction {
  if (key === "Enter") return "submit";
  if (key === "Escape") return "close";
  return null;
}

export function moveQuickTodoItem(
  items: QuickTodoItem[],
  draggedId: string,
  targetIndex: number,
): QuickTodoItem[] {
  const movedItems = [...items];
  const draggedIndex = movedItems.findIndex((item) => item.id === draggedId);
  if (draggedIndex < 0) return movedItems;

  const [draggedItem] = movedItems.splice(draggedIndex, 1);
  const normalizedTargetIndex = Math.max(0, Math.min(targetIndex, movedItems.length));
  movedItems.splice(normalizedTargetIndex, 0, draggedItem);
  return movedItems;
}

export interface QuickTodoDragState {
  draggedId: string;
  parentId: string | null;
  originalItems: QuickTodoItem[];
  previewItems: QuickTodoItem[];
}

export function beginQuickTodoDrag(items: QuickTodoItem[], draggedId: string): QuickTodoDragState | null {
  const dragged = items.find((item) => item.id === draggedId);
  if (!dragged) return null;
  return { draggedId, parentId: dragged.parentId ?? null, originalItems: items, previewItems: items };
}

export function moveQuickTodoDrag(state: QuickTodoDragState, targetIndex: number): QuickTodoDragState {
  return { ...state, previewItems: moveQuickTodoItem(state.originalItems, state.draggedId, targetIndex) };
}

export function getQuickTodoInsertionMarker(state: QuickTodoDragState): { id: string; edge: "before" | "after" } {
  const draggedIndex = state.previewItems.findIndex((item) => item.id === state.draggedId);
  return {
    id: state.draggedId,
    edge: draggedIndex === state.previewItems.length - 1 ? "after" : "before",
  };
}

export function getQuickTodoInsertionMarkerForTarget(
  items: QuickTodoItem[],
  draggedId: string,
  targetIndex: number,
): { id: string; edge: "before" | "after" } | null {
  const remaining = items.filter((item) => item.id !== draggedId);
  if (remaining.length === 0) return null;
  if (targetIndex >= remaining.length) return { id: remaining[remaining.length - 1].id, edge: "after" };
  return { id: remaining[Math.max(0, targetIndex)].id, edge: "before" };
}

export function cancelQuickTodoDrag(_state: QuickTodoDragState, latestItems: QuickTodoItem[]): QuickTodoItem[] {
  return latestItems;
}

export function isQuickTodoInteractionLocked(state: QuickTodoDragState | null, reorderPending: boolean): boolean {
  return state !== null || reorderPending;
}

export async function finishQuickTodoDrag(
  state: QuickTodoDragState,
  latestItems: () => QuickTodoItem[],
  reorder: (ids: string[]) => Promise<QuickTodoItem[] | void>,
): Promise<{ items: QuickTodoItem[]; error: string | null; submitted: boolean }> {
  const nextIds = state.previewItems.map((item) => item.id);
  const originalIds = state.originalItems.map((item) => item.id);
  if (nextIds.every((id, index) => id === originalIds[index])) {
    return { items: latestItems(), error: null, submitted: false };
  }
  try {
    const persistedItems = await reorder(nextIds);
    return { items: persistedItems ?? latestItems(), error: null, submitted: true };
  } catch (error) {
    return {
      items: latestItems(),
      error: error instanceof Error ? error.message : String(error),
      submitted: true,
    };
  }
}

export async function submitQuickTodoDraft(
  draft: string,
  tag: QuickTodoTag | null,
  add: (text: string, tag: QuickTodoTag | null) => Promise<unknown> | unknown,
): Promise<{ draft: string; tag: QuickTodoTag | null; submitted: boolean }> {
  if (!draft.trim()) return { draft, tag, submitted: false };
  await add(draft, tag);
  return { draft: "", tag: null, submitted: true };
}

export async function submitQuickTodoEdit(
  text: string,
  edit: (text: string) => Promise<unknown> | unknown,
): Promise<{ text: string; submitted: boolean }> {
  const trimmed = text.trim();
  if (!trimmed) return { text, submitted: false };
  await edit(trimmed);
  return { text: "", submitted: true };
}

export async function runQuickTodoListAction(
  current: QuickTodoItem[],
  action: () => Promise<QuickTodoItem[]>,
): Promise<{ items: QuickTodoItem[]; error: string | null }> {
  try {
    return { items: await action(), error: null };
  } catch (error) {
    return { items: current, error: error instanceof Error ? error.message : String(error) };
  }
}
