import { useState } from "react";
import {
  NOTE_COLORS,
  isValidHexColor,
  normalizeHexInput,
  noteColorHex,
  noteColorTooltip,
  type CustomTagDef,
} from "../constants/noteColors";
import { Icon } from "./Icon";

type ColorTagPickerProps = {
  value: string | null;
  onChange: (color: string | null) => void;
  layout?: "popover" | "inline" | "horizontal";
  showClear?: boolean;
  showPresets?: boolean;
  showCustomTags?: boolean;
  /** 再次点击已选颜色时是否清除（筛选场景可开，赋色场景默认关） */
  allowDeselect?: boolean;
  colorLabels?: Partial<Record<string, string>> | null;
  customTags?: readonly CustomTagDef[] | null;
  onAddCustomTag?: (name: string, hex: string) => void | Promise<void>;
  className?: string;
};

export function ColorTagPicker({
  value,
  onChange,
  layout = "popover",
  showClear = true,
  showPresets = true,
  showCustomTags = true,
  allowDeselect = false,
  colorLabels = null,
  customTags = null,
  onAddCustomTag,
  className = "",
}: ColorTagPickerProps) {
  const [adding, setAdding] = useState(false);
  const [draftName, setDraftName] = useState("");
  const [draftHex, setDraftHex] = useState("#7C3AED");
  const [addError, setAddError] = useState<string | null>(null);

  const rootClass =
    layout === "inline"
      ? `color-tag-picker color-tag-picker-inline ${className}`.trim()
      : layout === "horizontal"
        ? `color-tag-picker color-tag-picker-horizontal ${className}`.trim()
        : `color-tag-picker color-tag-picker-popover ${className}`.trim();

  const submitCustomTag = async () => {
    const name = draftName.trim();
    const hex = normalizeHexInput(draftHex);
    if (!name) {
      setAddError("请输入标签名称");
      return;
    }
    if (!isValidHexColor(hex)) {
      setAddError("颜色代码格式应为 #RGB 或 #RRGGBB");
      return;
    }
    setAddError(null);
    try {
      await onAddCustomTag?.(name, hex);
      setDraftName("");
      setDraftHex("#7C3AED");
      setAdding(false);
    } catch (e) {
      setAddError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div className={rootClass} role="group" aria-label="颜色标签">
      {showPresets &&
        NOTE_COLORS.map((color) => (
          <button
            key={color.id}
            type="button"
            aria-pressed={value === color.id}
            className={`note-color-swatch${value === color.id ? " selected" : ""}`}
            style={{ backgroundColor: color.hex }}
            title={noteColorTooltip(color.id, colorLabels, customTags)}
            onClick={() =>
              onChange(value === color.id && allowDeselect ? null : color.id)
            }
          />
        ))}
      {showCustomTags &&
        customTags?.map((tag) => (
          <button
            key={tag.id}
            type="button"
            aria-pressed={value === tag.id}
            className={`note-color-swatch${value === tag.id ? " selected" : ""}`}
            style={{ backgroundColor: tag.hex }}
            title={noteColorTooltip(tag.id, colorLabels, customTags)}
            onClick={() =>
              onChange(value === tag.id && allowDeselect ? null : tag.id)
            }
          />
        ))}
      {showClear && (
        <button
          type="button"
          className="note-color-clear"
          title="清除颜色标签"
          onClick={() => onChange(null)}
        >
          <Icon name="clear" size={14} />
        </button>
      )}
      {onAddCustomTag && (
        <div className="color-tag-custom">
          {!adding ? (
            <button
              type="button"
              className="color-tag-add-btn"
              title="添加自定义标签"
              onClick={() => setAdding(true)}
            >
              +
            </button>
          ) : (
            <div className="color-tag-add-form">
              <input
                type="text"
                maxLength={12}
                placeholder="标签名"
                value={draftName}
                autoFocus
                onChange={(e) => setDraftName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void submitCustomTag();
                  if (e.key === "Escape") {
                    setAdding(false);
                    setAddError(null);
                  }
                }}
              />
              <input
                type="text"
                maxLength={7}
                placeholder="#RRGGBB"
                value={draftHex}
                onChange={(e) => setDraftHex(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void submitCustomTag();
                  if (e.key === "Escape") {
                    setAdding(false);
                    setAddError(null);
                  }
                }}
              />
              <button type="button" className="color-tag-add-submit" onClick={() => void submitCustomTag()}>
                添加
              </button>
              {addError && <span className="color-tag-add-error">{addError}</span>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function ColorTagSwatch({
  color,
  empty = false,
  className = "",
  customTags = null,
}: {
  color: string | null | undefined;
  empty?: boolean;
  customTags?: readonly CustomTagDef[] | null;
  className?: string;
}) {
  const hex = noteColorHex(color, customTags);
  const isEmpty = empty || !hex;
  return (
    <span
      className={`note-color-swatch${isEmpty ? " empty" : ""} ${className}`.trim()}
      style={hex ? { backgroundColor: hex } : undefined}
    />
  );
}
