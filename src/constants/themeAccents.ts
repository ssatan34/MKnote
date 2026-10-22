import type { ThemeMode, ThemeStyle } from "../types";

/** 各主题 accent（与 tokens.css 中 --mk-primary 一致） */
const LIGHT: Record<ThemeStyle, string> = {
  mknote: "#475569",
  catppuccin: "#8839ef",
  hermes: "#b8860b",
  poseidon: "#0ea5e9",
  ares: "#c0392b",
  nous: "#0053fd",
  midnight: "#6f64c7",
  ember: "#c35e1d",
  mono: "#555555",
  slate: "#2f81d1",
  "captain-log": "#d99a45",
};

const DARK: Record<ThemeStyle, string> = {
  mknote: "#94a3b8",
  catppuccin: "#cba6f7",
  hermes: "#ffd700",
  poseidon: "#38bdf8",
  ares: "#ff4444",
  nous: "#ffe6cb",
  midnight: "#8b80e8",
  ember: "#d97316",
  mono: "#9a9a9a",
  slate: "#58a6ff",
  "captain-log": "#e7a84f",
};

export function themeAccentColor(style: ThemeStyle, mode: ThemeMode): string {
  const palette = mode === "dark" ? DARK : LIGHT;
  return palette[style] ?? palette.mknote;
}

export function isDarkAppearance(mode: ThemeMode): boolean {
  if (mode === "dark") return true;
  if (mode === "light") return false;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

/** 将「跟随系统」解析为实际明暗，供 data-theme 与 [data-theme="dark"] 样式一致 */
export function resolveEffectiveThemeMode(mode: ThemeMode): "light" | "dark" {
  if (mode === "dark") return "dark";
  if (mode === "light") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}
