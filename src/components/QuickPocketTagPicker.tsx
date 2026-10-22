import { Icon, type IconId } from "./Icon";
import { QUICK_POCKET_TAGS, type QuickPocketTag } from "../utils/quickPocketModel";

const TAG_ICON: Record<QuickPocketTag, IconId> = {
  text: "edit2",
  command: "run_script2",
  path: "pick_folder2",
  private: "quick_lock_closed2",
};

interface QuickPocketTagPickerProps {
  value: QuickPocketTag | null;
  onChange(value: QuickPocketTag): void;
}

export function QuickPocketTagPicker({ value, onChange }: QuickPocketTagPickerProps) {
  return <div className="quick-pocket-tag-picker-popover" role="radiogroup" aria-label="便签标签">
    {QUICK_POCKET_TAGS.map((tag) => <button key={tag.id} type="button" className={`tag-${tag.id}`} role="radio" aria-checked={value === tag.id} title={tag.label} aria-label={tag.label} onClick={() => onChange(tag.id)}><Icon name={TAG_ICON[tag.id]} size={16} /></button>)}
  </div>;
}
