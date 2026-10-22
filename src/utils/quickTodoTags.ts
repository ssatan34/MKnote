import type { IconId } from "../components/Icon";
import type { QuickTodoTag } from "./quickTodoModel";

export interface QuickTodoTagDefinition {
  id: QuickTodoTag;
  label: string;
  icon: IconId;
}

export const QUICK_TODO_TAGS: readonly QuickTodoTagDefinition[] = [
  { id: "important", label: "重要", icon: "quick_todo_important" },
  { id: "waiting", label: "等待", icon: "quick_todo_waiting" },
  { id: "next", label: "下一步", icon: "quick_todo_next" },
  { id: "idea", label: "想法", icon: "quick_todo_idea" },
  { id: "urgent", label: "紧急", icon: "quick_todo_urgent" },
  { id: "important_urgent", label: "重要紧急", icon: "quick_todo_important_urgent" },
];

export function toggleQuickTodoTag(
  current: QuickTodoTag | null,
  selected: QuickTodoTag,
): QuickTodoTag | null {
  return current === selected ? null : selected;
}

export function quickTodoTagControlLabel(tag: QuickTodoTag | null): string {
  if (tag === null) return "添加标签";
  const definition = QUICK_TODO_TAGS.find((entry) => entry.id === tag);
  return `标签：${definition?.label ?? "未知"}`;
}
