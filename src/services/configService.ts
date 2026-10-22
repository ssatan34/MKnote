import { appBridge } from "./appBridge";
import type {
  AppConfig,
  AppState,
  GlobalHotkeys,
  ImageHostConfigPatch,
  OpenTabRef,
  ThemeMode,
  ThemeStyle,
} from "../types";

export interface QuickDataDirectorySettings {
  todo_dir: string | null;
  pocket_dir: string | null;
  active_todo_dir: string;
  active_pocket_dir: string;
  todo_restart_required: boolean;
  pocket_restart_required: boolean;
}

export const configService = {
  getAppState() {
    return appBridge.invoke<AppState>("get_app_state");
  },

  getConfig() {
    return appBridge.invoke<AppConfig>("get_config");
  },

  getQuickDataDirectories() {
    return appBridge.invoke<QuickDataDirectorySettings>("get_quick_data_directories");
  },

  setQuickDataDirectory(kind: "todo" | "pocket", directory: string | null) {
    return appBridge.invoke<QuickDataDirectorySettings>("set_quick_data_directory", { kind, directory });
  },

  setOpenTabs(args: {
    tabs: OpenTabRef[];
    active?: OpenTabRef | null;
    activeZone?: string | null;
    activeName?: string | null;
    pinnedTabs?: OpenTabRef[] | null;
  }) {
    return appBridge.invoke<AppConfig>("set_open_tabs", args);
  },

  setLastNoteFile(name: string, zone: string) {
    return appBridge.invoke("set_last_note_file", { name, zone });
  },

  recordRecentNote(zone: string, name: string) {
    return appBridge.invoke<AppConfig>("record_recent_note", { zone, name });
  },

  clearRecentNotes() {
    return appBridge.invoke<AppConfig>("clear_recent_notes");
  },

  setThemeMode(themeMode: ThemeMode) {
    return appBridge.invoke<AppConfig>("set_theme_mode", { themeMode });
  },

  setThemeStyles(lightTheme: ThemeStyle, darkTheme: ThemeStyle, accentSkin?: ThemeStyle) {
    return appBridge.invoke<AppConfig>("set_theme_styles", { lightTheme, darkTheme, accentSkin });
  },

  setNoteColorLabels(labels: Record<string, string>) {
    return appBridge.invoke<AppConfig>("set_note_color_labels", { labels });
  },

  setAlwaysOnTop(enabled: boolean) {
    return appBridge.invoke<AppConfig>("set_always_on_top", { enabled });
  },

  setEditorFontSize(size: number) {
    return appBridge.invoke<AppConfig>("set_editor_font_size", { size });
  },

  setAutostart(enabled: boolean) {
    return appBridge.invoke<AppConfig>("set_autostart", { enabled });
  },

  setGlobalHotkeys(hotkeys: GlobalHotkeys) {
    return appBridge.invoke<AppConfig>("set_global_hotkeys", { hotkeys });
  },

  setPinnedTabLimit(limit: number) {
    return appBridge.invoke<AppConfig>("set_pinned_tab_limit", { limit });
  },

  setFullscreenDodge(enabled: boolean) {
    return appBridge.invoke<AppConfig>("set_fullscreen_dodge", { enabled });
  },

  setImageHostConfig(patch: ImageHostConfigPatch) {
    return appBridge.invoke<AppConfig>("set_image_host_config", {
      provider: patch.provider,
      enabled: patch.enabled ?? true,
      lskyUrl: patch.lskyUrl,
      lskyEmail: patch.lskyEmail,
      lskyPassword: patch.lskyPassword,
      lskyStrategyId: patch.lskyStrategyId,
      cloudimgsUrl: patch.cloudimgsUrl,
      cloudimgsPassword: patch.cloudimgsPassword,
      cloudimgsDirectory: patch.cloudimgsDirectory,
    });
  },

  testCloudImgsConnection(url: string, password: string, directory: string) {
    return appBridge.invoke<void>("cloudimgs_test_connection", { url, password, directory });
  },

  testLskyConnection(url: string, email: string, password: string) {
    return appBridge.invoke<void>("lsky_test_connection", { url, email, password });
  },
};
