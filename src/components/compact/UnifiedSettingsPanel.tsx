import { AiSettingsPanel } from "../AiSettingsPanel";
import { useEffect, useState, type CSSProperties } from "react";
import type {
  AiConfig,
  AppConfig,
  CustomTagDef,
  GlobalHotkeys,
  ImageHostConfigPatch,
  LskyCleanupDeleteResult,
  LskyCleanupReport,
  SiyuanNotebookSummary,
  ThemeMode,
  ThemeStyle,
} from "../../types";
import { NOTE_COLORS, noteColorLabel } from "../../constants/noteColors";
import { themeAccentColor, isDarkAppearance } from "../../constants/themeAccents";
import { ColorTagSwatch } from "../ColorTagPicker";
import { CustomTagsManager } from "../CustomTagsManager";
import { HotkeyPanel } from "../HotkeyPanel";
import { Icon } from "../Icon";
import { AnimatedCheckbox } from "../AnimatedCheckbox";
import { MessageHubSettingsPanel } from "../MessageHubSettingsPanel";
import { NoteUploadSettingsPanel } from "../NoteUploadSettingsPanel";
import type { NoteUploadConfigPatch } from "../../utils/noteUpload";
import { QuickPocketSettingsPanel } from "../QuickPocketSettingsPanel";
import { QuickTodoSettingsPanel } from "../QuickTodoSettingsPanel";
import { ImageHostSettingsPanel } from "../LskySettingsPanel";

type SettingsSection = "system" | "appearance" | "sync" | "ai" | "general";

export type SettingsRoute =
  | "hotkey"
  | "tabLimit"
  | "quickPockets"
  | "quickTodos"
  | "appearance"
  | "customTags"
  | "siyuan"
  | "messageHubSettings"
  | "lskySettings"
  | "ai"
  | "general";

const THEME_MODES: Array<{ value: ThemeMode; label: string }> = [
  { value: "system", label: "Follow System" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];

const THEME_STYLES: Array<{ value: ThemeStyle; label: string }> = [
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

const THEME_PREVIEW_COLORS: Record<ThemeStyle, {
  light: { canvas: string; surface: string; primary: string; auxiliary: string };
  dark: { canvas: string; surface: string; primary: string; auxiliary: string };
}> = {
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

function resolveThemeStyle(config: AppConfig): ThemeStyle {
  const light = (config.light_theme ?? "mknote") as ThemeStyle;
  const dark = (config.dark_theme ?? "mknote") as ThemeStyle;
  const accent = (config.accent_skin ?? "mknote") as ThemeStyle;
  if (light === dark && dark === accent) return light;
  return accent;
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
      style={{
        "--theme-preview-canvas": colors.canvas,
        "--theme-preview-surface": colors.surface,
        "--theme-preview-primary": colors.primary,
        "--theme-preview-auxiliary": colors.auxiliary,
      } as CSSProperties}
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

function AppearancePanel({
  config,
  onThemeChange,
  onThemeModeChange,
}: {
  config: AppConfig;
  onThemeChange: (theme: ThemeStyle) => void;
  onThemeModeChange: (mode: ThemeMode) => void;
}) {
    const mode = (config.theme_mode ?? "system") as ThemeMode;
  const theme = resolveThemeStyle(config);

  return (
    <div className="settings-section-stack">
      <section className="settings-card">
        <div className="settings-card-head">
          <div>
            <strong>主题</strong>
            <span>管理应用的主题样式</span>
          </div>
        </div>

        <ThemeModePicker value={mode} onChange={onThemeModeChange} />

        <div className="theme-preview-grid" role="list" aria-label="主题选项">
          {THEME_STYLES.map((item) => (
            <ThemePreviewCard
              key={item.value}
              theme={item}
              mode={mode}
              selected={item.value === theme}
              onSelect={onThemeChange}
            />
          ))}
        </div>

        <p className="appearance-note">
          当前：{THEME_MODES.find((item) => item.value === mode)?.label} ·{" "}
          <span style={{ color: themeAccentColor(theme, isDarkAppearance(mode) ? "dark" : "light") }}>
            {THEME_STYLES.find((item) => item.value === theme)?.label ?? theme}
          </span>
        </p>
      </section>
    </div>
  );
}

function ColorLabelsPanel({
  config,
  onNoteColorLabelsChange,
  customTags,
  onAddCustomTag,
  onUpdateCustomTag,
  onDeleteCustomTag,
}: {
  config: AppConfig;
  onNoteColorLabelsChange: (labels: Record<string, string>) => void | Promise<void>;
  customTags: CustomTagDef[];
  onAddCustomTag?: (name: string, hex: string) => void | Promise<void>;
  onUpdateCustomTag?: (id: string, patch: { name?: string; hex?: string }) => void | Promise<void>;
  onDeleteCustomTag?: (id: string) => void | Promise<void>;
}) {
  const [labelDraft, setLabelDraft] = useState<Record<string, string>>(() => {
    const next: Record<string, string> = {};
    for (const color of NOTE_COLORS) {
      next[color.id] = noteColorLabel(color.id, config.note_color_labels);
    }
    return next;
  });

  return (
    <div className="settings-section-stack">
      <section className="settings-card">
        <div className="settings-card-head">
          <div>
            <strong>颜色标签</strong>
            <span>管理内置颜色标签的显示名称和自定义标签</span>
          </div>
        </div>
        <div className="appearance-section">
          <span className="appearance-label">内置颜色标签名称</span>
          <div className="appearance-color-labels">
            {NOTE_COLORS.map((color) => (
              <label key={color.id} className="appearance-color-label-row">
                <ColorTagSwatch color={color.id} />
                <input
                  type="text"
                  maxLength={12}
                  aria-label={`${color.defaultLabel} 显示名`}
                  value={labelDraft[color.id] ?? color.defaultLabel}
                  onChange={(e) =>
                    setLabelDraft((prev) => ({ ...prev, [color.id]: e.target.value }))
                  }
                  onBlur={() => void onNoteColorLabelsChange(labelDraft)}
                />
              </label>
            ))}
          </div>
        </div>
        {onAddCustomTag && onUpdateCustomTag && onDeleteCustomTag ? (
          <CustomTagsManager
            customTags={customTags}
            colorLabels={config.note_color_labels}
            onAddCustomTag={onAddCustomTag}
            onUpdateCustomTag={onUpdateCustomTag}
            onDeleteCustomTag={onDeleteCustomTag}
          />
        ) : null}
      </section>
    </div>
  );
}

function TabLimitPanel({
  limit,
  onChange,
}: {
  limit: number;
  onChange?: (value: number) => void | Promise<void>;
}) {
  const [draft, setDraft] = useState(() => String(limit));

  useEffect(() => {
    setDraft(String(limit));
  }, [limit]);

  const commitDraft = () => {
    const next = Number(draft);
    if (!Number.isInteger(next) || next < 1 || next > 10) {
      setDraft(String(limit));
      return;
    }
    if (next !== limit) void onChange?.(next);
  };

  return (
    <div className="settings-section-stack">
      <section className="settings-card">
        <div className="settings-card-head">
          <div>
            <strong>置顶标签数量</strong>
            <span>每次最多可以同时置顶的标签页数（1 – 10）</span>
          </div>
        </div>
        <div className="tab-limit-input-row">
          <label htmlFor="pinned-tab-limit">数量上限</label>
          <input
            id="pinned-tab-limit"
            className="tab-limit-input"
            type="number"
            min={1}
            max={10}
            step={1}
            inputMode="numeric"
            value={draft}
            aria-label="置顶标签数量上限"
            onChange={(event) => setDraft(event.target.value)}
            onBlur={commitDraft}
            onKeyDown={(event) => {
              if (event.key === "Enter") event.currentTarget.blur();
            }}
          />
          <span>个</span>
        </div>
        <p className="tab-limit-desc">
          {limit === 1
            ? "每次只能置顶 1 个标签，适合专注模式"
            : limit <= 2
              ? "默认设置，适合大多数工作场景"
              : `最多可同时置顶 ${limit} 个标签，适合多任务切换`}
        </p>
      </section>
    </div>
  );
}

interface UnifiedSettingsPanelProps {
  config: AppConfig;
  activeRoute: SettingsRoute;
  privacyMask: boolean;
  customTags: CustomTagDef[];
  onSelectRoute: (route: SettingsRoute) => void;
  onClose: () => void;
  onGlobalHotkeysSave: (hotkeys: GlobalHotkeys) => void | Promise<void>;
  onThemeStyleChange: (theme: ThemeStyle) => void;
  onThemeModeChange: (mode: ThemeMode) => void | Promise<void>;
  onNoteColorLabelsChange: (labels: Record<string, string>) => void | Promise<void>;
  onPrivacyMaskChange: (enabled: boolean) => void;
  onAddCustomTag?: (name: string, hex: string) => void | Promise<void>;
  onUpdateCustomTag?: (id: string, patch: { name?: string; hex?: string }) => void | Promise<void>;
  onDeleteCustomTag?: (id: string) => void | Promise<void>;
  onSiyuanConfigSave: (patch: { apiUrl: string; apiToken: string; notebookId: string }) => Promise<void>;
  onUploadConfigSave: (patch: NoteUploadConfigPatch) => Promise<void>;
  onSiyuanTestConnection: (apiUrl: string, apiToken: string) => Promise<SiyuanNotebookSummary[]>;
  onMessageHubSettingsSave?: (patch: {
    endpoint: string;
    bucket: string;
    objectKey: string;
    accessKey: string;
    secretKey: string;
  }) => Promise<void>;
  onMessageHubTestConnection?: (
    endpoint: string,
    bucket: string,
    objectKey: string,
    accessKey: string,
    secretKey: string,
  ) => Promise<void>;
  onSyncEnabledChange?: (enabled: boolean) => Promise<void>;
  onSyncBootstrap?: (mode: "local" | "remote") => Promise<void>;
  onSyncResolveConflicts?: (resolution: "local" | "remote") => Promise<void>;
  onLskyCleanupScan: () => Promise<LskyCleanupReport>;
  onLskyCleanupDelete: (keys: string[]) => Promise<LskyCleanupDeleteResult>;
  onCloudImgsCleanupScan: () => Promise<LskyCleanupReport>;
  onCloudImgsCleanupDelete: (keys: string[]) => Promise<LskyCleanupDeleteResult>;
  onLskyTestConnection: (url: string, email: string, password: string) => Promise<void>;
  onImageHostConfigSave: (patch: ImageHostConfigPatch) => Promise<void>;
  onCloudImgsTestConnection: (url: string, password: string, directory: string) => Promise<void>;
  onClassificationConfigSave: (settings: import("../../types").NoteClassificationConfig) => Promise<void>;
  onAiConfigSave: (patch: AiConfig) => void | Promise<void>;
  onPinnedTabLimitChange?: (limit: number) => void | Promise<void>;
  onFullscreenDodgeChange?: (enabled: boolean) => void | Promise<void>;
}

export function UnifiedSettingsPanel({
  config,
  activeRoute,
  privacyMask,
  customTags,
  onSelectRoute,
  onClose,
  onGlobalHotkeysSave,
  onThemeStyleChange,
  onThemeModeChange,
  onNoteColorLabelsChange,
  onPrivacyMaskChange,
  onAddCustomTag,
  onUpdateCustomTag,
  onDeleteCustomTag,
  onSiyuanConfigSave,
  onUploadConfigSave,
  onSiyuanTestConnection,
  onMessageHubSettingsSave,
  onMessageHubTestConnection,
  onSyncEnabledChange,
  onSyncBootstrap,
  onSyncResolveConflicts,
  onLskyCleanupScan,
  onLskyCleanupDelete,
  onCloudImgsCleanupScan,
  onCloudImgsCleanupDelete,
  onLskyTestConnection,
  onImageHostConfigSave,
  onCloudImgsTestConnection,
  onClassificationConfigSave,
  onAiConfigSave,
  onPinnedTabLimitChange,
  onFullscreenDodgeChange,
}: UnifiedSettingsPanelProps) {
  const navGroups: Array<{
    section: SettingsSection;
    routes: Array<{
      route: SettingsRoute;
      label: string;
      icon: "hotkey" | "Platte" | "highlight2" | "sync_settings" | "s3" | "ai" | "lock_closed2" | "autostart" | "pills" | "task";
    }>;
  }> = [
    { section: "general", routes: [{ route: "general", label: "基础设置", icon: "autostart" }] },
    {
      section: "system",
      routes: [
        { route: "hotkey", label: "全局快捷键", icon: "hotkey" },
        { route: "tabLimit", label: "标签页设置", icon: "lock_closed2" },
        { route: "quickPockets", label: "Quick Pocket", icon: "pills" },
        { route: "quickTodos", label: "Quick Todo", icon: "task" },
      ],
    },
    {
      section: "appearance",
      routes: [
        { route: "appearance", label: "主题", icon: "Platte" },
        { route: "customTags", label: "颜色标签", icon: "highlight2" },
      ],
    },
    {
      section: "sync",
      routes: [
        { route: "siyuan", label: "笔记上传", icon: "sync_settings" },
        { route: "messageHubSettings", label: "S3 同步", icon: "s3" },
        { route: "lskySettings", label: "图床设置", icon: "s3" },
      ],
    },
    { section: "ai", routes: [{ route: "ai", label: "AI 配置", icon: "ai" }] },
  ];

  return (
    <div className="settings-panel-overlay" data-no-drag onMouseDown={onClose}>
      <div
        className="settings-panel"
        role="dialog"
        aria-modal="true"
        aria-label="设置"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="settings-panel-body settings-panel-body--single">
          <aside className="settings-panel-nav">
            {navGroups.flatMap((group) => group.routes).map((item) => (
              <button
                key={item.route}
                type="button"
                className={`settings-nav-link${activeRoute === item.route ? " active" : ""}`}
                onClick={() => onSelectRoute(item.route)}
              >
                <Icon name={item.icon} size={15} className="settings-nav-link-icon" />
                <span>{item.label}</span>
              </button>
            ))}
          </aside>
          <section className="settings-panel-content">
            <div key={activeRoute} className="settings-route-motion">
            {activeRoute === "hotkey" ? (
              <HotkeyPanel
                embedded
                hotkeys={
                  config.global_hotkeys ?? {
                    toggle_window: "Ctrl+Shift+Alt+N",
                    focus_window: "Ctrl+Shift+Alt+M",
                    clipboard_inbox: "Alt+Shift+C",
                    quick_search: "Ctrl+P",
                    quick_capture: "",
                  }
                }
                onSave={onGlobalHotkeysSave}
              />
            ) : null}
            {activeRoute === "tabLimit" ? (
              <TabLimitPanel limit={config.pinned_tab_limit ?? 2} onChange={onPinnedTabLimitChange} />
            ) : null}
            {activeRoute === "quickPockets" ? <QuickPocketSettingsPanel /> : null}
            {activeRoute === "quickTodos" ? <QuickTodoSettingsPanel /> : null}
            {activeRoute === "appearance" ? (
              <AppearancePanel
                config={config}
                onThemeChange={onThemeStyleChange}
                onThemeModeChange={onThemeModeChange}
              />
            ) : null}
            {activeRoute === "customTags" ? (
              <ColorLabelsPanel
                config={config}
                onNoteColorLabelsChange={onNoteColorLabelsChange}
                customTags={customTags}
                onAddCustomTag={onAddCustomTag}
                onUpdateCustomTag={onUpdateCustomTag}
                onDeleteCustomTag={onDeleteCustomTag}
              />
            ) : null}
            {activeRoute === "siyuan" ? (
              <NoteUploadSettingsPanel
                config={config}
                onSave={onUploadConfigSave}
                onSiyuanSave={onSiyuanConfigSave}
                onTestConnection={onSiyuanTestConnection}
              />
            ) : null}
            {activeRoute === "messageHubSettings" && onMessageHubSettingsSave && onMessageHubTestConnection ? (
              <MessageHubSettingsPanel
                embedded
                config={config}
                onSave={onMessageHubSettingsSave}
                onTestConnection={onMessageHubTestConnection}
                onSyncEnabledChange={onSyncEnabledChange}
                onSyncBootstrap={onSyncBootstrap}
                onSyncResolveConflicts={onSyncResolveConflicts}
              />
            ) : null}
            {activeRoute === "lskySettings" ? (
              <ImageHostSettingsPanel
                config={config}
                onSave={onImageHostConfigSave}
                onLskyTestConnection={onLskyTestConnection}
                onCloudImgsTestConnection={onCloudImgsTestConnection}
                onScan={onLskyCleanupScan}
                onDelete={onLskyCleanupDelete}
                onCloudImgsCleanupScan={onCloudImgsCleanupScan}
                onCloudImgsCleanupDelete={onCloudImgsCleanupDelete}
              />
            ) : null}
            {activeRoute === "ai" ? (
              <AiSettingsPanel config={config} onAiSave={onAiConfigSave} onClassificationSave={onClassificationConfigSave} />
            ) : null}
            {activeRoute === "general" ? (
              <div className="settings-section-stack">
                <section className="settings-card">
                  <div className="settings-card-head">
                    <div>
                      <strong>基础设置</strong>
                      <span>窗口行为相关选项</span>
                    </div>
                  </div>
                  <div className="settings-row">
                    <div className="settings-row-label">
                      <span>全屏时自动隐藏</span>
                      <span className="settings-row-desc">检测到全屏应用时，自动隐藏到托盘；全屏结束后自动恢复</span>
                    </div>
                    <button
                      id="fullscreen-dodge-toggle"
                      type="button"
                      role="switch"
                      aria-checked={!!config.fullscreen_dodge}
                      className={`settings-toggle${config.fullscreen_dodge ? " active" : ""}`}
                      onClick={() => void onFullscreenDodgeChange?.(!config.fullscreen_dodge)}
                    >
                      <span className="settings-toggle-thumb" />
                    </button>
                  </div>
                  <div className="settings-row">
                    <div className="settings-row-label">
                      <span>截图隐私遮罩</span>
                      <span className="settings-row-desc">遮罩疑似 API Key / Token 行（不修改文件）</span>
                    </div>
                    <AnimatedCheckbox
                      className="appearance-privacy-row"
                      checked={privacyMask}
                      label="截图隐私遮罩"
                      onChange={onPrivacyMaskChange}
                      size={24}
                    />
                  </div>
                </section>
              </div>
            ) : null}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
