import { createElement, type ReactNode } from "react";
import { QUICK_TODO_TAGS, toggleQuickTodoTag, type QuickTodoTagDefinition } from "../utils/quickTodoTags.ts";
import type { QuickTodoTag } from "../utils/quickTodoModel.ts";

interface QuickTodoTagPickerBaseProps {
  value: QuickTodoTag | null;
  onChange(value: QuickTodoTag | null): void;
  renderIcon(definition: QuickTodoTagDefinition): ReactNode;
}

export function QuickTodoTagPickerBase({ value, onChange, renderIcon }: QuickTodoTagPickerBaseProps) {
  return createElement("div", { className: "quick-todo-tag-picker", role: "radiogroup", "aria-label": "待办标签" },
    ...QUICK_TODO_TAGS.map((definition) => createElement("button", {
      key: definition.id,
      type: "button",
      className: `quick-todo-tag-${definition.id}`,
      role: "radio",
      "aria-checked": value === definition.id,
      "aria-label": definition.label,
      title: definition.label,
      onClick: () => onChange(toggleQuickTodoTag(value, definition.id)),
    }, renderIcon(definition))),
  );
}
