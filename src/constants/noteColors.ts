/** 笔记颜色标签 ID（持久化于 .mknote-note-colors.json） */
export const NOTE_COLOR_IDS = ["重要", "紧急", "存档", "待办", "隐私"] as const;

export type NoteColorId = (typeof NOTE_COLOR_IDS)[number];

export type NoteColorDef = {
  id: NoteColorId;
  /** 固定色值（标签圆点不随当前主题变化） */
  hex: string;
  defaultLabel: string;
};

export type CustomTagDef = {
  id: string;
  name: string;
  hex: string;
};

/** 重要 = 金色；其余取项目主题 accent 色，无强制语义对应 */
export const NOTE_COLORS: readonly NoteColorDef[] = [
  { id: "重要", hex: "#b8860b", defaultLabel: "重要" },
  { id: "紧急", hex: "#c0392b", defaultLabel: "紧急" },
  { id: "存档", hex: "#475569", defaultLabel: "存档" },
  { id: "待办", hex: "#0ea5e9", defaultLabel: "待办" },
  { id: "隐私", hex: "#8839ef", defaultLabel: "隐私" },
] as const;

const HEX_BY_ID = new Map(NOTE_COLORS.map((c) => [c.id, c.hex]));

export function isCustomTagId(value: string): boolean {
  return value.startsWith("custom:");
}

export function noteColorHex(
  color: string | null | undefined,
  customTags?: readonly CustomTagDef[] | null,
): string | undefined {
  if (!color) return undefined;
  const builtIn = HEX_BY_ID.get(color as NoteColorId);
  if (builtIn) return builtIn;
  return customTags?.find((tag) => tag.id === color)?.hex;
}

export function noteColorLabel(
  id: string,
  labels?: Partial<Record<string, string>> | null,
  customTags?: readonly CustomTagDef[] | null,
): string {
  const custom = customTags?.find((tag) => tag.id === id);
  if (custom) return custom.name;
  const renamed = labels?.[id]?.trim();
  if (renamed) return renamed;
  return NOTE_COLORS.find((c) => c.id === id)?.defaultLabel || id;
}

export function isNoteColorId(value: string): value is NoteColorId {
  return (NOTE_COLOR_IDS as readonly string[]).includes(value);
}

/** 标签圆点 hover 文案，已设标签时为【重要】等形式 */
export function noteColorTooltip(
  color: string | null | undefined,
  labels?: Partial<Record<string, string>> | null,
  customTags?: readonly CustomTagDef[] | null,
): string {
  if (!color) return "设置颜色标签";
  const label = noteColorLabel(color, labels, customTags);
  return `【${label}】`;
}

export function normalizeHexInput(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  return trimmed.startsWith("#") ? trimmed : `#${trimmed}`;
}

export function isValidHexColor(raw: string): boolean {
  const value = normalizeHexInput(raw);
  return /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/.test(value);
}
