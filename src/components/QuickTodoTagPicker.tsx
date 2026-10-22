import { Icon } from "./Icon";
import { QuickTodoTagPickerBase } from "./QuickTodoTagPickerBase";
import type { QuickTodoTag } from "../utils/quickTodoModel";

interface QuickTodoTagPickerProps {
  value: QuickTodoTag | null;
  onChange(value: QuickTodoTag | null): void;
}

export function QuickTodoTagPicker({ value, onChange }: QuickTodoTagPickerProps) {
  return <QuickTodoTagPickerBase value={value} onChange={onChange} renderIcon={(definition) => <Icon name={definition.icon} size={16} />} />;
}
