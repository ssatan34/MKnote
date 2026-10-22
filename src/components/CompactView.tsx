import { createLatestRequest } from "../utils/latestRequest";
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { findSelectionInContent, type AiSelectionContext } from "../utils/aiContent";
import { appBridge } from "../services/appBridge";
import { assetService } from "../services/assetService";
import { notesService } from "../services/notesService";
import { siyuanService } from "../services/siyuanService";
import { effectiveUploadTarget, type NoteUploadConfigPatch } from "../utils/noteUpload";
import { useTauriImageDrop } from "../hooks/useTauriImageDrop";
import { useScriptRunner } from "../hooks/useScriptRunner";
import { createAsyncUnlistenCleanup } from "../utils/asyncUnlisten";
import type { FormatAction } from "../utils/editorFormat";
import type { VisualEditorCommand, VisualEditorCommandSurface } from "../visual-editor/visualEditorSession";
import {
  applyFormatToTextarea,
  redoTextareaFormat,
  undoTextareaFormat,
} from "../utils/editorFormat";
import type {
  AppConfig,
  NoteColorSummary,
  NoteFolderSummary,
  LskyCleanupDeleteResult,
  LskyCleanupReport,
 ImageHostConfigPatch,
  NoteSummary,
  NoteZone,
  SiyuanNotebookSummary,
  ThemeMode,
  ThemeStyle,
  NoteTab,
  RecentNoteRef,
  SearchHit,
  TrashEntry,
  OpenTabRef,
  CustomTagDef,
  SiyuanSyncedNoteRef,
  SiyuanSyncStatus,
} from "../types";
import { NoteTabsBar } from "./NoteTabsBar";
import { tabKey } from "../utils/noteTabs";
import { ScriptToast } from "./compact/ScriptToast";
import type { SettingsRoute } from "./compact/UnifiedSettingsPanel";
import { CompactEditorToolbar, MarkdownToolbar } from "./compact/EditorToolbars";
import { CompactStatusBar } from "./compact/CompactStatusBar";
import { CompactHeader } from "./compact/CompactHeader";
import { EditorPane } from "./compact/EditorPane";
import type { CaretAnchor } from "../utils/caretMapping";
import {
  focusTextareaAtEnd,
  getContentEditableCaret,
  getTextareaCaret,
  setTextareaCaret,
  type CaretRange,
} from "../utils/editorCaret";
import { maskSensitiveContent } from "../utils/privacyMask";
import { refreshEditorFocusAfterWindowMove } from "../utils/windowMoveEditorFocus";

type ViewMode = "edit" | "preview";
type SaveStatus = "idle" | "saving" | "saved" | "error";

const VISUAL_FORMAT_COMMANDS: Partial<Record<FormatAction, VisualEditorCommand>> = {
  bold: "bold",
  italic: "italic",
  strikethrough: "strikethrough",
  underline: "underline",
  highlight: "highlight",
  task: "task",
  taskDone: "task-done",
  indent: "indent",
  outdent: "outdent",
  h1: "heading-1",
  h2: "heading-2",
  h3: "heading-3",
  ul: "bullet-list",
  ol: "ordered-list",
  blockquote: "blockquote",
  inlineCode: "inline-code",
  codeBlock: "code-block",
  caseTransform: "case-transform",
  clearFormat: "clear-format",
  link: "link",
  hr: "insert-divider",
  table: "insert-table",
};

const VISUAL_FORMAT_FALLBACK_ACTIONS: ReadonlySet<FormatAction> = new Set();

const ImageDoodleModal = lazy(() =>
  import("./ImageDoodleModal").then((module) => ({ default: module.ImageDoodleModal })),
);
const LibraryPanel = lazy(() =>
  import("./compact/LibraryPanel").then((module) => ({ default: module.LibraryPanel })),
);

type PopoverKey =
  | "trash"
  | "recent"
  | "archive"
  | "delete"
  | "timeline"
  | "titleColor"
  | "template"
  | "search"
  | "settings";

function localSaveStatusText(saveStatus: SaveStatus, dirty: boolean): string {
  if (saveStatus === "saving") return "保存中…";
  if (saveStatus === "error") return "保存失败";
  if (saveStatus === "saved" || !dirty) return "已保存";
  return "未保存";
}

function syncStatusClass(saveStatus: SaveStatus, dirty: boolean): string {
  if (saveStatus === "saving") return "saving";
  if (saveStatus === "error") return "error";
  if (dirty) return "dirty";
  return "saved";
}

interface CompactViewProps {
  config: AppConfig;
  activeNote: string;
  activeZone: NoteZone;
  contentRevision: number;
  title: string;
  activeNoteColor: string | null;
  content: string;
  viewMode: ViewMode;
  saveStatus: SaveStatus;
  dirty: boolean;
  siyuanHint?: string | null;
  siyuanSyncedNotes?: SiyuanSyncedNoteRef[];
  customTags?: CustomTagDef[];
  onAddCustomTag?: (name: string, hex: string) => void | Promise<void>;
  onUpdateCustomTag?: (id: string, patch: { name?: string; hex?: string }) => void | Promise<void>;
  onDeleteCustomTag?: (id: string) => void | Promise<void>;
  inboxNotes: NoteSummary[];
  folders: NoteFolderSummary[];
  noteColors: NoteColorSummary[];
  libraryNotes: NoteSummary[];
  libraryZone: NoteZone;
  activeColor: string | null;
  libraryOpen: boolean;
  onTitleChange: (title: string) => void;
  onTitleCommit: (title: string) => void;
  onActiveNoteColorChange: (color: string | null) => void;
  onContentChange: (value: string) => void;
  onEditorBlur: () => void;
  onTogglePreview: () => void;
  onTogglePin: () => void;
  onHide: () => void;
  onCreate: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onFontSizeChange: (size: number) => void;
  onThemeModeCycle: () => void;
  onThemeModeChange: (mode: ThemeMode) => void | Promise<void>;
  onThemeStyleChange: (theme: ThemeStyle) => void;
  onNoteColorLabelsChange: (labels: Record<string, string>) => void | Promise<void>;
  onToggleLibrary: () => void;
  onCloseLibrary?: () => void;
  onOpenNote: (zone: NoteZone, name: string) => void;
  onOpenNoteInMain: (zone: NoteZone, name: string) => void;
  onOpenNoteAsSticky: (zone: NoteZone, name: string) => void;
  onCreateNote: (zone: NoteZone) => void;
  onCreateCapsuleTodo: () => void;
  onLibraryZoneChange: (zone: NoteZone) => void;
  onOpenLibraryFolder: () => void;
  onColorSelect: (color: string | null) => void;
  onMoveNote: (name: string, from: NoteZone, to: NoteZone) => void;
  onRenameNote: (zone: NoteZone, oldName: string, newTitle: string) => void;
  onDeleteNote: (zone: NoteZone, name: string) => void;
  onSetNoteColor: (zone: NoteZone, name: string, color: string | null) => void;
  onCreateFolder: (title: string) => void;
  onRenameFolder: (oldId: string, newTitle: string) => void;
  onAutostartChange: (enabled: boolean) => void;
  onGlobalHotkeysSave: (hotkeys: import("../types").GlobalHotkeys) => void | Promise<void>;
  onClassificationConfigSave: (settings: import("../types").NoteClassificationConfig) => Promise<void>;
  onAiConfigSave: (patch: import("../types").AiConfig) => void | Promise<void>;
  fullSearchOpen: boolean;
  onFullSearchOpenChange: (open: boolean) => void;
  onToggleLogoMini?: () => void;
  onOpenCapsule: () => void;
  openTabs: NoteTab[];
  onSelectTab: (zone: NoteZone, name: string) => void;
  onMiddleClickCloseTab: (zone: NoteZone, name: string) => void;
  onCloseOtherTabs: () => void;
  onReorderTabs?: (fromIndex: number, toIndex: number) => void;
  isActiveTabPinned?: boolean;
  onToggleTabPin?: () => void;
  pinnedTabs?: OpenTabRef[];
  replacePinPrompt?: OpenTabRef | null;
  onReplacePinnedTab?: (replaced: OpenTabRef) => void;
  onDismissReplacePin?: () => void;
  closePinnedPrompt?: OpenTabRef | null;
  onConfirmClosePinned?: () => void;
  onDismissClosePinned?: () => void;
  /** 已弹出为独立窗口的笔记 key 集合，在 Tab 栏隐藏这些 Tab */
  poppedOutNotes?: Set<string>;
  /** 弹出某个 Tab 为独立窗口 */
  onPopoutTab?: (zone: NoteZone, name: string) => void;
  onOpenContainingFolder: () => void;
  onSiyuanUpload: () => void;
  classificationEnabled: boolean;
  classificationBusy: boolean;
  onClassifyNote: () => void;
  siyuanUploading: boolean;
  onUploadConfigSave: (patch: NoteUploadConfigPatch) => Promise<void>;
  onManualSync: () => void;
  manualSyncBusy: boolean;
  onSiyuanConfigSave: (patch: {
    apiUrl: string;
    apiToken: string;
    notebookId: string;
  }) => Promise<void>;
  onSiyuanTestConnection: (apiUrl: string, apiToken: string) => Promise<SiyuanNotebookSummary[]>;
  recentNotes?: RecentNoteRef[];
  resolveRecentTitle?: (zone: NoteZone, name: string) => string;
  onClearRecentNotes?: () => void | Promise<void>;
  backlinks?: NoteSummary[];
  onImportAsset?: (path: string) => Promise<string>;
  onImportError?: (message: string) => void;
  onEnsurePreviewMode?: () => void | Promise<void>;
  onWikilinkNavigate?: (title: string) => void;
  onAiAssist?: (selection: AiSelectionContext) => void;
  onArchiveNote: () => void | Promise<void>;
  onRestoreFromTrash: (id: string) => void | Promise<void>;
  onPermanentlyDeleteTrash: (id: string) => void | Promise<void>;
  onCreateFromTemplate: (templateId: string) => void | Promise<void>;
  onDeleteCurrentNote: () => void | Promise<void>;
  defaultNoteOpen?: boolean;
  onOpenDefaultNote?: () => void;
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
  onImageHostConfigSave: (patch: ImageHostConfigPatch) => Promise<void>;
  onLskyTestConnection: (url: string, email: string, password: string) => Promise<void>;
  onCloudImgsTestConnection: (url: string, password: string, directory: string) => Promise<void>;
  windowFocusRevision?: number;
  onPinnedTabLimitChange?: (limit: number) => void | Promise<void>;
  privateModeActive?: boolean;
  privateContent?: string;
  privateContentRevision?: number;
  onPrivateContentChange?: (value: string) => void;
  onEnterPrivateMode?: () => void;
  /** 图片粘贴后通知 App 层异步上传，保留本地副本 */
  onImagePasted?: (localRel: string, imageData: Uint8Array, ext: string) => void;
  /** 涂鸦保存后用户主动请求重新上传到图床 */
  onReuploadImage?: (localRel: string) => void;
  /** 云图图片涂鸦保存后直接上传画布字节，不生成本地资源 */
  onHostedImageEdited?: (
    sourceHostedUrl: string,
    localRel: string | null,
    imageData: Uint8Array,
    filename: string,
  ) => Promise<void>;
  /** 涂鸦保存成功后通知 App 层：把 Markdown 里的图床路径降级回本地路径（移除水印） */
  onDoodleSaved?: (localRel: string) => void;
  /** 全屏避让开关变化 */
  onFullscreenDodgeChange?: (enabled: boolean) => void | Promise<void>;
}

function getEditorSelectionContext(
  viewMode: ViewMode,
  content: string,
  textarea: HTMLTextAreaElement | null,
): AiSelectionContext | null {
  if (viewMode === "edit" && textarea) {
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = textarea.value.slice(start, end);
    if (!text.trim()) return null;
    return { text, start, end, anchor: getTextareaSelectionAnchor(textarea, end) };
  }
  const selected = window.getSelection()?.toString() ?? "";
  const selection = findSelectionInContent(content, selected);
  if (!selection) return null;
  const range = window.getSelection()?.rangeCount ? window.getSelection()?.getRangeAt(0) : null;
  const rect = range?.getBoundingClientRect();
  return rect && (rect.width || rect.height)
    ? { ...selection, anchor: { left: rect.left, top: rect.top, bottom: rect.bottom } }
    : selection;
}

/** textarea 没有 DOM Range；用同样排版的镜像元素计算选区末端位置。 */
function getTextareaSelectionAnchor(
  textarea: HTMLTextAreaElement,
  end: number,
): AiSelectionContext["anchor"] {
  const rect = textarea.getBoundingClientRect();
  const style = window.getComputedStyle(textarea);
  const mirror = document.createElement("div");
  const marker = document.createElement("span");
  const copiedStyles = [
    "boxSizing", "width", "height", "overflow", "borderTopWidth", "borderRightWidth",
    "borderBottomWidth", "borderLeftWidth", "paddingTop", "paddingRight", "paddingBottom",
    "paddingLeft", "fontFamily", "fontSize", "fontWeight", "fontStyle", "letterSpacing",
    "lineHeight", "textTransform", "textIndent", "textAlign", "wordSpacing", "tabSize",
  ] as const;

  mirror.style.position = "fixed";
  mirror.style.left = `${rect.left}px`;
  mirror.style.top = `${rect.top}px`;
  mirror.style.width = `${rect.width}px`;
  mirror.style.visibility = "hidden";
  mirror.style.pointerEvents = "none";
  mirror.style.whiteSpace = "pre-wrap";
  mirror.style.overflowWrap = "break-word";
  for (const property of copiedStyles) mirror.style[property] = style[property];

  mirror.textContent = textarea.value.slice(0, end);
  marker.textContent = "\u200b";
  mirror.append(marker);
  document.body.append(mirror);
  const markerRect = marker.getBoundingClientRect();
  mirror.remove();

  const lineHeight = Number.parseFloat(style.lineHeight) || Number.parseFloat(style.fontSize) * 1.4;
  const top = markerRect.top - textarea.scrollTop;
  return {
    left: Math.max(rect.left, markerRect.left - textarea.scrollLeft),
    top,
    bottom: top + lineHeight,
  };
}

export function CompactView({
  config,
  activeNote,
  activeZone,
  contentRevision,
  title,
  activeNoteColor,
  content,
  viewMode,
  saveStatus,
  dirty,
  siyuanHint,
  inboxNotes,
  folders,
  noteColors,
  libraryNotes,
  libraryZone,
  activeColor,
  libraryOpen,
  onTitleChange,
  onTitleCommit,
  onActiveNoteColorChange,
  onContentChange,
  onEditorBlur,
  onTogglePreview,
  onTogglePin,
  onHide,
  onCreate,
  onUndo,
  onRedo,
  onFontSizeChange,
  onThemeModeCycle,
  onThemeModeChange,
  onThemeStyleChange,
  onNoteColorLabelsChange,
  onToggleLibrary,
  onCloseLibrary,
  onOpenNote,
  onOpenNoteInMain,
  onOpenNoteAsSticky,
  onCreateNote,
  onCreateCapsuleTodo,
  onLibraryZoneChange,
  onOpenLibraryFolder,
  onColorSelect,
  onMoveNote,
  onRenameNote,
  onDeleteNote,
  onSetNoteColor,
  onCreateFolder,
  onRenameFolder,
  onAutostartChange,
  onGlobalHotkeysSave,
  onClassificationConfigSave,
  onAiConfigSave,
  fullSearchOpen,
  onFullSearchOpenChange,
  onOpenCapsule,
  openTabs,
  onSelectTab,
  onMiddleClickCloseTab,
  onCloseOtherTabs,
  onReorderTabs,
  isActiveTabPinned = false,
  onToggleTabPin,
  pinnedTabs = [],
  replacePinPrompt = null,
  onReplacePinnedTab,
  onDismissReplacePin,
  closePinnedPrompt = null,
  onConfirmClosePinned,
  onDismissClosePinned,
  onOpenContainingFolder,
  onSiyuanUpload,
  classificationEnabled,
  classificationBusy,
  onClassifyNote,
  siyuanUploading,
  onUploadConfigSave,
  onManualSync,
  manualSyncBusy,
  onSiyuanConfigSave,
  onSiyuanTestConnection,
  recentNotes = [],
  resolveRecentTitle,
  onClearRecentNotes,
  backlinks = [],
  onImportAsset,
  onImportError,
  onEnsurePreviewMode,
  onWikilinkNavigate,
  onAiAssist,
  onArchiveNote,
  onRestoreFromTrash,
  onPermanentlyDeleteTrash,
  onCreateFromTemplate,
  onDeleteCurrentNote,
  customTags = [],
  onAddCustomTag,
  onUpdateCustomTag,
  onDeleteCustomTag,
  siyuanSyncedNotes = [],
  defaultNoteOpen = false,
  onOpenDefaultNote,
  onMessageHubSettingsSave,
  onMessageHubTestConnection,
  onSyncEnabledChange,
  onSyncBootstrap,
  onSyncResolveConflicts,
  onLskyCleanupScan,
  onLskyCleanupDelete,
  onCloudImgsCleanupScan,
  onCloudImgsCleanupDelete,
  onImageHostConfigSave,
  onLskyTestConnection,
  onCloudImgsTestConnection,
  windowFocusRevision = 0,
  onPinnedTabLimitChange,
  privateModeActive = false,
  privateContent = "",
  privateContentRevision = 0,
  onPrivateContentChange,
  onEnterPrivateMode,
  onImagePasted,
  onReuploadImage,
  onHostedImageEdited,
  onDoodleSaved,
  onFullscreenDodgeChange,
  poppedOutNotes = new Set(),
  onPopoutTab,
}: CompactViewProps) {
  const [pinnedDockTarget, setPinnedDockTarget] = useState<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const visualEditorCommandRef = useRef<VisualEditorCommandSurface | null>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const titleClickSelectPendingRef = useRef(false);
  const savedCaretRef = useRef<CaretRange | null>(null);
  const pendingToolbarPreviewCaretRef = useRef<CaretRange | null>(null);
  const pendingVisualFormatRef = useRef<FormatAction | null>(null);
  const pendingVisualImageRef = useRef<string | null>(null);
  const caretRestorePendingRef = useRef(false);
  const caretAnchorRef = useRef<CaretAnchor | null>(null);
  const editorBeforeWindowMoveRef = useRef<HTMLElement | null>(null);
  const windowMoveFocusTimerRef = useRef<number | null>(null);
  const windowMoveFocusFrameRef = useRef<number | null>(null);
  const [titleDraft, setTitleDraft] = useState(title);
  const [lineNumber, setLineNumber] = useState(1);
  const [openPopover, setOpenPopover] = useState<PopoverKey | null>(null);
  const [settingsRoute, setSettingsRoute] = useState<SettingsRoute>("appearance");
  const [privacyMask, setPrivacyMask] = useState(false);
  const [fullSearchQuery, setFullSearchQuery] = useState("");
  const [fullSearchResults, setFullSearchResults] = useState<SearchHit[]>([]);
  const [fullSearchLoading, setFullSearchLoading] = useState(false);
  const fullSearchRequestRef = useRef(createLatestRequest());
  const fullSearchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [dragDropActive, setDragDropActive] = useState(false);
  const [doodlePath, setDoodlePath] = useState<string | null>(null);
  const [doodleHostedUrl, setDoodleHostedUrl] = useState<string | null>(null);
  // doodleOpen: 是否打开涂鸦（relPath 和 hostedUrl 至少有一个时才打开）
  const [doodleOpen, setDoodleOpen] = useState(false);
  const [trashItems, setTrashItems] = useState<TrashEntry[]>([]);
  const [trashClearConfirm, setTrashClearConfirm] = useState(false);
  const deleteNoteWrapRef = useRef<HTMLSpanElement>(null);
  const tabPinWrapRef = useRef<HTMLDivElement>(null);
  const trashAnchorRef = useRef<HTMLSpanElement>(null);
  const titleColorWrapRef = useRef<HTMLSpanElement>(null);
  const [activeSiyuanSync, setActiveSiyuanSync] = useState<SiyuanSyncStatus | null>(null);
  const [libraryMounted, setLibraryMounted] = useState(libraryOpen);

  const closePopover = useCallback(() => {
    setOpenPopover(null);
    onDismissReplacePin?.();
  }, [onDismissReplacePin]);

  const togglePopover = useCallback(
    (key: PopoverKey) => {
      onDismissReplacePin?.();
      setOpenPopover((prev) => (prev === key ? null : key));
    },
    [onDismissReplacePin],
  );

  const openSettingsRoute = useCallback(
    (route: SettingsRoute) => {
      onDismissReplacePin?.();
      setSettingsRoute(route);
      setOpenPopover("settings");
    },
    [onDismissReplacePin],
  );

  const openImageDoodle = useCallback(
    (relPath: string | null, hostedUrl: string | null) => {
      if (!relPath && !hostedUrl) return;
      setDoodlePath(relPath);
      setDoodleHostedUrl(hostedUrl);
      setDoodleOpen(true);
    },
    [],
  );

  const popoverOpen = (key: PopoverKey) => openPopover === key;

  const handleTemplateSelect = useCallback(
    (templateId: string) => {
      closePopover();
      return onCreateFromTemplate(templateId);
    },
    [closePopover, onCreateFromTemplate],
  );

  const handleTemplateToggle = useCallback(() => {
    togglePopover("template");
  }, [togglePopover]);

  const triggerAiAssist = useCallback(() => {
    const selection = getEditorSelectionContext(
      viewMode,
      content,
      textareaRef.current,
    );
    if (selection) onAiAssist?.(selection);
  }, [viewMode, content, onAiAssist]);

  const onImageAssetSaved = useCallback((localRel: string) => {
    onDoodleSaved?.(localRel);
  }, [onDoodleSaved]);

  // ── 脚本胶囊 ─────────────────────────────────────────────────────────────
  const isScriptNote = (
    content.trimStart().startsWith("!p\n") ||
    content.trimStart().startsWith("!power\n") ||
    content.trim() === "!p" ||
    content.trim() === "!power"
  );
  const { running: scriptRunning, toast: scriptToast, run: runScriptNote } = useScriptRunner(content);
  useEffect(() => {
    setTitleDraft(title);
  }, [title, activeNote]);

  const isPrivacyNote = activeNoteColor === "隐私";

  const pinnedTabChoices = pinnedTabs.map((ref) => {
    const tab = openTabs.find((t) => t.zone === ref.zone && t.name === ref.name);
    return { ...ref, title: tab?.title ?? ref.name.replace(/\.md$/i, "") };
  });

  const closePinnedTitle =
    closePinnedPrompt &&
    (openTabs.find(
      (t) => t.zone === closePinnedPrompt.zone && t.name === closePinnedPrompt.name,
    )?.title ?? closePinnedPrompt.name.replace(/\.md$/i, ""));

  useEffect(() => {
    if (openPopover !== "trash") return;
    void notesService.listTrash()
      .then(setTrashItems)
      .catch(() => setTrashItems([]));
  }, [openPopover]);

  useEffect(() => {
    if (openPopover === "trash") return;
    setTrashClearConfirm(false);
  }, [openPopover]);

  useEffect(() => {
    if (libraryOpen) {
      setLibraryMounted(true);
      return;
    }
    const timer = window.setTimeout(() => setLibraryMounted(false), 220);
    return () => window.clearTimeout(timer);
  }, [libraryOpen]);

  useEffect(() => {
    if (!libraryOpen) return;

    const handleOutsidePointerDown = (event: PointerEvent): void => {
      const target = event.target;
      if (
        target instanceof Element &&
        target.closest("[data-library-surface], [data-library-toggle]")
      ) {
        return;
      }
      onCloseLibrary?.();
    };

    document.addEventListener("pointerdown", handleOutsidePointerDown, true);
    return () => document.removeEventListener("pointerdown", handleOutsidePointerDown, true);
  }, [libraryOpen, onCloseLibrary]);

  const anyFloatingPopoverOpen = openPopover !== null || !!replacePinPrompt;

  useEffect(() => {
    if (!anyFloatingPopoverOpen) return;

    const dismissAll = () => {
      setOpenPopover(null);
      onDismissReplacePin?.();
    };

    const onPointerDown = (e: PointerEvent) => {
      const el = e.target;
      if (!(el instanceof Element)) return;
      if (el.closest("[data-popover-trigger]")) return;
      if (el.closest("[data-popover-anchor]")) return;
      if (el.closest(".settings-panel")) return;
      dismissAll();
    };

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") dismissAll();
    };

    document.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("keydown", onKey);
    };
  }, [anyFloatingPopoverOpen, onDismissReplacePin]);

  useEffect(() => {
    if (!activeNote) {
      setActiveSiyuanSync(null);
      return;
    }
    void siyuanService.getSyncStatus(activeZone, activeNote)
      .then(setActiveSiyuanSync)
      .catch(() => setActiveSiyuanSync(null));
  }, [activeNote, activeZone, siyuanHint]);

  const handleEmptyTrash = useCallback(async () => {
    try {
      await notesService.emptyTrash();
      setTrashItems([]);
      setTrashClearConfirm(false);
    } catch (e) {
      onImportError?.(e instanceof Error ? e.message : String(e));
    }
  }, [onImportError]);

  useEffect(() => {
    if (fullSearchOpen) return;
    setFullSearchQuery("");
    setFullSearchResults([]);
    setFullSearchLoading(false);
  }, [fullSearchOpen]);

  useEffect(() => {
    const request = fullSearchRequestRef.current;
    request.invalidate();
    if (!fullSearchOpen) return;
    if (fullSearchTimerRef.current) clearTimeout(fullSearchTimerRef.current);
    fullSearchTimerRef.current = setTimeout(() => {
      const q = fullSearchQuery.trim();
      if (!q) {
        setFullSearchResults([]);
        setFullSearchLoading(false);
        return;
      }
      setFullSearchLoading(true);
      void request.run(
        () => notesService.search(q, null).catch(() => []),
        setFullSearchResults,
        () => setFullSearchLoading(false),
      );
    }, 200);
    return () => {
      request.invalidate();
      if (fullSearchTimerRef.current) clearTimeout(fullSearchTimerRef.current);
    };
  }, [fullSearchQuery, fullSearchOpen]);

  useEffect(() => {
    // Visual -> 源码回退时，切换前已映射的选区要交给后续恢复 effect；
    // 否则下划线/高亮等源码回退会退化为在光标处插入默认文本。
    if (!(viewMode === "edit" && caretRestorePendingRef.current)) {
      savedCaretRef.current = null;
    }
    pendingToolbarPreviewCaretRef.current = null;
    caretAnchorRef.current = null;
    const id = requestAnimationFrame(() => {
      if (caretRestorePendingRef.current) return;
      if (viewMode === "edit") {
        const el = textareaRef.current;
        if (!el) return;
        focusTextareaAtEnd(el);
        setLineNumber(el.value.slice(0, el.selectionStart).split("\n").length);
      }
    });
    return () => cancelAnimationFrame(id);
  }, [activeNote, activeZone, contentRevision, viewMode, windowFocusRevision]);

  const preserveToolbarSelection = useCallback(() => {
    if (viewMode !== "preview") return;
    const preview =
      previewRef.current ?? document.querySelector<HTMLElement>("[data-testid='mknote-visual-editor'] .ProseMirror");
    if (!preview) return;
    pendingToolbarPreviewCaretRef.current = getContentEditableCaret(preview);
  }, [viewMode]);

  const handleTogglePreview = useCallback(async () => {
    caretRestorePendingRef.current = true;
    const anchor = caretAnchorRef.current;
    const textarea = textareaRef.current;
    const preview =
      previewRef.current ?? document.querySelector<HTMLElement>("[data-testid='mknote-visual-editor'] .ProseMirror");
    // 工具栏点击可能在动态导入完成前清空 DOM 选区，必须先同步保存用户当前 caret。
    const mdCaret = viewMode === "edit" && textarea ? getTextareaCaret(textarea) : null;
    const previewCaret = viewMode === "preview" && preview
      ? pendingToolbarPreviewCaretRef.current ?? getContentEditableCaret(preview)
      : null;
    pendingToolbarPreviewCaretRef.current = null;

    if (viewMode === "edit" && textarea && mdCaret) {
      const { mapMarkdownCaretToPreview } = await import("../utils/caretMapping");
      const plainCaret = await mapMarkdownCaretToPreview(content, mdCaret, anchor);
      caretAnchorRef.current = { md: mdCaret, plain: plainCaret };
      savedCaretRef.current = null;
    } else if (viewMode === "preview" && preview && previewCaret) {
      const { mapPreviewCaretToMarkdown } = await import("../utils/caretMapping");
      const mdCaret = await mapPreviewCaretToMarkdown(content, previewCaret, anchor);
      savedCaretRef.current = mdCaret;
      caretAnchorRef.current = { md: mdCaret, plain: previewCaret };
    }

    await onTogglePreview();
  }, [viewMode, content, onTogglePreview]);

  useEffect(() => {
    if (!caretRestorePendingRef.current) return;
    caretRestorePendingRef.current = false;

    if (viewMode === "preview") {
      return;
    }

    const saved = savedCaretRef.current;
    const restore = () => {
      const el = textareaRef.current;
      if (!el) return;
      if (saved) {
        setTextareaCaret(el, saved.start, saved.end);
        savedCaretRef.current = null;
      } else {
        el.focus();
      }
      setLineNumber(el.value.slice(0, el.selectionStart).split("\n").length);
    };
    const id = requestAnimationFrame(() => {
      requestAnimationFrame(restore);
    });
    return () => cancelAnimationFrame(id);
  }, [viewMode]);

  useEffect(() => {
    if (viewMode !== "edit") return;
    const action = pendingVisualFormatRef.current;
    const imagePath = pendingVisualImageRef.current;
    if (!action && !imagePath) return;
    pendingVisualFormatRef.current = null;
    pendingVisualImageRef.current = null;
    const id = requestAnimationFrame(() => {
      const applyFallback = () => {
        const textarea = textareaRef.current;
        if (!textarea) {
          onImportError?.("源码编辑器尚未就绪，图片未插入");
          return;
        }
        if (imagePath) {
          const start = textarea.selectionStart;
          const end = textarea.selectionEnd;
          const snippet = `![图片](${imagePath})`;
          onContentChange(
            `${textarea.value.slice(0, start)}${snippet}${textarea.value.slice(end)}`,
          );
          return;
        }
        if (action) onContentChange(applyFormatToTextarea(textarea, action));
      };
      requestAnimationFrame(applyFallback);
    });
    return () => cancelAnimationFrame(id);
  }, [viewMode, onContentChange, onImportError]);

  const fontSize = config.editor_font_size ?? 16;

  useEffect(() => {
    const scheduleFocusRefresh = () => {
      if (!editorBeforeWindowMoveRef.current) return;
      if (windowMoveFocusTimerRef.current !== null) {
        window.clearTimeout(windowMoveFocusTimerRef.current);
      }

      // onMoved 在拖动过程中会连续触发；只在最后一次移动后刷新，避免拖动时反复打断输入法。
      windowMoveFocusTimerRef.current = window.setTimeout(() => {
        windowMoveFocusTimerRef.current = null;
        const editor = editorBeforeWindowMoveRef.current;
        editorBeforeWindowMoveRef.current = null;
        if (!editor || !editor.isConnected) return;

        const activeElement = document.activeElement;
        if (
          activeElement &&
          activeElement !== document.body &&
          activeElement !== editor &&
          !editor.contains(activeElement)
        ) {
          return;
        }

        refreshEditorFocusAfterWindowMove(editor, (callback) => {
          windowMoveFocusFrameRef.current = window.requestAnimationFrame(() => {
            windowMoveFocusFrameRef.current = null;
            callback();
          });
        });
      }, 160);
    };

    const cleanup = createAsyncUnlistenCleanup(
      appBridge.window.current().onMoved(scheduleFocusRefresh),
    );
    return () => {
      cleanup();
      if (windowMoveFocusTimerRef.current !== null) {
        window.clearTimeout(windowMoveFocusTimerRef.current);
        windowMoveFocusTimerRef.current = null;
      }
      if (windowMoveFocusFrameRef.current !== null) {
        window.cancelAnimationFrame(windowMoveFocusFrameRef.current);
        windowMoveFocusFrameRef.current = null;
      }
      editorBeforeWindowMoveRef.current = null;
    };
  }, []);

  const handleTitleBarMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    editorBeforeWindowMoveRef.current = null;
    const target = e.target as HTMLElement;
    const titleInput = target.closest(".compact-title") as HTMLInputElement | null;
    if (target.closest("button, [data-no-drag], .compact-logo")) return;
    if (titleInput && (titleInput.dataset.titleEditing === "true" || e.type === "mousedown")) return;

    const editor = viewMode === "edit" ? textareaRef.current : previewRef.current;
    const activeElement = document.activeElement;
    editorBeforeWindowMoveRef.current =
      editor && activeElement && (activeElement === editor || editor.contains(activeElement))
        ? editor
        : null;
    void appBridge.window.startDragging();
  };

  const insertImageMarkdown = useCallback(
    async (relPath: string) => {
      const snippet = `![图片](${relPath})`;
      if (viewMode === "preview") {
        const inserted = visualEditorCommandRef.current?.executeCommand({
          type: "insert-image",
          image: { src: relPath, alt: "图片" },
        });
        if (inserted) return;

        // Visual 尚未就绪时明确切回源码编辑器，沿用同一 Markdown 插入语义。
        pendingVisualImageRef.current = relPath;
        await handleTogglePreview();
        return;
      }
      let next: string;
      if (viewMode === "edit" && textareaRef.current) {
        const el = textareaRef.current;
        const start = el.selectionStart;
        const end = el.selectionEnd;
        next = `${el.value.slice(0, start)}${snippet}${el.value.slice(end)}`;
      } else {
        next = `${content}\n${snippet}\n`;
      }
      onContentChange(next);
      await onEnsurePreviewMode?.();
    },
    [viewMode, content, onContentChange, onEnsurePreviewMode, handleTogglePreview],
  );

  useTauriImageDrop(
    true,
    onImportAsset,
    (rel) => {
      void insertImageMarkdown(rel);
    },
    onImportError,
    setDragDropActive,
  );

  const pickAndImportImage = async () => {
    if (!onImportAsset) return;
    try {
      const picked = await appBridge.dialog.open({
        multiple: false,
        directory: false,
        filters: [
          {
            name: "图片",
            extensions: ["png", "jpg", "jpeg", "gif", "webp", "bmp", "svg"],
          },
        ],
      });
      const path = Array.isArray(picked) ? picked[0] : picked;
      if (!path || typeof path !== "string") return;
      const rel = await onImportAsset(path);
      await insertImageMarkdown(rel);
    } catch (e) {
      onImportError?.(e instanceof Error ? e.message : String(e));
    }
  };

  // 先保存本地图片，图床上传失败或离线时仍可显示。
  const handlePaste = useCallback(
    async (e: ClipboardEvent) => {
      // 隐私模式禁用图床上传
      if (privateModeActive) return;
      if (!onImportAsset) return;
      const items = Array.from(e.clipboardData?.items ?? []);
      const imageItem = items.find((item) => item.kind === "file" && item.type.startsWith("image/"));
      if (!imageItem) return;
      const file = imageItem.getAsFile();
      if (!file) return;

      e.preventDefault();
      try {
      const arrayBuffer = await file.arrayBuffer();
      const uint8 = new Uint8Array(arrayBuffer);
      const ext = file.type.split("/")[1]?.replace("jpeg", "jpg") ?? "png";
      const rel = await assetService.importClipboardImage(ext, Array.from(uint8));
      await insertImageMarkdown(rel);
      // App 按图床开关决定是否后台上传，本地副本始终保留。
      onImagePasted?.(rel, uint8, ext);
    } catch (err) {
      onImportError?.(err instanceof Error ? err.message : String(err));
    }
    },
    [
      config,
      privateModeActive,
      viewMode,
      onImportAsset,
      insertImageMarkdown,
      onImportError,
      onImagePasted,
    ],
  );

  useEffect(() => {
    document.addEventListener("paste", handlePaste);
    return () => document.removeEventListener("paste", handlePaste);
  }, [handlePaste]);

  const format = (action: FormatAction) => {
    if (action === "image") {
      void pickAndImportImage();
      return;
    }
    if (viewMode === "edit" && textareaRef.current) {
      const next = applyFormatToTextarea(textareaRef.current, action);
      onContentChange(next);
      return;
    }
    const visualCommand = VISUAL_FORMAT_COMMANDS[action];
    if (viewMode === "preview") {
      if (visualCommand && visualEditorCommandRef.current?.executeCommand(visualCommand)) {
        return;
      }
      // Milkdown 暂不表达下划线/高亮；明确回到源码编辑器并复用同一 Markdown 变换，禁止静默丢操作。
      if (VISUAL_FORMAT_FALLBACK_ACTIONS.has(action) || visualCommand) {
        pendingVisualFormatRef.current = action;
        void handleTogglePreview();
      }
    }
  };

  const bumpFont = (delta: number) => {
    const next = Math.min(24, Math.max(12, fontSize + delta));
    onFontSizeChange(next);
  };

  const updateCursorLine = () => {
    const el = textareaRef.current;
    if (!el) return;
    setLineNumber(el.value.slice(0, el.selectionStart).split("\n").length);
  };

  useEffect(() => {
    if (viewMode !== "edit" || privateModeActive) return;
    const textarea = textareaRef.current;
    if (!textarea) return;

    const handleTextareaKeyDown = (event: KeyboardEvent): void => {
      if (!(event.ctrlKey || event.metaKey)) return;
      const key = event.key.toLowerCase();
      const isUndo = key === "z" && !event.shiftKey;
      const isRedo = key === "y" || (key === "z" && event.shiftKey);
      if (!isUndo && !isRedo) return;

      const next = isRedo ? redoTextareaFormat(textarea) : undoTextareaFormat(textarea);
      if (next === null) return;
      event.preventDefault();
      event.stopPropagation();
      onContentChange(next);
      setLineNumber(next.slice(0, textarea.selectionStart).split("\n").length);
    };

    textarea.addEventListener("keydown", handleTextareaKeyDown);
    return () => textarea.removeEventListener("keydown", handleTextareaKeyDown);
  }, [viewMode, privateModeActive, onContentChange]);

  const charCount = content.length;
  const displayContent = privacyMask ? maskSensitiveContent(content) : content;
  const syncClass = syncStatusClass(saveStatus, dirty);
  const syncText = localSaveStatusText(saveStatus, dirty);
    const themeMode = config.theme_mode ?? "system";
  const allSearchNotes = [
    ...inboxNotes,
    ...folders.flatMap((folder) =>
      folder.zone === libraryZone ? libraryNotes : [],
    ),
  ];
  const searchResults = searchQuery.trim()
    ? allSearchNotes.filter((note, index, arr) => {
        const q = searchQuery.trim().toLowerCase();
        return (
          note.title.toLowerCase().includes(q) &&
          arr.findIndex((item) => `${item.zone}:${item.name}` === `${note.zone}:${note.name}`) ===
            index
        );
      })
    : [];

  return (
    <div
      className="compact-view"
      style={{ ["--editor-font-size" as string]: `${fontSize}px` }}
    >
      <CompactHeader
        config={config}
        titleDraft={titleDraft}
        activeNoteColor={activeNoteColor}
        activeSiyuanSync={activeSiyuanSync}
        defaultNoteOpen={defaultNoteOpen}
        fullSearchOpen={fullSearchOpen}
        searchOpen={popoverOpen("search")}
        settingsOpen={popoverOpen("settings")}
        titleColorOpen={popoverOpen("titleColor")}
        viewMode={viewMode}
        privacyMask={privacyMask}
        themeMode={themeMode}
        customTags={customTags}
        settingsRoute={settingsRoute}
        searchQuery={searchQuery}
        searchResults={searchResults}
        fullSearchQuery={fullSearchQuery}
        fullSearchLoading={fullSearchLoading}
        fullSearchResults={fullSearchResults}
        titleInputRef={titleInputRef}
        titleColorWrapRef={titleColorWrapRef}
        titleClickSelectPendingRef={titleClickSelectPendingRef}
        onTitleBarMouseDown={handleTitleBarMouseDown}
        onOpenCapsule={onOpenCapsule}
        onToggleTitleColor={() => togglePopover("titleColor")}
        onActiveNoteColorChange={onActiveNoteColorChange}
        onClosePopover={closePopover}
        onTitleDraftChange={setTitleDraft}
        onTitleChange={onTitleChange}
        onTitleCommit={onTitleCommit}
        onOpenDefaultNote={onOpenDefaultNote}
        onFullSearchOpenChange={onFullSearchOpenChange}
        onToggleSearch={() => togglePopover("search")}
        onTogglePreview={handleTogglePreview}
        onTogglePin={onTogglePin}
        onThemeModeCycle={onThemeModeCycle}
        onOpenSettingsRoute={openSettingsRoute}
        onHide={onHide}
        onOpenNote={onOpenNote}
        onSearchQueryChange={setSearchQuery}
        onFullSearchQueryChange={setFullSearchQuery}
        onSelectSettingsRoute={setSettingsRoute}
        onGlobalHotkeysSave={onGlobalHotkeysSave}
        onThemeStyleChange={onThemeStyleChange}
        onThemeModeChange={onThemeModeChange}
        onNoteColorLabelsChange={onNoteColorLabelsChange}
        onPrivacyMaskChange={setPrivacyMask}
        onAddCustomTag={onAddCustomTag}
        onUpdateCustomTag={onUpdateCustomTag}
        onDeleteCustomTag={onDeleteCustomTag}
        onSiyuanConfigSave={onSiyuanConfigSave}
        onUploadConfigSave={onUploadConfigSave}
        onSiyuanTestConnection={onSiyuanTestConnection}
        onMessageHubSettingsSave={onMessageHubSettingsSave}
        onMessageHubTestConnection={onMessageHubTestConnection}
        onSyncEnabledChange={onSyncEnabledChange}
        onSyncBootstrap={onSyncBootstrap}
        onSyncResolveConflicts={onSyncResolveConflicts}
        onLskyCleanupScan={onLskyCleanupScan}
        onLskyCleanupDelete={onLskyCleanupDelete}
        onCloudImgsCleanupScan={onCloudImgsCleanupScan}
        onCloudImgsCleanupDelete={onCloudImgsCleanupDelete}
        onImageHostConfigSave={onImageHostConfigSave}
        onLskyTestConnection={onLskyTestConnection}
        onCloudImgsTestConnection={onCloudImgsTestConnection}
        onClassificationConfigSave={onClassificationConfigSave}
        onAiConfigSave={onAiConfigSave}
        onPinnedTabLimitChange={onPinnedTabLimitChange}
        onFullscreenDodgeChange={onFullscreenDodgeChange}
      />

      {!defaultNoteOpen && openTabs.length > 0 && (
        <NoteTabsBar
          pinnedDockTarget={pinnedDockTarget}
          data-testid="mknote-tabs"
          tabs={openTabs.filter((t) => !poppedOutNotes.has(tabKey(t.zone, t.name)))}
          activeZone={activeZone}
          activeNote={activeNote}
          onSelectTab={(zone, name) => {
            visualEditorCommandRef.current?.flushPendingChanges();
            onSelectTab(zone, name);
          }}
          onMiddleClickClose={onMiddleClickCloseTab}
          onCloseOthers={onCloseOtherTabs}
          onNewTab={onCreate}
          onNewCapsuleTodo={onCreateCapsuleTodo}
          onReorderTabs={onReorderTabs}
          closePinnedPrompt={closePinnedPrompt}
          closePinnedPromptTitle={closePinnedTitle || undefined}
          onConfirmClosePinned={onConfirmClosePinned}
          onDismissClosePinned={onDismissClosePinned}
          onPopoutTab={onPopoutTab}
        />
      )}

      <MarkdownToolbar
          fontSize={fontSize}
          activeNote={activeNote}
          isActiveTabPinned={isActiveTabPinned}
          replacePinPrompt={replacePinPrompt}
          pinnedTabChoices={pinnedTabChoices}
           tabPinWrapRef={tabPinWrapRef}
           onFormat={format}
           onPreserveSelection={preserveToolbarSelection}
           onBumpFont={bumpFont}
          onClosePopover={closePopover}
          onToggleTabPin={onToggleTabPin}
          onReplacePinnedTab={onReplacePinnedTab}
      />

      <div className={`compact-body${libraryOpen ? " library-expanded" : ""}`}>
        <CompactEditorToolbar
            templateOpen={popoverOpen("template")}
            isPrivacyNote={isPrivacyNote}
            isScriptNote={isScriptNote}
            scriptRunning={scriptRunning}
            activeNote={activeNote}
            onToggleTemplate={handleTemplateToggle}
            onSelectTemplate={handleTemplateSelect}
            onUndo={onUndo}
            onRedo={onRedo}
            onFormat={format}
            onPreserveSelection={preserveToolbarSelection}
            onAiAssist={triggerAiAssist}
            onRunScript={() => void runScriptNote()}
            onOpenContainingFolder={() => void onOpenContainingFolder()}
        />

        {(libraryOpen || libraryMounted) && (
          <Suspense fallback={null}>
            <LibraryPanel
              motionState={libraryOpen ? "open" : "closing"}
              config={config}
              inboxNotes={inboxNotes}
              folders={folders}
              noteColors={noteColors}
              libraryNotes={libraryNotes}
              libraryZone={libraryZone}
              activeColor={activeColor}
              activeNote={activeNote}
              activeZone={activeZone}
              onOpenNote={onOpenNote}
              onOpenNoteInMain={onOpenNoteInMain}
              onOpenNoteAsSticky={onOpenNoteAsSticky}
              onCreateNote={onCreateNote}
              onLibraryZoneChange={onLibraryZoneChange}
              onOpenLibraryFolder={onOpenLibraryFolder}
              onColorSelect={onColorSelect}
              onMoveNote={onMoveNote}
              onRenameNote={onRenameNote}
              onDeleteNote={onDeleteNote}
              onSetNoteColor={onSetNoteColor}
              onCreateFolder={onCreateFolder}
              onRenameFolder={onRenameFolder}
              customTags={customTags}
              onAddCustomTag={onAddCustomTag}
              siyuanSyncedNotes={siyuanSyncedNotes}
            />
          </Suspense>
        )}

        <EditorPane
          libraryOpen={libraryOpen}
          activeZone={activeZone}
          privateModeActive={privateModeActive}
          privacyMask={privacyMask}
          viewMode={viewMode}
          dragDropActive={dragDropActive}
          activeNote={activeNote}
          content={content}
          displayContent={displayContent}
          contentRevision={contentRevision}
          privateContent={privateContent}
          privateContentRevision={privateContentRevision}
          backlinks={backlinks}
          textareaRef={textareaRef}
          previewRef={previewRef}
          visualEditorCommandRef={visualEditorCommandRef}
          onOpenSourceEditor={() => {
            if (viewMode === "preview") void onTogglePreview();
          }}
          onFocusEditor={() => {
            if (viewMode === "edit") {
              textareaRef.current?.focus();
            } else {
              previewRef.current?.focus();
            }
          }}
          onContentChange={onContentChange}
          onPrivateContentChange={onPrivateContentChange}
          onUpdateCursorLine={updateCursorLine}
          onEditorBlur={onEditorBlur}
          onWikilinkNavigate={onWikilinkNavigate}
          onImageDoodle={openImageDoodle}
          onOpenNote={onOpenNote}
        />
      </div>

      <div className="note-tabs-pinned-host" ref={setPinnedDockTarget} />

      <CompactStatusBar
        libraryOpen={libraryOpen}
        recentOpen={popoverOpen("recent")}
        timelineOpen={popoverOpen("timeline")}
        trashOpen={popoverOpen("trash")}
        archiveOpen={popoverOpen("archive")}
        autostart={config.autostart}
        activeNote={activeNote}
        activeZone={activeZone}
        isPrivacyNote={isPrivacyNote || privateModeActive || activeZone === "private"}
        defaultNoteOpen={defaultNoteOpen}
        classificationEnabled={classificationEnabled}
        classificationBusy={classificationBusy}
        onClassifyNote={onClassifyNote}
        siyuanUploading={siyuanUploading}
        uploadTarget={effectiveUploadTarget(config)}
        uploadHint={siyuanHint}
        syncEnabled={Boolean(config.sync_enabled)}
        syncInitialized={Boolean(config.sync_initialized)}
        manualSyncBusy={manualSyncBusy}
        recentNotes={recentNotes}
        trashItems={trashItems}
        trashClearConfirm={trashClearConfirm}
        trashAnchorRef={trashAnchorRef}
        deleteNoteAnchorRef={deleteNoteWrapRef}
        syncClass={syncClass}
        syncText={syncText}
        charCount={charCount}
        lineNumber={lineNumber}
        viewMode={viewMode}
        resolveRecentTitle={resolveRecentTitle}
        onClosePopover={closePopover}
        onToggleLibrary={onToggleLibrary}
        onToggleRecent={() => togglePopover("recent")}
        onToggleTimeline={() => togglePopover("timeline")}
        onToggleTrash={() => togglePopover("trash")}
        onToggleArchive={() => togglePopover("archive")}
        onOpenNote={onOpenNote}
        onClearRecentNotes={onClearRecentNotes}
        onCancelTrashClear={() => setTrashClearConfirm(false)}
        onRequestTrashClear={() => setTrashClearConfirm(true)}
        onConfirmTrashClear={() => void handleEmptyTrash()}
        onRestoreFromTrash={onRestoreFromTrash}
        onPermanentlyDeleteTrash={(id) => {
          void Promise.resolve(onPermanentlyDeleteTrash(id)).then(() => {
            void notesService.listTrash().then(setTrashItems);
          });
        }}
        onAutostartChange={onAutostartChange}
        onSiyuanUpload={onSiyuanUpload}
        onManualSync={onManualSync}
        onArchiveNote={onArchiveNote}
        onDeleteCurrentNote={onDeleteCurrentNote}
        onEnterPrivateMode={onEnterPrivateMode}
      />
      {doodleOpen && (
        <Suspense fallback={null}>
          <ImageDoodleModal
            open={doodleOpen}
            relPath={doodlePath}
            hostedUrl={doodleHostedUrl}
            onClose={() => {
              setDoodleOpen(false);
              setDoodlePath(null);
              setDoodleHostedUrl(null);
            }}
            onSaved={onImageAssetSaved}
            onReupload={(localRel) => onReuploadImage?.(localRel)}
            onHostedSaved={onHostedImageEdited}
            onError={onImportError}
          />
        </Suspense>
      )}
      <ScriptToast toast={scriptToast} />
    </div>
  );
}
