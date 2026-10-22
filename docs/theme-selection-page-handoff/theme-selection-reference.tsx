import type { CSSProperties } from "react";

export type ThemeMode = "system" | "light" | "dark";

export type ThemeStyle =
  | "mknote"
  | "catppuccin"
  | "hermes"
  | "poseidon"
  | "ares"
  | "nous"
  | "midnight"
  | "ember"
  | "mono"
  | "slate"
  | "captain-log";

type ThemePalette = {
  canvas: string;
  surface: string;
  primary: string;
  auxiliary: string;
};

export const THEME_MODES: Array<{ value: ThemeMode; label: string }> = [
  { value: "system", label: "Follow System" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];

export const THEME_STYLES: Array<{ value: ThemeStyle; label: string }> = [
  { value: "mknote", label: "MKnote" },
  { value: "catppuccin", label: "Catppuccin" },
  { value: "hermes", label: "Hermes" },
  { value: "poseidon", label: "Poseidon" },
  { value: "ares", label: "Ares" },
  { value: "nous", label: "Nous" },
  { value: "midnight", label: "Midnight" },
  { value: "ember", label: "Ember" },
  { value: "mono", label: "Mono" },
  { value: "slate", label: "Slate" },
  { value: "captain-log", label: "GBF" },
];

export const THEME_PREVIEW_COLORS: Record<
  ThemeStyle,
  { light: ThemePalette; dark: ThemePalette }
> = {
  mknote: {
    light: { canvas: "#fefcf7", surface: "#f1f5f9", primary: "#475569", auxiliary: "#64748b" },
    dark: { canvas: "#0d0d1a", surface: "#1c1c32", primary: "#94a3b8", auxiliary: "#cbd5e1" },
  },
  catppuccin: {
    light: { canvas: "#eff1f5", surface: "#dce0e8", primary: "#8839ef", auxiliary: "#7287fd" },
    dark: { canvas: "#1e1e2e", surface: "#313244", primary: "#cba6f7", auxiliary: "#b4befe" },
  },
  hermes: {
    light: { canvas: "#fefcf7", surface: "#f5f0e6", primary: "#b8860b", auxiliary: "#c9a227" },
    dark: { canvas: "#0d0d1a", surface: "#1c1c32", primary: "#ffd700", auxiliary: "#ffe566" },
  },
  poseidon: {
    light: { canvas: "#f0f9ff", surface: "#dbeafe", primary: "#0ea5e9", auxiliary: "#0284c7" },
    dark: { canvas: "#0d0d1a", surface: "#1c1c32", primary: "#0ea5e9", auxiliary: "#38bdf8" },
  },
  ares: {
    light: { canvas: "#fefcf7", surface: "#f8eceb", primary: "#c0392b", auxiliary: "#d9776a" },
    dark: { canvas: "#0d0d1a", surface: "#1c1c32", primary: "#ff4444", auxiliary: "#ff6666" },
  },
  nous: {
    light: { canvas: "#f8faff", surface: "#f1f5ff", primary: "#0053fd", auxiliary: "#4d7fff" },
    dark: { canvas: "#0d2f86", surface: "#12378f", primary: "#ffe6cb", auxiliary: "#8fb0ff" },
  },
  midnight: {
    light: { canvas: "#f5f4ff", surface: "#e8e5fb", primary: "#6f64c7", auxiliary: "#9189dc" },
    dark: { canvas: "#08081c", surface: "#0d0d28", primary: "#8b80e8", auxiliary: "#b0a9ff" },
  },
  ember: {
    light: { canvas: "#fff7f1", surface: "#f2dfd0", primary: "#c35e1d", auxiliary: "#d9915d" },
    dark: { canvas: "#160800", surface: "#1e0e04", primary: "#d97316", auxiliary: "#f0a04e" },
  },
  mono: {
    light: { canvas: "#f5f5f5", surface: "#e6e6e6", primary: "#555555", auxiliary: "#888888" },
    dark: { canvas: "#0e0e0e", surface: "#141414", primary: "#9a9a9a", auxiliary: "#c2c2c2" },
  },
  slate: {
    light: { canvas: "#f3f6fa", surface: "#e7edf4", primary: "#2f81d1", auxiliary: "#58a6ff" },
    dark: { canvas: "#0d1117", surface: "#161b22", primary: "#58a6ff", auxiliary: "#8abfff" },
  },
  "captain-log": {
    light: { canvas: "#06111c", surface: "#0b1c2b", primary: "#d99a45", auxiliary: "#4d9ee8" },
    dark: { canvas: "#020912", surface: "#071522", primary: "#e7a84f", auxiliary: "#4da7ff" },
  },
};

// 这是源实现中底部“当前主题”文字使用的 accent；它和卡片 preview primary 是两个角色。
export const THEME_STATUS_ACCENTS: Record<ThemeStyle, { light: string; dark: string }> = {
  mknote: { light: "#475569", dark: "#94a3b8" },
  catppuccin: { light: "#8839ef", dark: "#cba6f7" },
  hermes: { light: "#b8860b", dark: "#ffd700" },
  poseidon: { light: "#0ea5e9", dark: "#38bdf8" },
  ares: { light: "#c0392b", dark: "#ff4444" },
  nous: { light: "#0053fd", dark: "#ffe6cb" },
  midnight: { light: "#6f64c7", dark: "#8b80e8" },
  ember: { light: "#c35e1d", dark: "#d97316" },
  mono: { light: "#555555", dark: "#9a9a9a" },
  slate: { light: "#2f81d1", dark: "#58a6ff" },
  "captain-log": { light: "#d99a45", dark: "#e7a84f" },
};

export interface ThemeSelectionPageProps {
  mode: ThemeMode;
  selectedTheme: ThemeStyle;
  onModeChange: (mode: ThemeMode) => void;
  onThemeChange: (theme: ThemeStyle) => void;
  className?: string;
}

function isDarkAppearance(mode: ThemeMode): boolean {
  if (mode === "dark") return true;
  if (mode === "light") return false;
  return typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function ThemeModePicker({
  value,
  onChange,
}: {
  value: ThemeMode;
  onChange: (mode: ThemeMode) => void;
}) {
  return (
    <fieldset className="theme-mode-selector">
      <legend>显示模式</legend>
      <div className="theme-mode-options">
        {THEME_MODES.map((item) => (
          <label key={item.value} className="theme-mode-option">
            <input
              type="radio"
              name="mknote-theme-mode"
              value={item.value}
              checked={value === item.value}
              onChange={() => onChange(item.value)}
            />
            <span className="theme-mode-label">
              <span className="theme-mode-state-icon" aria-hidden="true">
                {value === item.value ? "✓" : "−"}
              </span>
              {item.label}
            </span>
            <span className={`theme-mode-box theme-mode-box--${item.value}`} aria-hidden="true" />
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function ThemePreviewCard({
  theme,
  mode,
  selected,
  onSelect,
}: {
  theme: { value: ThemeStyle; label: string };
  mode: ThemeMode;
  selected: boolean;
  onSelect: (theme: ThemeStyle) => void;
}) {
  const dark = isDarkAppearance(mode);
  const colors = THEME_PREVIEW_COLORS[theme.value][dark ? "dark" : "light"];

  return (
    <button
      type="button"
      className={`theme-preview-card${selected ? " selected" : ""}`}
      aria-pressed={selected}
      aria-label={`使用${theme.label}主题`}
      style={
        {
          "--theme-preview-canvas": colors.canvas,
          "--theme-preview-surface": colors.surface,
          "--theme-preview-primary": colors.primary,
          "--theme-preview-auxiliary": colors.auxiliary,
        } as CSSProperties
      }
      onClick={() => onSelect(theme.value)}
    >
      <span className="theme-preview-label">{theme.label}</span>
      <span className="theme-preview-canvas" aria-hidden="true">
        <span className="theme-preview-surface" />
        <span className="theme-preview-lines">
          <span className="theme-preview-line theme-preview-line--primary" />
          <span className="theme-preview-line theme-preview-line--auxiliary" />
          {theme.value === "captain-log" && <span className="theme-preview-line theme-preview-line--glow" />}
        </span>
      </span>
    </button>
  );
}

export function ThemeSelectionPage({
  mode,
  selectedTheme,
  onModeChange,
  onThemeChange,
  className,
}: ThemeSelectionPageProps) {
  const currentTheme = THEME_STYLES.find((item) => item.value === selectedTheme) ?? THEME_STYLES[0]!;
  const dark = isDarkAppearance(mode);
  const statusAccent = THEME_STATUS_ACCENTS[currentTheme.value][dark ? "dark" : "light"];

  return (
    <div className={`mk-theme-selection settings-section-stack${className ? ` ${className}` : ""}`}>
      <section className="settings-card">
        <div className="settings-card-head">
          <div>
            <strong>主题</strong>
            <span>管理应用的主题样式</span>
          </div>
        </div>

        <ThemeModePicker value={mode} onChange={onModeChange} />

        <div className="theme-preview-grid" role="list" aria-label="主题选项">
          {THEME_STYLES.map((item) => (
            <ThemePreviewCard
              key={item.value}
              theme={item}
              mode={mode}
              selected={item.value === currentTheme.value}
              onSelect={onThemeChange}
            />
          ))}
        </div>

        <p className="appearance-note">
          当前：{THEME_MODES.find((item) => item.value === mode)?.label} ·{" "}
          <span style={{ color: statusAccent }}>{currentTheme.label}</span>
        </p>
      </section>
    </div>
  );
}

