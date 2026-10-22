export interface WindowGeometry {

  x: number;

  y: number;

  width: number;

  height: number;

}



export type NoteZone = "inbox" | "default" | "private" | `folder:${string}`;

export interface NoteRevision {
  contentHash: string;
  modifiedMs: number;
}

export interface NoteSnapshot extends NoteRevision {
  content: string;
}



export interface CapsuleSessionRef {

  zone: NoteZone;

  name: string;

  title: string;

  note_color?: string | null;

  always_on_top: boolean;

  geometry: WindowGeometry;

  snap_edge?: "left" | "right" | "top" | null;

}



/** 持久化在配置中的已打开标签 */

export interface PopoutSessionRef {
  zone: NoteZone;
  name: string;
  title: string;
  always_on_top: boolean;
  geometry: WindowGeometry;
}

export interface OpenTabRef {

  zone: NoteZone;

  name: string;

}



export interface RecentNoteRef {

  zone: NoteZone;

  name: string;

  opened_at: string;

}



export interface GlobalHotkeys {

  toggle_window: string;

  focus_window: string;

  quick_capture: string;

  clipboard_inbox: string;

  quick_search: string;

}



export interface NoteClassificationConfig {
  enabled: boolean;
  provider: "official" | "commandcode";
  official: { api_token?: string | null; model?: string | null };
  commandcode: { api_token?: string | null; model?: string | null };
  folders: Array<{ zone: string; description: string }>;
}

export interface AiConfig {

  api_url?: string | null;

  api_token?: string | null;

  model?: string | null;

}



export interface NoteTab {

  zone: NoteZone;

  name: string;

  title: string;

  pinned?: boolean;

  /** 笔记颜色标签，用于 Tab 顶部色条；null 表示未设置 */
  color?: string | null;

}

export type LayoutMode = "compact" | "expanded";

export type ThemeMode = "system" | "light" | "dark";

export type ThemeStyle =
  | "catppuccin"
  | "mknote"
  | "hermes"
  | "poseidon"
  | "ares"
  | "nous"
  | "midnight"
  | "ember"
  | "mono"
  | "slate"
  | "captain-log";



export interface AppConfig {

  last_note: string | null;

  last_note_zone?: string | null;

  /** 跨重启保留的打开标签（不含待办） */

  open_tabs?: OpenTabRef[] | null;

  /** 置顶标签（默认最多 2 个） */
  pinned_tabs?: OpenTabRef[] | null;

  /** 置顶标签上限，默认 2，可设置范围 1-10 */
  pinned_tab_limit?: number | null;

  capsule_sessions?: CapsuleSessionRef[] | null;
  popout_sessions?: PopoutSessionRef[] | null;

  capsule_snap_enabled?: boolean;

  window?: WindowGeometry | null;

  compact_geometry?: WindowGeometry | null;

  quick_todo_geometry?: WindowGeometry | null;
  quick_todo_monitor_name?: string | null;

  quick_todo_always_on_top?: boolean;
  quick_todo_locked?: boolean;
  quick_todos?: QuickTodoDefinition[];
  quick_todo_data_dir?: string | null;
  quick_todo_window_states?: QuickTodoWindowState[];

  quick_pocket_geometry?: WindowGeometry | null;
  quick_pocket_monitor_name?: string | null;

  quick_pocket_always_on_top?: boolean;
  quick_pocket_locked?: boolean;

  quick_pockets?: QuickPocketDefinition[];
  quick_pocket_data_dir?: string | null;
  quick_pocket_window_states?: QuickPocketWindowState[];

  layout_mode: string;

  editor_font_size: number;

  theme_mode: ThemeMode;

  light_theme: ThemeStyle;

  dark_theme: ThemeStyle;

  accent_skin: string;

  always_on_top: boolean;

  autostart: boolean;

  note_color_labels?: Partial<Record<string, string>> | null;

  siyuan_api_url?: string | null;

  siyuan_api_token?: string | null;

  siyuan_notebook_id?: string | null;
  note_upload_target?: "none" | "siyuan" | "obsidian" | null;
  obsidian_note_dir?: string | null;
  obsidian_attachment_dir?: string | null;
  obsidian_conflict?: "rename" | "overwrite";

  global_hotkeys?: GlobalHotkeys;

  recent_notes?: RecentNoteRef[] | null;

  ai_config?: AiConfig | null;
  note_classification?: NoteClassificationConfig;

  clip_server_enabled?: boolean;

  clip_server_port?: number;

  s3_endpoint?: string | null;

  s3_bucket?: string | null;

  s3_object_key?: string | null;

  s3_access_key?: string | null;

  s3_secret_key?: string | null;

  sync_enabled?: boolean;

  sync_initialized?: boolean;

  sync_poll_interval_secs?: number;

  // 图床配置
  image_host_provider?: ImageHostProvider | null;
  image_host_enabled?: boolean | null;
  lsky_url?: string | null;

  lsky_email?: string | null;

  lsky_password?: string | null;

  lsky_strategy_id?: number | null;

  lsky_enabled?: boolean;
  cloudimgs_url?: string | null;
  cloudimgs_password?: string | null;
  cloudimgs_directory?: string | null;

  /** 全屏避让：检测到全屏应用时自动隐藏窗口到托盘 */
  fullscreen_dodge?: boolean;

}

export interface QuickPocketDefinition {
  id: string;
  name: string;
}

export interface LskyCleanupImage {
  key: string;
  name: string;
  url: string;
  size: number;
  created_at_ms: number;
}

export interface LskyCleanupReport {
  scanned_notes: number;
  referenced_urls: number;
  total_album_images: number;
  referenced_images: number;
  protected_images: number;
  reclaimable_bytes: number;
  candidates: LskyCleanupImage[];
}

export interface LskyCleanupDeleteResult {
  requested: number;
  deleted: number;
  skipped: string[];
  failed: Array<{ key: string; error: string }>;
}

export type ImageHostProvider = "none" | "lsky" | "cloudimgs";

export interface ImageHostConfigPatch {
  enabled?: boolean;
  provider: ImageHostProvider;
  lskyUrl: string;
  lskyEmail: string;
  lskyPassword: string;
  lskyStrategyId: number | null;
  cloudimgsUrl: string;
  cloudimgsPassword: string;
  cloudimgsDirectory: string;
}

export interface QuickTodoDefinition {
  id: string;
  name: string;
}

export interface QuickTodoWindowState {
  todoId: string;
  geometry: WindowGeometry | null;
  monitorName: string | null;
  alwaysOnTop: boolean;
  locked: boolean;
}

export interface QuickPocketWindowState {
  pocketId: string;
  geometry: WindowGeometry | null;
  monitorName: string | null;
  alwaysOnTop: boolean;
  locked: boolean;
}



export interface SearchHit {

  name: string;

  title: string;

  zone: NoteZone;

  modified_ms: number;

  color: string | null;

  snippet: string | null;

  score: number;

}



export interface SiyuanNotebookSummary {

  id: string;

  name: string;

  closed: boolean;

}



export interface SiyuanUploadResult {

  doc_id: string;

  h_path: string;

  created: boolean;

}



export interface SiyuanSyncStatus {

  synced: boolean;

  h_path: string | null;

}



export interface SiyuanSyncedNoteRef {

  zone: NoteZone;

  name: string;

}



export interface CustomTagDef {

  id: string;

  name: string;

  hex: string;

}



export interface NoteSummary {

  name: string;

  title: string;

  modified_ms: number;

  zone: NoteZone;

  color: string | null;

}



export interface NoteFolderSummary {

  id: string;

  title: string;

  zone: NoteZone;

  color: string;

  note_count: number;

}



export interface NoteColorSummary {

  color: string;

  note_count: number;

}



export interface AppState {

  config: AppConfig;

  exe_base: string;

}



export interface TrashEntry {

  id: string;

  zone: NoteZone;

  name: string;

  title: string;

  deleted_at_ms: number;

}



export interface TemplateSummary {

  id: string;

  title: string;

  source: string;

}

