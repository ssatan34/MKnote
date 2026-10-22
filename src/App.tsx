import { noteClassificationService, type FolderDecision } from "./services/noteClassificationService";
import { canClassifyNote, classificationReady } from "./utils/noteClassification";
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useDebouncedCallback } from "./hooks/useDebouncedCallback";
import { useEditorHistory } from "./hooks/useEditorHistory";
import { useAgentIndexRefresh } from "./hooks/useAgentIndexRefresh";
import { useLibraryData } from "./hooks/useLibraryData";
import { useNoteSessionState } from "./hooks/useNoteSessionState";
import { useQueuedNoteWriter } from "./hooks/useQueuedNoteWriter";
import { useGlobalInteractionGuards } from "./hooks/useGlobalInteractionGuards";
import { useAppShellEffects } from "./hooks/useAppShellEffects";
import { useOpenTabsController } from "./hooks/useOpenTabsController";
import { usePoppedOutNotes } from "./hooks/usePoppedOutNotes";
import { CompactView } from "./components/CompactView";
import { ErrorBanner } from "./components/ErrorBanner";
import { BootLoader } from "./components/BootLoader";
import { QuickTodoEntry } from "./components/QuickTodoEntry";
import type { AiSelectionContext } from "./utils/aiContent";
import { mergeAiResult } from "./utils/aiContent";
import type { AiAction } from "./utils/aiContent";
import { formatError } from "./utils/formatError";
import { resolveImageHostProvider } from "./utils/imageHost";
import {
  getUploadingImageId,
  removeUploadingImageMarkdown,
  replaceHostedImageMarkdown,
  replaceUploadingImageMarkdown,
} from "./utils/imageUploadPlaceholder";
import { appBridge } from "./services/appBridge";
import { createAsyncUnlistenCleanup } from "./utils/asyncUnlisten";
import { aiService } from "./services/aiService";
import { assetService } from "./services/assetService";
import { configService } from "./services/configService";
import { libraryService } from "./services/libraryService";
import { messageHubService } from "./services/messageHubService";
import { notesService } from "./services/notesService";
import { siyuanService } from "./services/siyuanService";
import { noteUploadService } from "./services/noteUploadService";
import { effectiveUploadTarget, type NoteUploadConfigPatch } from "./utils/noteUpload";
import { syncService } from "./services/syncService";
import { windowService } from "./services/windowService";
import { markPerf, measureAsync } from "./utils/perf";
import { resolveEffectiveThemeMode } from "./constants/themeAccents";
import { useTabSessions } from "./hooks/useTabSessions";
import { isRootDefaultNote } from "./utils/noteWriteTarget";
import type {
  AppConfig,
  NoteSnapshot,
  NoteSummary,
  NoteTab,
  NoteZone,
  OpenTabRef,
  GlobalHotkeys,
  ThemeMode,
  ThemeStyle,
  SiyuanNotebookSummary,
  ImageHostConfigPatch,
} from "./types";
import { parseTabKey, tabKey, tabsEqual, titleFromName } from "./utils/noteTabs";
import {
  isTabPinned,
  prunePinnedTabs,
} from "./utils/tabPin";
import { validateFilenameTitle } from "./utils/filenameValidation";
import { getFolderSelection } from "./utils/librarySelection";
import "./styles/tokens.css";
import "./styles/accent-selection-ui.css";
import "./App.css";

const AiAssistPanel = lazy(() =>
  import("./components/AiAssistPanel").then((module) => ({ default: module.AiAssistPanel })),
);

const SAVE_DEBOUNCE_MS = 600;
const HISTORY_DEBOUNCE_MS = 400;
const DEFAULT_ZONE: NoteZone = "default";
const DEFAULT_NOTE_NAME = "default-note.md";
const DEFAULT_POPOUT_WIDTH = 400;
const DEFAULT_POPOUT_HEIGHT = 300;

function isDefaultNote(name: string | null) {
  return name === DEFAULT_NOTE_NAME;
}

function replaceLocalImageMarkdown(
  markdown: string,
  localRel: string,
  hostedUrl: string,
): string {
  const escapedLocalRel = localRel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return markdown.replace(
    new RegExp(`!\\[([^\\]]*)\\]\\(${escapedLocalRel}([^)]*)\\)`, "g"),
    `![$1](${hostedUrl} "mk-hosted|${localRel}")`,
  );
}

interface ActiveSessionSnapshot {
  name: string;
  zone: NoteZone;
  content: string;
  contentHash?: string;
  editorRevision: number;
  dirty: boolean;
  history: { stack: string[]; index: number };
  viewMode: "edit" | "preview";
}

async function findExistingMarkdownNote(): Promise<{ name: string; zone: NoteZone } | null> {
  const defaultNotes = await notesService.list(DEFAULT_ZONE);
  const defaultNote = defaultNotes[0];
  if (defaultNote) return { name: defaultNote.name, zone: defaultNote.zone };

  const inboxNotes = await notesService.list("inbox");
  const inboxNote = inboxNotes[0];
  if (inboxNote) return { name: inboxNote.name, zone: inboxNote.zone };

  return null;
}

function applyTheme(config: AppConfig) {
  const mode = (config.theme_mode ?? "system") as ThemeMode;
  const effective = resolveEffectiveThemeMode(mode);
  document.documentElement.setAttribute("data-theme-mode", mode);
  document.documentElement.setAttribute("data-theme", effective);
  document.documentElement.setAttribute("data-light-theme", config.light_theme ?? "mknote");
  document.documentElement.setAttribute("data-dark-theme", config.dark_theme ?? "mknote");
  document.documentElement.setAttribute("data-accent-skin", config.accent_skin ?? "mknote");
  // 缓存到 localStorage，供弹出窗口第一帧提前读取，避免闪烁
  try {
    localStorage.setItem("mk-theme", effective);
    localStorage.setItem("mk-light-theme", config.light_theme ?? "mknote");
    localStorage.setItem("mk-dark-theme", config.dark_theme ?? "mknote");
    localStorage.setItem("mk-accent-skin", config.accent_skin ?? "mknote");
  } catch { /* 存储失败不影响功能 */ }
}

function nextThemeMode(current: string): ThemeMode {
  if (current === "system") return "light";
  if (current === "light") return "dark";
  return "system";
}

function App() {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [closePinnedPrompt, setClosePinnedPrompt] = useState<OpenTabRef | null>(null);
  const [replacePinPrompt, setReplacePinPrompt] = useState<OpenTabRef | null>(null);
  const [siyuanUploading, setSiyuanUploading] = useState(false);
  const [manualSyncBusy, setManualSyncBusy] = useState(false);
  const [siyuanHint, setSiyuanHint] = useState<string | null>(null);
  useEffect(() => {
    if (!siyuanHint) return;
    const timer = window.setTimeout(() => setSiyuanHint(null), 2000);
    return () => window.clearTimeout(timer);
  }, [siyuanHint]);
  const [searchOmniboxOpen, setSearchOmniboxOpen] = useState(false);
  const [captureToast, setCaptureToast] = useState<string | null>(null);
  const [backlinks, setBacklinks] = useState<NoteSummary[]>([]);
  const [aiAssistOpen, setAiAssistOpen] = useState(false);
  const [aiSelection, setAiSelection] = useState<AiSelectionContext | null>(null);
  const [classificationBusy, setClassificationBusy] = useState(false);
  const classificationPending = useRef(new Set<string>());
  const closingTabs = useRef(new Set<string>());
  const [defaultNoteOpen, setDefaultNoteOpen] = useState(false);
  const defaultNoteOpenRef = useRef(false);
  const [windowFocusRevision, setWindowFocusRevision] = useState(0);

  const {
    inboxNotes,
    folders,
    noteColors,
    libraryNotes,
    libraryZone,
    activeColor,
    customTags,
    siyuanSyncedNotes,
    setActiveColor,
    refreshNoteColors,
    refreshZone,
    refreshLibrary,
    refreshCustomTags,
    refreshSiyuanSyncedNotes,
  } = useLibraryData();

  const {
    poppedOutNotes,
    isPoppedOut,
    markPoppedOut,
    removePoppedOut,
    renamePoppedOut,
  } = usePoppedOutNotes();

  useEffect(() => {
    for (const session of config?.popout_sessions ?? []) {
      markPoppedOut(session.zone, session.name);
    }
    for (const session of config?.capsule_sessions ?? []) {
      markPoppedOut(session.zone, session.name);
    }
  }, [config?.popout_sessions, config?.capsule_sessions, markPoppedOut]);

  // ── 隐私模式状态 ────────────────────────────────────────────────────────
  const [privateModeActive, setPrivateModeActive] = useState(false);
  const [privateContent, setPrivateContent] = useState("");
  const [privateContentRevision, setPrivateContentRevision] = useState(0);
  const privateNoteRef = useRef<string | null>(null);
  const privateContentRef = useRef("");
  const privateContentHashRef = useRef<string | undefined>(undefined);
  const privateEditorRevisionRef = useRef(0);
  const privateDirtyRef = useRef(false);

  const {
    activeNote,
    setActiveNote,
    activeZone,
    setActiveZone,
    activeNoteColor,
    setActiveNoteColor,
    content,
    setContent,
    dirty,
    setDirty,
    saveStatus,
    setSaveStatus,
    viewMode,
    setViewMode,
    contentRevision,
    setContentRevision,
    contentRef,
    activeNoteRef,
    activeZoneRef,
    dirtyRef,
    viewModeRef,
  } = useNoteSessionState({ defaultZone: DEFAULT_ZONE });

  const switchSeqRef = useRef(0);
  const debouncedSaveRef = useRef<() => void>(() => {});
  const inputPerfLastMarkRef = useRef(0);
  const tabSessions = useTabSessions();
  const diskContentHashRef = useRef<string | undefined>(undefined);
  const editorRevisionRef = useRef(0);
  const lastRegularNoteRef = useRef<{ name: string; zone: NoteZone } | null>(null);
  const {
    reset: resetHistory,
    push: pushHistory,
    undo: undoHistory,
    redo: redoHistory,
    getState: getHistoryState,
    loadState: loadHistoryState,
  } = useEditorHistory();
  const refreshAgentIndex = useAgentIndexRefresh();
  const applyPersistedTabsConfig = useCallback((nextConfig: AppConfig) => {
    setConfig((prev) =>
      prev
        ? {
            ...nextConfig,
            recent_notes: nextConfig.recent_notes ?? prev.recent_notes,
          }
        : nextConfig,
    );
  }, []);
  const handleTabPersistError = useCallback((error: unknown) => {
    setError(formatError(error));
  }, []);
  const {
    openTabs,
    setOpenTabs,
    openTabsRef,
    pinnedTabs,
    pinnedTabsRef,
    pinnedTabLimitRef,
    tabVisitOrderRef,
    setPinnedTabs,
    commitOpenTabs,
    recordTabVisit,
    getTabAfterClose,
    schedulePersistTabs,
    persistOpenTabsNow,
  } = useOpenTabsController({
    config,
    onPersistedConfig: applyPersistedTabsConfig,
    onPersistError: handleTabPersistError,
  });
  const openSearchOmnibox = useCallback(() => setSearchOmniboxOpen(true), []);
  const bumpWindowFocusRevision = useCallback(() => setWindowFocusRevision((n) => n + 1), []);
  useGlobalInteractionGuards({ onOpenSearch: openSearchOmnibox });

  useEffect(() => {
    if (!config?.sync_enabled || !config.sync_initialized) return;
    const intervalSeconds = Math.min(Math.max(config.sync_poll_interval_secs ?? 20, 10), 300);
    const runSyncTick = () => {
      void syncService.tick(isDefaultNote(activeNoteRef.current) && dirtyRef.current).catch(() => {
        // 同步失败不影响本地编辑；下一次轮询或焦点事件会继续重试。
      });
    };
    runSyncTick();
    const timer = window.setInterval(runSyncTick, intervalSeconds * 1000);
    return () => window.clearInterval(timer);
  }, [config?.sync_enabled, config?.sync_initialized, config?.sync_poll_interval_secs]);

  useEffect(() => {
    if (!config?.sync_enabled || !config.sync_initialized || windowFocusRevision === 0) return;
    void syncService.tick(isDefaultNote(activeNoteRef.current) && dirtyRef.current).catch(() => {
      // 焦点检查失败时保留本地状态，交给后续轮询重试。
    });
  }, [config?.sync_enabled, config?.sync_initialized, windowFocusRevision]);


  const recordRecentNote = useCallback(async (zone: NoteZone, name: string) => {
    if (!name.trim()) return;
    try {
      const cfg = await configService.recordRecentNote(zone, name);
      setConfig(cfg);
    } catch (e) {
      setError(formatError(e));
    }
  }, []);

  const snapshotActiveSession = useCallback((): ActiveSessionSnapshot | null => {
    const name = activeNoteRef.current;
    const zone = activeZoneRef.current;
    if (!name) return null;
    return {
      name,
      zone,
      content: contentRef.current,
      contentHash: diskContentHashRef.current,
      editorRevision: editorRevisionRef.current,
      dirty: dirtyRef.current,
      history: getHistoryState(),
      viewMode: viewModeRef.current,
    };
  }, [getHistoryState]);

  const queuedNoteWriter = useQueuedNoteWriter(async ({ zone, name, text, expectedContentHash }) => {
    if (isRootDefaultNote({ zone, name, defaultNoteOpen: defaultNoteOpenRef.current })) {
      return notesService.writeDefault(text, expectedContentHash);
    } else {
      return notesService.write(zone, name, text, expectedContentHash);
    }
  });

  const writeNoteQueued = useCallback(
    async (
      zone: NoteZone,
      name: string,
      text: string,
      options: { expectedContentHash?: string; editorRevision?: number } = {},
    ) => measureAsync(
      "writeNoteQueued",
      () => queuedNoteWriter({
        zone,
        name,
        text,
        expectedContentHash: options.expectedContentHash,
        editorRevision: options.editorRevision ?? editorRevisionRef.current,
      }),
      { zone, isDefaultNote: isDefaultNote(name) },
    ),
    [queuedNoteWriter],
  );

  const persistNote = useCallback(
    async (
      name: string,
      zone: NoteZone,
      text: string,
      options: { expectedContentHash?: string; editorRevision?: number } = {},
    ) => {
      setSaveStatus("saving");
      try {
        const revision = await writeNoteQueued(zone, name, text, options);
        const session = tabSessions.get(zone, name);
        if (session) {
          tabSessions.set(zone, name, {
            ...session,
            contentHash: revision.contentHash,
          });
        }
        const stillSameNote =
          activeNoteRef.current === name && activeZoneRef.current === zone;
        if (stillSameNote) {
          diskContentHashRef.current = revision.contentHash;
        }
        const stillSameContent = contentRef.current === text;
        if (stillSameNote && stillSameContent) {
          setDirty(false);
          setSaveStatus("saved");
        } else if (stillSameNote) {
          setDirty(true);
          setSaveStatus("idle");
          debouncedSaveRef.current();
        }
      } catch (e) {
        setSaveStatus("error");
        setError(formatError(e));
        throw e;
      }
    },
    [tabSessions, writeNoteQueued],
  );

  const flushSave = useCallback(async () => measureAsync("flushSave", async () => {
    const name = activeNoteRef.current;
    const zone = activeZoneRef.current;
    if (!name || !dirtyRef.current) return;
    const text = contentRef.current;
    await persistNote(name, zone, text, {
      expectedContentHash: diskContentHashRef.current,
      editorRevision: editorRevisionRef.current,
    });
    const session = tabSessions.get(zone, name);
    if (session && contentRef.current === text) {
      tabSessions.set(zone, name, { ...session, dirty: false, content: text });
    }
  }, {
    zone: activeZoneRef.current,
    hasActiveNote: Boolean(activeNoteRef.current),
    dirty: dirtyRef.current,
  }), [persistNote, tabSessions]);

  const flushTab = useCallback(
    async (zone: NoteZone, name: string) => {
    const isActive =
      activeNoteRef.current === name && activeZoneRef.current === zone;
    let text: string | undefined;
    let isDirty = false;
    const session = tabSessions.get(zone, name);
      if (isActive) {
        if (!dirtyRef.current) return;
        text = contentRef.current;
        isDirty = true;
    } else {
      if (!session?.dirty) return;
        text = session.content;
        isDirty = true;
    }
    if (!isDirty || text === undefined) return;
    let savedContentHash: string | undefined;
    try {
      const revision = await writeNoteQueued(zone, name, text, {
        expectedContentHash: isActive ? diskContentHashRef.current : session?.contentHash,
        editorRevision: isActive ? editorRevisionRef.current : session?.editorRevision,
      });
      savedContentHash = revision.contentHash;
      if (isActive) {
        diskContentHashRef.current = savedContentHash;
      }
      } catch (e) {
        setSaveStatus("error");
        setError(`保存「${titleFromName(name)}」失败：${formatError(e)}`);
        throw e;
      }
      if (isActive) {
        if (
          activeNoteRef.current === name &&
          activeZoneRef.current === zone &&
          contentRef.current === text
        ) {
          setDirty(false);
          setSaveStatus("saved");
        }
      }
    if (session) {
      tabSessions.set(zone, name, {
        ...session,
        content: text,
        contentHash: savedContentHash ?? session.contentHash,
        dirty: false,
      });
    }
    },
    [tabSessions, writeNoteQueued],
  );

  const flushPrivateNote = useCallback(async () => {
    const name = privateNoteRef.current;
    if (!name || !privateDirtyRef.current) return;
    const text = privateContentRef.current;
    try {
      const revision = await writeNoteQueued("private", name, text, {
        expectedContentHash: privateContentHashRef.current,
        editorRevision: privateEditorRevisionRef.current,
      });
      privateContentHashRef.current = revision.contentHash;
      if (privateContentRef.current === text) {
        privateDirtyRef.current = false;
      }
    } catch (e) {
      setError(formatError(e));
      throw e;
    }
  }, [writeNoteQueued]);

  const [debouncedSave, cancelDebouncedSave] = useDebouncedCallback(() => {
    void flushSave();
  }, SAVE_DEBOUNCE_MS);
  debouncedSaveRef.current = debouncedSave;

  const [debouncedHistoryPush, cancelDebouncedHistory] = useDebouncedCallback(
    (value: string) => {
      pushHistory(value);
    },
    HISTORY_DEBOUNCE_MS,
  );

  const flushAllDirty = useCallback(async (): Promise<boolean> => {
    cancelDebouncedSave();
    const work = async () => {
      if (privateDirtyRef.current) {
        await flushPrivateNote();
      }
      await flushSave();
      const tabs = openTabsRef.current;
      for (const tab of tabs) {
        await flushTab(tab.zone, tab.name);
      }
    };
    try {
      await Promise.race([
        work(),
        new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error("保存超时，请稍后重试")), 5000);
        }),
      ]);
      return true;
    } catch (e) {
      setSaveStatus("error");
      setError(formatError(e) || "保存超时，已取消操作以避免数据丢失");
      return false;
    }
  }, [flushPrivateNote, flushSave, flushTab, cancelDebouncedSave]);

  const flushBeforeNavigation = useCallback(async (): Promise<boolean> => {
    cancelDebouncedSave();
    const from = snapshotActiveSession();
    if (!from) return true;

    const currentIsRootDefault = isRootDefaultNote({
      zone: from.zone,
      name: from.name,
      defaultNoteOpen: defaultNoteOpenRef.current,
    });
    const stillOpen =
      !currentIsRootDefault &&
      openTabsRef.current.some((t) => tabsEqual(t, from.zone, from.name));
    if (!stillOpen) return true;

    if (!from.dirty) {
      tabSessions.set(from.zone, from.name, {
        content: from.content,
        contentHash: from.contentHash,
        editorRevision: from.editorRevision,
        dirty: false,
        history: from.history,
        viewMode: from.viewMode,
      });
      return true;
    }
    try {
      setSaveStatus("saving");
      const revision = await writeNoteQueued(from.zone, from.name, from.content, {
        expectedContentHash: from.contentHash,
        editorRevision: from.editorRevision,
      });
      tabSessions.set(from.zone, from.name, {
        content: from.content,
        contentHash: revision.contentHash,
        editorRevision: from.editorRevision,
        dirty: false,
        history: from.history,
        viewMode: from.viewMode,
      });
      const stillActive =
        activeNoteRef.current === from.name && activeZoneRef.current === from.zone;
      if (stillActive) {
        diskContentHashRef.current = revision.contentHash;
      }
      if (stillActive && contentRef.current === from.content) {
        setDirty(false);
        setSaveStatus("saved");
      }
      return true;
    } catch (e) {
      setSaveStatus("error");
      setError(formatError(e));
      return false;
    }
  }, [cancelDebouncedSave, snapshotActiveSession, tabSessions, writeNoteQueued]);

  const refreshAll = useCallback(async () => {
    await measureAsync("refreshAll", async () => {
      await Promise.all([
        refreshZone("inbox"),
        refreshZone("default"),
        refreshLibrary(),
        refreshNoteColors(),
        refreshCustomTags(),
        refreshSiyuanSyncedNotes(),
        refreshAgentIndex().catch(() => undefined),
      ]);
    });
  }, [
    refreshZone,
    refreshLibrary,
    refreshNoteColors,
    refreshCustomTags,
    refreshSiyuanSyncedNotes,
    refreshAgentIndex,
  ]);

  const refreshAfterStructureChange = useCallback(
    async (label: string, refresh?: () => Promise<unknown>) => {
      await measureAsync("refreshAfterStructureChange", async () => {
        if (refresh) await refresh();
        await refreshAgentIndex().catch(() => undefined);
      }, { label });
    },
    [refreshAgentIndex],
  );

  const applyNoteToEditor = useCallback(
    (
      name: string,
      zone: NoteZone,
    text: string,
    options: {
      color: string | null;
      contentHash?: string;
      editorRevision?: number;
      session?: { dirty: boolean; history: { stack: string[]; index: number }; viewMode?: "edit" | "preview" };
        forceEditMode?: boolean;
      },
    ) => {
      cancelDebouncedSave();
      cancelDebouncedHistory();
    // 切换到尚未缓存的笔记时也保留当前编辑模式；否则 visual Beta 的 Wikilink
    // 导航会先切换内容，再把目标笔记错误地降回旧 Markdown 编辑器。
    setViewMode(options.forceEditMode ? "edit" : options.session?.viewMode ?? viewModeRef.current);
      setActiveNote(name);
      setActiveZone(zone);
      defaultNoteOpenRef.current = false;
        setDefaultNoteOpen(false);
      lastRegularNoteRef.current = { name, zone };
    setActiveNoteColor(options.color);
    setContent(text);
    contentRef.current = text;
    diskContentHashRef.current = options.contentHash;
    editorRevisionRef.current = options.editorRevision ?? 0;
      if (options.session) {
        loadHistoryState(options.session.history.stack, options.session.history.index);
        setDirty(options.session.dirty);
      } else {
        resetHistory(text);
        setDirty(false);
      }
      setSaveStatus("idle");
      setContentRevision((n) => n + 1);
    },
    [resetHistory, loadHistoryState, cancelDebouncedSave, cancelDebouncedHistory],
  );

  useEffect(() => {
    const unsubs = [
      createAsyncUnlistenCleanup(appBridge.listen("mknote:sync-local-changed", () => {
        void syncService.tick(isDefaultNote(activeNoteRef.current) && dirtyRef.current).catch(() => undefined);
      })),
      createAsyncUnlistenCleanup(appBridge.listen("mknote:quick-todo-changed:default", () => {
        void syncService.tick(isDefaultNote(activeNoteRef.current) && dirtyRef.current).catch(() => undefined);
      })),
      createAsyncUnlistenCleanup(appBridge.listen("mknote:quick-pocket-changed:default", () => {
        void syncService.tick(isDefaultNote(activeNoteRef.current) && dirtyRef.current).catch(() => undefined);
      })),
      createAsyncUnlistenCleanup(appBridge.listen("mknote:default-note-changed", async () => {
        if (!isDefaultNote(activeNoteRef.current) || dirtyRef.current) return;
        try {
        const snapshot = await notesService.readDefaultSnapshot();
        if (!isDefaultNote(activeNoteRef.current) || dirtyRef.current) return;
        contentRef.current = snapshot.content;
        diskContentHashRef.current = snapshot.contentHash;
        editorRevisionRef.current = 0;
        setContent(snapshot.content);
        resetHistory(snapshot.content);
          setDirty(false);
          setSaveStatus("idle");
          setContentRevision((revision) => revision + 1);
        } catch {
          // 远端刷新失败不影响当前编辑内容；下一次打开或轮询继续恢复。
        }
      })),
    ];
    return () => unsubs.forEach((unlisten) => unlisten());
  }, [resetHistory]);

  const switchToTab = useCallback(
    async (zone: NoteZone, name: string) => {
      const seq = ++switchSeqRef.current;
    if (
      activeNoteRef.current === name &&
      activeZoneRef.current === zone &&
      !defaultNoteOpenRef.current
    ) {
      return;
    }
      const prevName = activeNoteRef.current;
      const prevZone = activeZoneRef.current;
      if (
        prevName &&
        prevZone &&
        openTabsRef.current.some((t) => tabsEqual(t, prevZone, prevName))
      ) {
        recordTabVisit(prevZone, prevName);
      }
      if (!(await flushBeforeNavigation())) return;
      if (seq !== switchSeqRef.current) return;

    const session = tabSessions.get(zone, name);
    let text: string;
    let contentHash = session?.contentHash;
    let editorRevision = session?.editorRevision;
    if (session) {
      text = session.content;
    } else {
      const snapshot = await notesService.readSnapshot(zone, name);
      text = snapshot.content;
      contentHash = snapshot.contentHash;
      editorRevision = 0;
      }
      if (seq !== switchSeqRef.current) return;

      // Open tabs already receive color updates from local actions and note events.
      // Avoid a directory scan on the critical path of every tab switch.
      const color = openTabsRef.current.find((tab) => tabsEqual(tab, zone, name))?.color ?? null;

    applyNoteToEditor(name, zone, text, {
      color,
      contentHash,
      editorRevision,
      session: session
          ? { dirty: session.dirty, history: session.history, viewMode: session.viewMode }
          : undefined,
      });
    defaultNoteOpenRef.current = false;
    setDefaultNoteOpen(false);
      schedulePersistTabs(openTabsRef.current, zone, name);
      void recordRecentNote(zone, name);
      setError(null);
    },
    [
      flushBeforeNavigation,
      tabSessions,
      applyNoteToEditor,
      schedulePersistTabs,
      recordRecentNote,
      recordTabVisit,
    ],
  );

  const addTabAndActivate = useCallback(
    async (note: NoteSummary, source: string | NoteSnapshot, tabsOverride?: NoteTab[]) => {
      const seq = ++switchSeqRef.current;
      if (!(await flushBeforeNavigation())) return;
      if (seq !== switchSeqRef.current) return;

      const zone = note.zone as NoteZone;
      const tab: NoteTab = { zone, name: note.name, title: note.title, color: note.color ?? null };
      const base = tabsOverride ?? openTabsRef.current;
      const exists = base.some((t) => tabsEqual(t, zone, note.name));
      const nextTabs = exists
        ? base.map((t) => (tabsEqual(t, zone, note.name) ? { ...t, title: note.title, color: note.color ?? null } : t))
      : [...base, tab];
      commitOpenTabs(nextTabs);
      const text = typeof source === "string" ? source : source.content;
      applyNoteToEditor(note.name, zone, text, {
        color: note.color ?? null,
        contentHash: typeof source === "string" ? undefined : source.contentHash,
        editorRevision: 0,
      });
      schedulePersistTabs(nextTabs, zone, note.name);
      void recordRecentNote(zone, note.name);
    },
    [flushBeforeNavigation, applyNoteToEditor, schedulePersistTabs, recordRecentNote, commitOpenTabs],
  );

  const openCreatedNote = useCallback(
    async (note: NoteSummary, source: string | NoteSnapshot) => {
      const snapshot = typeof source === "string"
        ? await notesService.readSnapshot(note.zone, note.name)
        : source;
      await addTabAndActivate(note, snapshot);
    },
    [addTabAndActivate],
  );

  const loadNote = useCallback(
    async (name: string, zone: NoteZone, options?: { skipTabList?: boolean }) => measureAsync("loadNote", async () => {
    const snapshot = await notesService.readSnapshot(zone, name);
      const notes = await notesService.list(zone);
      const color = notes.find((n) => n.name === name)?.color ?? null;
      const title = notes.find((n) => n.name === name)?.title ?? titleFromName(name);

      if (!options?.skipTabList) {
        const base = openTabsRef.current;
        const exists = base.some((t) => tabsEqual(t, zone, name));
        const nextTabs = exists
          ? base.map((t) => (tabsEqual(t, zone, name) ? { ...t, title, color } : t))
          : [...base, { zone, name, title, color }];
        commitOpenTabs(nextTabs);
        schedulePersistTabs(nextTabs, zone, name);
      }

    applyNoteToEditor(name, zone, snapshot.content, {
      color,
      contentHash: snapshot.contentHash,
      editorRevision: 0,
    });
      await configService.setLastNoteFile(name, zone);
      await recordRecentNote(zone, name);
      void notesService.findBacklinks(titleFromName(name)).then(setBacklinks);
    }, { zone, skipTabList: Boolean(options?.skipTabList) }),
    [applyNoteToEditor, schedulePersistTabs, commitOpenTabs, recordRecentNote],
  );

  const initStartedRef = useRef(false);

  const restoreTabsFromConfig = useCallback(
    async (
      saved: OpenTabRef[] | null | undefined,
      activeZone: NoteZone,
      activeName: string | null,
      savedPinned?: OpenTabRef[] | null,
    ) => measureAsync("restoreTabsFromConfig", async () => {
      // 并行验证所有 tab，避免 N 次串行 IPC
      const candidates = saved ?? [];
      const results = await Promise.allSettled(
        candidates.map(async (ref) => {
          // read_note 验证文件存在；list_notes 获取 title，两个并行
          const [, noteList] = await Promise.all([
            notesService.read(ref.zone, ref.name),
            notesService.list(ref.zone),
          ]);
          const title = noteList.find((n) => n.name === ref.name)?.title ?? titleFromName(ref.name);
          return { zone: ref.zone as NoteZone, name: ref.name, title };
        }),
      );

      const restored: NoteTab[] = [];
      let skipped = 0;
      for (const r of results) {
        if (r.status === "fulfilled") {
          restored.push(r.value);
        } else {
          skipped += 1;
        }
      }

      if (!restored.length) {
        const existing = await findExistingMarkdownNote();
        if (existing) {
          const noteList = await notesService.list(existing.zone);
          const title = noteList.find((n) => n.name === existing.name)?.title ?? titleFromName(existing.name);
          restored.push({ zone: existing.zone, name: existing.name, title });
        }
      }

      if (!restored.length) {
        commitOpenTabs([]);
        setActiveNote(null);
        setActiveZone(DEFAULT_ZONE);
        setActiveNoteColor(null);
        setContent("");
        contentRef.current = "";
        resetHistory("");
        setDirty(false);
        setSaveStatus("idle");
        return restored;
      }

      const pinned = prunePinnedTabs(savedPinned ?? [], restored);
      setPinnedTabs(pinned);
      tabVisitOrderRef.current = restored.map((t) => tabKey(t.zone, t.name));

      commitOpenTabs(restored);

      let target = restored.find((t) => t.name === activeName && t.zone === activeZone);
      if (!target) target = restored[0];
      if (target) {
        const key = tabKey(target.zone, target.name);
        tabVisitOrderRef.current = tabVisitOrderRef.current.filter((k) => k !== key);
        tabVisitOrderRef.current.push(key);
      }
      await loadNote(target.name, target.zone, { skipTabList: true });
      schedulePersistTabs(restored, target.zone, target.name);
      await recordRecentNote(target.zone, target.name);

      if (skipped > 0) {
        setError(`已跳过 ${skipped} 个不存在的笔记标签`);
      }
      return restored;
    }, { savedCount: saved?.length ?? 0, pinnedCount: savedPinned?.length ?? 0 }),
    [loadNote, schedulePersistTabs, commitOpenTabs, recordRecentNote, resetHistory, setPinnedTabs],
  );

  const showDefaultMarkdownEditor = useCallback(async () => measureAsync("showDefaultMarkdownEditor", async () => {
    setLibraryOpen(false);
    setActiveColor(null);

    const currentName = activeNoteRef.current;
    if (currentName) return;

    // 需要切换到一个普通笔记，此时重置为编辑模式
    setViewMode("edit");
    const target = lastRegularNoteRef.current ?? (await findExistingMarkdownNote());
    if (!target) return;

    const inTabs = openTabsRef.current.find((t) => tabsEqual(t, target.zone, target.name));
    if (inTabs) await switchToTab(target.zone, target.name);
    else await loadNote(target.name, target.zone);
  }, {}), [loadNote, switchToTab]);

  useAppShellEffects({
    config,
    applyTheme,
    onConfigLoaded: setConfig,
    onWindowFocusRevision: bumpWindowFocusRevision,
    onShowDefaultMarkdownEditor: showDefaultMarkdownEditor,
  });

  const returnPoppedOutTabToMain = useCallback(
    async (zone: NoteZone, name: string) => {
      if (!isPoppedOut(zone, name)) return;

      tabSessions.remove(zone, name);
      removePoppedOut(zone, name);

      try {
        const notes = await notesService.list(zone);
        const meta = notes.find((note) => note.name === name);
        if (!meta) return;

        const currentTabs = openTabsRef.current;
        if (currentTabs.some((tab) => tab.zone === zone && tab.name === name)) return;

        const nextTabs: NoteTab[] = [
          ...currentTabs,
          { zone, name, title: meta.title, color: meta.color ?? null },
        ];
        // 通过统一提交恢复 pinned 标记；pinnedTabs 中的引用在 Popout 期间一直保留。
        commitOpenTabs(nextTabs);

        if (activeNoteRef.current === name && activeZoneRef.current === zone) {
          try {
            const fresh = await notesService.readSnapshot(zone, name);
            applyNoteToEditor(name, zone, fresh.content, {
              color: meta.color ?? null,
              contentHash: fresh.contentHash,
              editorRevision: 0,
            });
          } catch {
            /* 读盘失败则保持现状 */
          }
        }

        void configService.setOpenTabs({
          tabs: nextTabs.map((tab) => ({ zone: tab.zone, name: tab.name })),
          activeZone: activeZoneRef.current,
          activeName: activeNoteRef.current ?? "",
          pinnedTabs: pinnedTabsRef.current,
        }).catch(() => undefined);
      } catch {
        /* Tab 归还失败不影响主窗口继续使用 */
      }
    },
    [
      activeNoteRef,
      activeZoneRef,
      applyNoteToEditor,
      isPoppedOut,
      openTabsRef,
      pinnedTabsRef,
      removePoppedOut,
      commitOpenTabs,
      tabSessions,
    ],
  );

  useEffect(() => {
    if (initStartedRef.current) return;
    initStartedRef.current = true;

    let cancelled = false;
    void (async () => {
      try {
        const state = await configService.getAppState();
        if (cancelled) return;

        setConfig(state.config);
        applyTheme(state.config);
        setLoading(false);
        // 窗口已在挂载后立即显示；这里继续完成配置和笔记恢复。

        // refreshAll 和 tab 恢复并行启动，互不阻塞
        void refreshAll();

        const zone = (state.config.last_note_zone as NoteZone) || DEFAULT_ZONE;
        const target = state.config.last_note ?? null;
        try {
          await restoreTabsFromConfig(
            state.config.open_tabs,
            target ? zone : DEFAULT_ZONE,
            target,
            state.config.pinned_tabs,
          );
        } catch (e) {
          if (!cancelled) {
            setError(formatError(e));
            const existing = await findExistingMarkdownNote();
            if (existing) {
              await restoreTabsFromConfig(null, existing.zone, existing.name);
            } else {
              commitOpenTabs([]);
              setActiveNote(null);
            }
          }
        }
      } catch (e) {
        if (!cancelled) {
          setError(formatError(e));
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // 仅挂载时初始化一次，避免 initFromState 引用变化导致重复拉取状态卡死
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const unsubs: Array<() => void> = [];
    unsubs.push(createAsyncUnlistenCleanup(appBridge.listen("mknote:request-hide", () => {
      void (async () => {
        if (!(await flushAllDirty())) return;
        await appBridge.window.hide();
      })();
    })));
    unsubs.push(createAsyncUnlistenCleanup(appBridge.listen("mknote:request-quit", () => {
      void (async () => {
        if (!(await flushAllDirty())) return;
        await windowService.exitApp();
      })();
    })));
    unsubs.push(createAsyncUnlistenCleanup(appBridge.listen("mknote:open-search", () => {
      setSearchOmniboxOpen(true);
    })));
    unsubs.push(createAsyncUnlistenCleanup(appBridge.listen<string>("mknote:new-note", (e) => {
      const zone = (e.payload === "inbox" ? "inbox" : "default") as NoteZone;
      void handleCreate(zone);
    })));
    unsubs.push(createAsyncUnlistenCleanup(appBridge.listen("mknote:capture-created", (e) => {
      const note = e.payload as NoteSummary;
      void (async () => {
        setCaptureToast(`已保存到 Inbox：${note.title}`);
        try {
          await refreshZone("inbox");
          const snapshot = await notesService.readSnapshot(note.zone, note.name);
          await openCreatedNote(note, snapshot);
          setViewMode("preview");
          setError(null);
        } catch (err) {
          setError(formatError(err));
        }
        setTimeout(() => setCaptureToast(null), 3000);
      })();
    })));
    const handlePoppedOutClosed = (event: { payload: { zone: string; name: string } }) => {
      void returnPoppedOutTabToMain(event.payload.zone as NoteZone, event.payload.name);
    };
    const handlePoppedOutDeleted = (event: { payload: { zone: string; name: string } }) => {
      const zone = event.payload.zone as NoteZone;
      const name = event.payload.name;
      removePoppedOut(zone, name);
      tabSessions.remove(zone, name);

      const nextTabs = openTabsRef.current.filter((tab) => !tabsEqual(tab, zone, name));
      const nextPinned = pinnedTabsRef.current.filter(
        (tab) => !(tab.zone === zone && tab.name === name),
      );
      setPinnedTabs(nextPinned);
      tabVisitOrderRef.current = tabVisitOrderRef.current.filter((key) => key !== tabKey(zone, name));
      commitOpenTabs(nextTabs);
      void configService.setOpenTabs({
        tabs: nextTabs.map((tab) => ({ zone: tab.zone, name: tab.name })),
        activeZone: activeZoneRef.current,
        activeName: activeNoteRef.current ?? "",
        pinnedTabs: nextPinned,
      }).catch(() => undefined);
      // Popout 删除只改变资料库内容；避免刷新全部区域触发主窗口导航状态竞态。
      void refreshLibrary().catch(() => undefined);
    };
    const handleCompletedArchived = (event: {
      payload: { fromZone: string; fromName: string; note: NoteSummary };
    }) => {
      const { fromZone, fromName, note } = event.payload;
      const sourceZone = fromZone as NoteZone;
      const targetZone = note.zone as NoteZone;
      removePoppedOut(sourceZone, fromName);
      tabSessions.migrateKeyZone(sourceZone, fromName, targetZone, note.name);

      const nextTabs = openTabsRef.current.map((tab) =>
        tabsEqual(tab, sourceZone, fromName)
          ? {
              zone: targetZone,
              name: note.name,
              title: note.title,
              color: note.color ?? null,
            }
          : tab,
      );
      const nextPinned = pinnedTabsRef.current.map((tab) =>
        tab.zone === sourceZone && tab.name === fromName
          ? { zone: targetZone, name: note.name }
          : tab,
      );
      setPinnedTabs(nextPinned);
      commitOpenTabs(nextTabs);
      tabVisitOrderRef.current = tabVisitOrderRef.current.map((key) => {
        const parsed = parseTabKey(key);
        return parsed.zone === sourceZone && parsed.name === fromName
          ? tabKey(targetZone, note.name)
          : key;
      });

      if (activeNoteRef.current === fromName && activeZoneRef.current === sourceZone) {
        setActiveZone(targetZone);
        setActiveNote(note.name);
        setActiveNoteColor(note.color ?? null);
      }
      const persistActiveZone =
        activeNoteRef.current === fromName && activeZoneRef.current === sourceZone
          ? targetZone
          : activeZoneRef.current;
      const persistActiveName =
        activeNoteRef.current === fromName && activeZoneRef.current === sourceZone
          ? note.name
          : activeNoteRef.current ?? "";

      void configService.setOpenTabs({
        tabs: nextTabs.map((tab) => ({ zone: tab.zone, name: tab.name })),
        activeZone: persistActiveZone,
        activeName: persistActiveName,
        pinnedTabs: nextPinned,
      }).catch(() => undefined);
      void refreshAll().catch(() => undefined);
      void refreshAgentIndex().catch(() => undefined);
    };
    const handlePoppedOutRenamed = (event: {
      payload: { zone: string; oldName: string; newName: string; title: string };
    }) => {
      const { zone, oldName, newName, title } = event.payload;
      const noteZone = zone as NoteZone;
      if (!oldName || !newName || oldName === newName) return;

      renamePoppedOut(noteZone, oldName, newName);
      tabSessions.renameKey(noteZone, oldName, newName);

      const nextTabs = openTabsRef.current.map((tab) =>
        tabsEqual(tab, noteZone, oldName)
          ? { ...tab, name: newName, title }
          : tab,
      );
      setOpenTabs(nextTabs);
      openTabsRef.current = nextTabs;

      const nextPinned = pinnedTabsRef.current.map((tab) =>
        tab.zone === noteZone && tab.name === oldName
          ? { zone: noteZone, name: newName }
          : tab,
      );
      setPinnedTabs(nextPinned);
      pinnedTabsRef.current = nextPinned;

      tabVisitOrderRef.current = tabVisitOrderRef.current.map((key) => {
        const parsed = parseTabKey(key);
        return parsed.zone === noteZone && parsed.name === oldName
          ? tabKey(noteZone, newName)
          : key;
      });

      void configService.setOpenTabs({
        tabs: nextTabs
          .filter((tab) => !(tab.zone === noteZone && tab.name === newName))
          .filter((tab) => !isPoppedOut(tab.zone, tab.name))
          .map((tab) => ({ zone: tab.zone, name: tab.name })),
        activeZone: activeZoneRef.current,
        activeName: activeNoteRef.current ?? "",
        pinnedTabs: nextPinned,
      }).catch(() => undefined);
    };
    unsubs.push(createAsyncUnlistenCleanup(appBridge.listen<{ zone: string; name: string }>("mknote:popout-closed", handlePoppedOutClosed)));
    unsubs.push(createAsyncUnlistenCleanup(appBridge.listen<{ zone: string; name: string }>(
      "mknote:popout-note-deleted",
      handlePoppedOutDeleted,
    )));
    unsubs.push(createAsyncUnlistenCleanup(appBridge.listen<{ zone: string; name: string }>("mknote:capsule-closed", handlePoppedOutClosed)));
    unsubs.push(createAsyncUnlistenCleanup(appBridge.listen<{ fromZone: string; fromName: string; note: NoteSummary }>(
      "mknote:note-completed-archived",
      handleCompletedArchived,
    )));
    unsubs.push(createAsyncUnlistenCleanup(appBridge.listen<{ zone: string; oldName: string; newName: string; title: string }>(
      "mknote:popped-out-renamed",
      handlePoppedOutRenamed,
    )));
    return () => {
      unsubs.forEach((fn) => fn());
    };
  }, [flushAllDirty, refreshZone, refreshAll, refreshLibrary, openCreatedNote, removePoppedOut, tabSessions, setPinnedTabs, commitOpenTabs, refreshAgentIndex]);

  // ── 打开胶囊：将当前活跃笔记以胶囊形式显示在主窗口上方 ──────────────────
  const handleOpenCapsule = useCallback(async () => {
    if (!config) return;
    const name = activeNoteRef.current;
    const zone = activeZoneRef.current;
    if (!name || !zone) return;

    // 已弹出则不重复
    if (isPoppedOut(zone as NoteZone, name)) return;

    const titleVal =
      openTabsRef.current.find((t) => t.zone === zone && t.name === name)?.title ??
      titleFromName(name);

  try {
    await flushSave();
  } catch {
    return;
  }

    // 立即把该笔记从主窗口移出（同 handlePopoutTab）
    markPoppedOut(zone as NoteZone, name);
    tabSessions.remove(zone as NoteZone, name);

    // 切走到下一个 Tab
    if (activeNoteRef.current === name && activeZoneRef.current === zone) {
      const nextTab = getTabAfterClose(zone as NoteZone, name);
      if (nextTab) {
        void switchToTab(nextTab.zone, nextTab.name).catch(() => undefined);
      } else {
        void handleOpenDefaultNote().catch(() => undefined);
      }
    }

    void (async () => {
      try {
        const win = appBridge.window.current();
        // 并行：获取窗口位置 + 获取笔记颜色
        const [scaleVal, posVal, notesVal] = await Promise.all([
          win.scaleFactor(),
          win.outerPosition(),
          notesService.list(zone).catch(() => []),
        ]);
        const anchorX = posVal.x / scaleVal;
        const anchorY = posVal.y / scaleVal;
        const noteColor = (notesVal as Array<{ name: string; color?: string | null }>)
          .find((n) => n.name === name)?.color ?? null;

        await windowService.openCapsule({
          zone,
          name,
          title: titleVal,
          noteColor,
          alwaysOnTop: true,
          anchorX,
          anchorY,
          source: "main",
        });
      } catch (e) {
        setError(formatError(e));
        // 还原：把 Tab 加回来
        removePoppedOut(zone as NoteZone, name);
      }

      // 持久化
      const curName = activeNoteRef.current;
      const curZone = activeZoneRef.current;
      if (curName && curZone) {
        void configService.setOpenTabs({
          tabs: openTabsRef.current
            .filter((t) => !isPoppedOut(t.zone, t.name))
            .map((t) => ({ zone: t.zone, name: t.name })),
          activeZone: curZone,
          activeName: curName,
          pinnedTabs: pinnedTabsRef.current,
        }).catch(() => undefined);
      }
    })();
  }, [config, flushSave, switchToTab, getTabAfterClose]);

  const handleContentChange = (value: string) => {
    const now = performance.now();
    if (now - inputPerfLastMarkRef.current > 1000) {
      inputPerfLastMarkRef.current = now;
      markPerf("input:contentChange", {
        length: value.length,
        zone: activeZoneRef.current,
        dirty: dirtyRef.current,
        viewMode: viewModeRef.current,
      });
    }
    editorRevisionRef.current += 1;
    contentRef.current = value;
    // Tab navigation can run in the same event as the final editor flush.
    dirtyRef.current = true;
    setContent(value);
    setDirty(true);

    setSaveStatus("idle");
    debouncedHistoryPush(value);
    debouncedSave();
  };

  const applyEditorContent = (value: string) => {
    cancelDebouncedHistory();
    editorRevisionRef.current += 1;
    contentRef.current = value;
    setContent(value);
    setDirty(true);
    setSaveStatus("idle");
    setContentRevision((n) => n + 1);
    debouncedSave();
  };

  /**
   * 图片粘贴后触发：在后台上传到当前图床，成功后用 contentRef（始终最新）替换图片引用。
   * 粘贴先落本地副本；上传失败不改变本地引用，成功后保留副本路径。
   */
  const handleImagePasted = useCallback(
    (imageRef: string, imageData: Uint8Array, ext: string) => {
      if (!config || resolveImageHostProvider(config) === "none") return;
      // 快照当前笔记身份，用于上传完成后的安全校验
      const noteAtPaste = activeNoteRef.current;
      const zoneAtPaste = activeZoneRef.current;
      const uploadingId = getUploadingImageId(imageRef);
      const filename = uploadingId
        ? `clipboard.${ext}`
        : imageRef.split("/").pop() ?? `image.${ext}`;

      assetService.uploadImage(filename, Array.from(imageData))
        .then((hostedUrl) => {
          // 笔记已切换：不修改当前内容
          if (
            activeNoteRef.current !== noteAtPaste ||
            activeZoneRef.current !== zoneAtPaste
          ) {
            return;
          }
          // 用 contentRef.current（最新值）做替换，而不是闭包快照
          const current = contentRef.current;
          const next = uploadingId
            ? replaceUploadingImageMarkdown(current, uploadingId, hostedUrl)
            : replaceLocalImageMarkdown(current, imageRef, hostedUrl);
          if (next === current) return; // 没匹配到则不更新
          contentRef.current = next;
          setContent(next);
          setDirty(true);
          setSaveStatus("idle");
          setContentRevision((n) => n + 1);
          debouncedSave();
        })
        .catch((error) => {
          setError(formatError(error));
          if (!uploadingId) return;
          if (
            activeNoteRef.current !== noteAtPaste ||
            activeZoneRef.current !== zoneAtPaste
          ) {
            return;
          }
          const current = contentRef.current;
          const next = removeUploadingImageMarkdown(current, uploadingId);
          if (next === current) return;
          contentRef.current = next;
          setContent(next);
          setDirty(true);
          setSaveStatus("idle");
          setContentRevision((n) => n + 1);
          debouncedSave();
        });
    },
    [config?.image_host_provider, config?.image_host_enabled, config?.lsky_enabled, debouncedSave],
  );

  /**
   * 涂鸦保存后：把 Markdown 中 mk-hosted 格式改为 mk-doodled 格式。
   * 格式从 ![alt](https://hostedUrl "mk-hosted|localRel")
   *    改为 ![alt](localRel "mk-doodled|https://hostedUrl")
   * 水印消失，右上角出现还原按钮。
   */
  const handleDoodleSaved = useCallback(
    (localRel: string) => {
      const noteAtSave = activeNoteRef.current;
      const zoneAtSave = activeZoneRef.current;
      if (!noteAtSave) return;
      const current = contentRef.current;
      const escaped = localRel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      // 匹配 ![alt](https://... "mk-hosted|localRel") 并转为 mk-doodled 格式
      const next = current.replace(
        new RegExp(`!\\[([^\\]]*)\\]\\((https?://[^\\s)]+)\\s+"mk-hosted\\|${escaped}"\\)`, "g"),
        `![$1](${localRel} "mk-doodled|$2")`,
      );
      // 若没有图床版本（纯本地图片被涂鸦），直接保持本地路径不变
      if (next === current) return;
      if (activeNoteRef.current !== noteAtSave || activeZoneRef.current !== zoneAtSave) return;
      contentRef.current = next;
      setContent(next);
      setDirty(true);
      setSaveStatus("idle");
      // 强制刷新预览，让 mk-doodled 状态（还原按钮）立即显示
      setContentRevision((n) => n + 1);
      debouncedSave();
    },
    [debouncedSave],
  );

  /**
   * 云图图片涂鸦保存后直接上传画布字节，并把对应 Markdown 图片替换为新 URL。
   * 这里不读取或写入本地资源，避免云图图片编辑产生新的本地文件。
   */
  const handleHostedImageEdited = useCallback(
    async (
      sourceHostedUrl: string,
      localRel: string | null,
      imageData: Uint8Array,
      filename: string,
    ): Promise<void> => {
      if (!config || resolveImageHostProvider(config) === "none") {
        throw new Error("未启用图床，无法上传编辑后的图片");
      }
      const noteAtEdit = activeNoteRef.current;
      const zoneAtEdit = activeZoneRef.current;
      try {
        const hostedUrl = await assetService.uploadImage(filename, Array.from(imageData));
        if (
          activeNoteRef.current !== noteAtEdit ||
          activeZoneRef.current !== zoneAtEdit
        ) {
          return;
        }
        const current = contentRef.current;
        const next = replaceHostedImageMarkdown(
          current,
          sourceHostedUrl,
          localRel,
          hostedUrl,
        );
        if (next === current) {
          throw new Error("找不到正在编辑的图片");
        }
        contentRef.current = next;
        setContent(next);
        setDirty(true);
        setSaveStatus("idle");
        setContentRevision((n) => n + 1);
        debouncedSave();
      } catch (error) {
        setError(formatError(error));
        throw error;
      }
    },
    [config?.image_host_provider, config?.image_host_enabled, config?.lsky_enabled, debouncedSave],
  );

  /**
   * 涂鸦保存后用户主动上传到图床：读取本地文件字节后调 upload_image，
   * 成功后替换 Markdown 中对应 title 里的图床 URL。
   */
  const handleReuploadImage = useCallback(
    (localRel: string) => {
      if (!config || resolveImageHostProvider(config) === "none") return;
      const noteAtReupload = activeNoteRef.current;
      const zoneAtReupload = activeZoneRef.current;
      const filename = localRel.split("/").pop() ?? "image.png";

      // 先读本地文件字节，再上传
      assetService.resolveDisplayUrl(localRel)
        .then(async (dataUrl) => {
          // dataUrl 是 base64，转为 Uint8Array
          const base64 = dataUrl.split(",")[1];
          if (!base64) throw new Error("无法读取本地图片数据");
          const binary = atob(base64);
          const bytes = new Uint8Array(binary.length);
          for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
          return assetService.uploadImage(filename, Array.from(bytes));
        })
        .then((hostedUrl) => {
          if (
            activeNoteRef.current !== noteAtReupload ||
            activeZoneRef.current !== zoneAtReupload
          ) return;
          const current = contentRef.current;
          const escaped = localRel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
          // 替换 title 里旧的图床 URL 或本地路径
          const next = current
            // 已有 mk-hosted|localRel 的图床图片：更新图床 URL
            .replace(
              new RegExp(`!\\[([^\\]]*)\\]\\(https?://[^\\s)]+\\s+"mk-hosted\\|${escaped}"\\)`, "g"),
              `![$1](${hostedUrl} "mk-hosted|${localRel}")`,
            )
            // 纯本地路径（涂鸦前还没上传）
            .replace(
              new RegExp(`!\\[([^\\]]*)\\]\\(${escaped}([^)]*)\\)`, "g"),
              `![$1](${hostedUrl} "mk-hosted|${localRel}")`,
            );
          if (next === current) return;
          contentRef.current = next;
          setContent(next);
          setDirty(true);
          setSaveStatus("idle");
          debouncedSave();
        })
        .catch(() => { /* 静默失败 */ });
    },
    [config?.image_host_provider, config?.image_host_enabled, config?.lsky_enabled, debouncedSave],
  );

  const applyAiResult = useCallback(
    (selection: AiSelectionContext, result: string, action: AiAction) => {
      cancelDebouncedHistory();
      const current = contentRef.current;
      pushHistory(current);
      const next = mergeAiResult(current, selection, result, action);
      pushHistory(next);
      contentRef.current = next;
      setContent(next);
      setDirty(true);
      setSaveStatus("idle");
      setContentRevision((n) => n + 1);
      debouncedSave();
    },
    [cancelDebouncedHistory, pushHistory, debouncedSave],
  );

  const togglePreview = useCallback(async () => {
    if (!activeNoteRef.current) return;
    if (viewMode === "edit") {
      try {
        await flushSave();
        setViewMode("preview");
        setError(null);
      } catch {
        /* flushSave 已设置 error */
      }
    } else {
      setViewMode("edit");
    }
  }, [viewMode, flushSave]);

  const ensurePreviewMode = useCallback(async () => {
    if (viewMode !== "edit" || !activeNoteRef.current) return;
    try {
      cancelDebouncedSave();
      await flushSave();
      setViewMode("preview");
      setError(null);
    } catch {
      /* flushSave 已设置 error */
    }
  }, [viewMode, flushSave, cancelDebouncedSave]);

  const handleClearRecentNotes = useCallback(async () => {
    try {
      const cfg = await configService.clearRecentNotes();
      setConfig(cfg);
      const name = activeNoteRef.current;
      const zone = activeZoneRef.current;
      if (name && zone) {
        await recordRecentNote(zone, name);
      }
    } catch (e) {
      setError(formatError(e));
    }
  }, [recordRecentNote]);

  const handleRenameTitle = async (newTitle: string) => {
    const name = activeNoteRef.current;
    const zone = activeZoneRef.current;
    if (!name) return;
    const stem = newTitle.trim();
    if (!stem || stem === titleFromName(name)) return;
    const validationError = validateFilenameTitle(stem);
    if (validationError) {
      setError(validationError);
      return;
    }
    try {
      cancelDebouncedSave();
      await flushTab(zone, name);
      const updated = await notesService.rename(zone, name, stem);
      setActiveNote(updated.name);
      tabSessions.renameKey(zone, name, updated.name);
      const nextTabs = openTabsRef.current.map((t) =>
        tabsEqual(t, zone, name)
          ? { zone, name: updated.name, title: updated.title }
          : t,
      );
      const nextPinned = pinnedTabsRef.current.map((p) =>
        p.zone === zone && p.name === name ? { zone, name: updated.name } : p,
      );
      setPinnedTabs(nextPinned);
      tabVisitOrderRef.current = tabVisitOrderRef.current.map((k) => {
        const parsed = parseTabKey(k);
        if (parsed.zone === zone && parsed.name === name) {
          return tabKey(zone, updated.name);
        }
        return k;
      });
      commitOpenTabs(nextTabs);
      await persistOpenTabsNow(nextTabs, zone, updated.name);
      await refreshAfterStructureChange("rename-title", () => refreshZone(zone));
      const cfg = await configService.getConfig();
      setConfig(cfg);
      setError(null);
    } catch (e) {
      setError(formatError(e));
    }
  };

  const handleExpand = async () => {
    try {
      await flushSave();
      setLibraryOpen(true);
      await refreshLibrary(libraryZone);
      setError(null);
    } catch (e) {
      setError(formatError(e));
    }
  };

  const creatingRef = useRef(false);

  const handleCreate = async (zone: NoteZone = DEFAULT_ZONE) => {
    if (creatingRef.current) return;
    creatingRef.current = true;
    try {
      if (!(await flushBeforeNavigation())) return;
      const created = await notesService.create(zone);
      await openCreatedNote(created, "\n");
        setLibraryOpen(false);
        await Promise.all([
        zone === "inbox" ? refreshZone("inbox") : Promise.resolve(),
        zone === "default" ? refreshZone("default") : Promise.resolve(),
        refreshLibrary(zone, null),
        refreshAgentIndex().catch(() => undefined),
      ]);
      setError(null);
    } catch (e) {
      setError(formatError(e));
    } finally {
      creatingRef.current = false;
    }
  };

  const handleCreateCapsuleTodo = async () => {
    if (creatingRef.current) return;
    creatingRef.current = true;
    const zone: NoteZone = DEFAULT_ZONE;
    let created: NoteSummary | null = null;
    try {
      if (!(await flushBeforeNavigation())) return;
      created = await notesService.create(zone);
      markPoppedOut(zone, created.name);

      const win = appBridge.window.current();
      const [scaleVal, posVal] = await Promise.all([
        win.scaleFactor(),
        win.outerPosition(),
      ]);

      await windowService.openCapsule({
        zone,
        name: created.name,
        title: created.title || titleFromName(created.name),
        noteColor: created.color ?? null,
        alwaysOnTop: true,
        anchorX: posVal.x / scaleVal,
        anchorY: posVal.y / scaleVal,
        source: "main",
      });

      await Promise.all([
        refreshZone(zone),
        refreshLibrary(zone, null),
        refreshAgentIndex().catch(() => undefined),
      ]);

      const curZone = activeZoneRef.current ?? zone;
      const curName = activeNoteRef.current ?? "";
      await configService.setOpenTabs({
        tabs: openTabsRef.current
          .filter((t) => !isPoppedOut(t.zone, t.name))
          .map((t) => ({ zone: t.zone, name: t.name })),
        activeZone: curZone,
        activeName: curName,
        pinnedTabs: pinnedTabsRef.current,
      });
      setError(null);
    } catch (e) {
      if (created) removePoppedOut(zone, created.name);
      setError(formatError(e));
    } finally {
      creatingRef.current = false;
    }
  };

  const handleOpenNote = async (zone: NoteZone, name: string) => {
    try {
      await measureAsync("handleOpenNote", async () => {
      const existing = openTabsRef.current.find((t) => tabsEqual(t, zone, name));
      if (existing) {
        await switchToTab(zone, name);
        setLibraryOpen(false);
        return;
      }
      if (!(await flushBeforeNavigation())) return;
      const snapshot = await notesService.readSnapshot(zone, name);
      const notes = await notesService.list(zone);
      const meta = notes.find((n) => n.name === name);
      const note: NoteSummary = meta ?? {
        name,
        title: titleFromName(name),
        modified_ms: 0,
        zone,
        color: null,
      };
      await addTabAndActivate(note, snapshot);
      void notesService.findBacklinks(note.title).then(setBacklinks);
      setLibraryOpen(false);
      setError(null);
      }, { zone });
    } catch (e) {
      setError(formatError(e));
    }
  };

  const classifyNote = async (zone: NoteZone, name: string, background: boolean) => {
    if (!classificationReady(config?.note_classification) || !canClassifyNote(zone, name)) return;
    const key = tabKey(zone, name);
    if (classificationPending.current.has(key)) return;
    classificationPending.current.add(key);
    setClassificationBusy(true);
    try {
      const decision = await noteClassificationService.suggest(name);
      if (background && openTabsRef.current.some(t => tabsEqual(t, zone, name))) return;
      await handleMoveNote(name, zone, decision.target_zone as NoteZone, decision);
    } catch (e) {
      setError(`Jev 归类失败：${formatError(e)}`);
    } finally {
      classificationPending.current.delete(key);
      setClassificationBusy(classificationPending.current.size > 0);
    }
  };

  const handleClassifyNote = async () => {
    const name = activeNoteRef.current;
    const zone = activeZoneRef.current;
    if (!name || !canClassifyNote(zone, name, false, defaultNoteOpenRef.current)) return;
    try {
      await flushTab(zone, name);
      await classifyNote(zone, name, false);
    } catch (e) { setError(formatError(e)); }
  };

  const closeTabInternal = async (zone: NoteZone, name: string) => {
    const key = tabKey(zone, name);
    if (closingTabs.current.has(key) || openTabsRef.current.length <= 1 || !openTabsRef.current.some(tab => tabsEqual(tab, zone, name))) return;
    closingTabs.current.add(key);
    try {
      const isActive = activeNoteRef.current === name && activeZoneRef.current === zone;
      await flushTab(zone, name);
      const deleted = await notesService.deleteIfEmpty(zone, name);
      const nextTabs = openTabsRef.current.filter((t) => !tabsEqual(t, zone, name));
      const nextPinned = prunePinnedTabs(pinnedTabsRef.current, nextTabs);
      setPinnedTabs(nextPinned);
      tabSessions.remove(zone, name);
      tabVisitOrderRef.current = tabVisitOrderRef.current.filter(
        (k) => k !== tabKey(zone, name),
      );
      commitOpenTabs(nextTabs);
      if (isActive) {
        const nextTab = getTabAfterClose(zone, name);
        if (nextTab) {
          await switchToTab(nextTab.zone, nextTab.name);
          await persistOpenTabsNow(openTabsRef.current, nextTab.zone, nextTab.name);
        }
      } else {
        const curName = activeNoteRef.current;
        const curZone = activeZoneRef.current;
        if (curName && curZone) {
          await persistOpenTabsNow(nextTabs, curZone, curName);
        }
      }
      setError(null);
      if (!deleted) void classifyNote(zone, name, true);
      else await refreshAll();
    } finally {
      closingTabs.current.delete(key);
    }
  };

  const handleMiddleClickCloseTab = async (zone: NoteZone, name: string) => {
    if (openTabsRef.current.length <= 1) return;
    if (isTabPinned(pinnedTabsRef.current, zone, name)) {
      setClosePinnedPrompt({ zone, name });
      return;
    }
    try {
      await closeTabInternal(zone, name);
    } catch (e) {
      setError(formatError(e));
    }
  };

  const handleConfirmClosePinned = async () => {
    const target = closePinnedPrompt;
    if (!target) return;
    setClosePinnedPrompt(null);
    try {
      await closeTabInternal(target.zone, target.name);
    } catch (e) {
      setError(formatError(e));
    }
  };

  const handleToggleTabPin = useCallback(() => {
    const zone = activeZoneRef.current;
    const name = activeNoteRef.current;
    if (!name) return;
    if (isTabPinned(pinnedTabsRef.current, zone, name)) {
      const nextPinned = pinnedTabsRef.current.filter(
        (p) => !(p.zone === zone && p.name === name),
      );
      setPinnedTabs(nextPinned);
      commitOpenTabs(openTabsRef.current);
      void persistOpenTabsNow(openTabsRef.current, zone, name);
      return;
    }
    if (pinnedTabsRef.current.length >= pinnedTabLimitRef.current) {
      setReplacePinPrompt({ zone, name });
      return;
    }
    const nextPinned = [...pinnedTabsRef.current, { zone, name }];
    setPinnedTabs(nextPinned);
    commitOpenTabs(openTabsRef.current);
    void persistOpenTabsNow(openTabsRef.current, zone, name);
  }, [commitOpenTabs, persistOpenTabsNow, setPinnedTabs]);

  const handleReplacePinnedTab = useCallback(
    (replaced: OpenTabRef) => {
      const target = replacePinPrompt;
      if (!target) return;
      const nextPinned = pinnedTabsRef.current
        .filter((p) => !(p.zone === replaced.zone && p.name === replaced.name))
        .concat([{ zone: target.zone, name: target.name }]);
      setPinnedTabs(nextPinned);
      setReplacePinPrompt(null);
      commitOpenTabs(openTabsRef.current);
      const curName = activeNoteRef.current;
      const curZone = activeZoneRef.current;
      if (curName && curZone) {
        void persistOpenTabsNow(openTabsRef.current, curZone, curName);
      }
    },
    [replacePinPrompt, commitOpenTabs, persistOpenTabsNow, setPinnedTabs],
  );

  const handleCloseOtherTabs = async () => {
    const name = activeNoteRef.current;
    const zone = activeZoneRef.current;
    if (!name || openTabsRef.current.length <= 1) return;
    try {
      const pinnedKeys = new Set(pinnedTabsRef.current.map((tab) => tabKey(tab.zone, tab.name)));
      const keptRefs = new Map<string, OpenTabRef>();
      keptRefs.set(tabKey(zone, name), { zone, name });
      for (const pinned of pinnedTabsRef.current) {
        keptRefs.set(tabKey(pinned.zone, pinned.name), pinned);
      }

      const toClassify: OpenTabRef[] = [];
      for (const tab of openTabsRef.current) {
        if (tabsEqual(tab, zone, name)) continue;
        if (pinnedKeys.has(tabKey(tab.zone, tab.name))) continue;
        await flushTab(tab.zone, tab.name);
        const deleted = await notesService.deleteIfEmpty(tab.zone, tab.name);
        if (!deleted) toClassify.push(tab);
      }
      const kept = openTabsRef.current.filter((t) => keptRefs.has(tabKey(t.zone, t.name)));
      const nextPinned = prunePinnedTabs(pinnedTabsRef.current, kept);
      setPinnedTabs(nextPinned);
      tabSessions.removeExcept(Array.from(keptRefs.values()));
      commitOpenTabs(kept);
      await persistOpenTabsNow(kept, zone, name);
      setError(null);
      for (const tab of toClassify) void classifyNote(tab.zone, tab.name, true);
      await refreshAll();
    } catch (e) {
      setError(formatError(e));
    }
  };

  // ── 弹出便签为独立窗口 ────────────────────────────────────────────────
  const handlePopoutTab = useCallback(async (zone: NoteZone, name: string, screenX?: number, screenY?: number) => {
    // 已弹出时仍继续调用 Rust 命令，由 Rust 负责聚焦已有窗口。
    // 资料库点击同一标题的行为也必须保持为“打开/聚焦 Popout”。
    const wasOpenInMain = openTabsRef.current.some((tab) => tabsEqual(tab, zone, name));
    const isActiveTarget = activeNoteRef.current === name && activeZoneRef.current === zone;
    try {
      if (isActiveTarget) {
        await flushSave();
      } else if (wasOpenInMain) {
        await flushTab(zone, name);
      }
    } catch {
      return;
    }

    const libraryWasOpen = libraryOpen;

    const titleVal =
      openTabsRef.current.find((t) => t.zone === zone && t.name === name)?.title ??
      titleFromName(name);
    const originalTabs = openTabsRef.current;
    const nextTab =
      activeNoteRef.current === name && activeZoneRef.current === zone
        ? getTabAfterClose(zone, name)
        : null;
    const nextTabs = wasOpenInMain
      ? originalTabs.filter((tab) => !tabsEqual(tab, zone, name))
      : originalTabs;

  // 立即更新 UI 状态：把该 Tab 从主窗口隐藏
    markPoppedOut(zone as NoteZone, name);

    if (wasOpenInMain) {
      tabVisitOrderRef.current = tabVisitOrderRef.current.filter((key) => key !== tabKey(zone, name));
      commitOpenTabs(nextTabs);
    }

    // 清除该笔记在主窗口的 session 缓存：弹出窗口会独立修改磁盘内容，
    // 若保留旧缓存，Tab 归还后切回时 switchToTab 会命中旧缓存而非读盘，
    // 导致主窗口显示的是弹出前的旧内容。删除后归还时将重新 read_note。
    tabSessions.remove(zone, name);

    // 若弹出的是当前活跃 Tab，立刻切换到其他 Tab（非阻塞）
    if (activeNoteRef.current === name && activeZoneRef.current === zone) {
      if (nextTab) {
        void switchToTab(nextTab.zone, nextTab.name).catch(() => undefined);
      } else {
        // 无其他 Tab 可切（最后一个 Tab 被拖出）：切到默认便签
        void handleOpenDefaultNote().finally(() => {
          if (libraryWasOpen) setLibraryOpen(true);
        });
      }
    }

    // 获取窗口尺寸后再创建弹出窗口（在微任务中执行，不阻塞当前渲染帧）
    void (async () => {
      try {
        const width = DEFAULT_POPOUT_WIDTH;
        const height = DEFAULT_POPOUT_HEIGHT;
        const useCursorPosition = screenX != null && screenY != null;

        console.log(`[popout params]`, { zone, name, title: titleVal, width, height, useCursorPosition });

        await windowService.openNotePopout({
          zone,
          name,
          title: titleVal,
          width,
          height,
          useCursorPosition,
        });
      } catch (e) {
        // "already_open" 是预期情况（Rust 已 focus），其他才报错
        if (String(e) !== "already_open") {
          setError(formatError(e));
          // 还原：把 Tab 加回来
          removePoppedOut(zone, name);
          if (wasOpenInMain) commitOpenTabs(originalTabs);
        }
      }

      // 持久化（不含弹出的 Tab）
      const curName = activeNoteRef.current;
      const curZone = activeZoneRef.current;
      if (curName && curZone) {
        void configService.setOpenTabs({
          tabs: openTabsRef.current
            .filter((t) => !isPoppedOut(t.zone, t.name))
            .map((t) => ({ zone: t.zone, name: t.name })),
          activeZone: curZone,
          activeName: curName,
          pinnedTabs: pinnedTabsRef.current,
        }).catch(() => undefined);
      }
    })();
}, [flushSave, flushTab, switchToTab, getTabAfterClose, libraryOpen, commitOpenTabs, tabVisitOrderRef, tabSessions, activeNoteRef, activeZoneRef]);

  const handleOpenContainingFolder = async () => {
    const name = activeNoteRef.current;
    const zone = activeZoneRef.current;
    if (!name) return;
    try {
      const path = await notesService.getDir(zone);
      await windowService.openFolder(path);
      setError(null);
    } catch (e) {
      setError(formatError(e));
    }
  };

  const handleOpenLibraryFolder = async () => {
    try {
      const path = await notesService.getDir(libraryZone);
      await windowService.openFolder(path);
      setError(null);
    } catch (e) {
      setError(formatError(e));
    }
  };

  // ── 隐私模式 ──────────────────────────────────────────────────────────

  const handleLskyCleanupScan = useCallback(async () => {
    await flushSave();
    await flushPrivateNote();
    if (privateDirtyRef.current) {
      throw new Error("隐私笔记保存失败，已停止图床扫描");
    }
    return assetService.scanLskyCleanup();
  }, [flushPrivateNote, flushSave]);

  const handleLskyCleanupDelete = useCallback(async (keys: string[]) => {
    await flushSave();
    await flushPrivateNote();
    if (privateDirtyRef.current) {
      throw new Error("隐私笔记保存失败，已停止图床清理");
    }
    return assetService.deleteLskyCleanup(keys);
  }, [flushPrivateNote, flushSave]);

  const handleCloudImgsCleanupScan = useCallback(async () => {
    await flushSave();
    await flushPrivateNote();
    if (privateDirtyRef.current) {
      throw new Error("隐私笔记保存失败，已停止云图扫描");
    }
    return assetService.scanCloudImgsCleanup();
  }, [flushPrivateNote, flushSave]);

  const handleCloudImgsCleanupDelete = useCallback(async (keys: string[]) => {
    await flushSave();
    await flushPrivateNote();
    if (privateDirtyRef.current) {
      throw new Error("隐私笔记保存失败，已停止云图清理");
    }
    return assetService.deleteCloudImgsCleanup(keys);
  }, [flushPrivateNote, flushSave]);

  const handleImageHostConfigSave = useCallback(async (patch: ImageHostConfigPatch) => {
    try {
      const nextConfig = await configService.setImageHostConfig(patch);
      setConfig(nextConfig);
      setError(null);
    } catch (error) {
      setError(formatError(error));
      throw error;
    }
  }, []);

  const handleLskyTestConnection = useCallback(
    (url: string, email: string, password: string) =>
      configService.testLskyConnection(url, email, password),
    [],
  );

  const handleCloudImgsTestConnection = useCallback(
    (url: string, password: string, directory: string) =>
      configService.testCloudImgsConnection(url, password, directory),
    [],
  );

  const handleEnterPrivateMode = useCallback(async () => {
    // 先保存当前普通笔记
    await flushSave();
    try {
      let notes = await notesService.list("private");
      if (notes.length === 0) {
        const note = await notesService.create("private");
        notes = [note];
      }
      const target = notes[0];
    const snapshot = await notesService.readSnapshot("private", target.name);
    privateNoteRef.current = target.name;
    privateContentHashRef.current = snapshot.contentHash;
    privateEditorRevisionRef.current = 0;
    privateContentRef.current = snapshot.content;
    privateDirtyRef.current = false;
    setPrivateContent(snapshot.content);
      setPrivateModeActive(true);
      setPrivateContentRevision((n) => n + 1);
      setError(null);
    } catch (e) {
      setError(`隐私笔记加载失败：${formatError(e)}`);
    }
  }, [flushSave]);

  const exitPrivateMode = useCallback(async () => {
    if (!privateModeActive) return;
    await flushPrivateNote();
    setPrivateModeActive(false);
    setPrivateContent("");
    privateNoteRef.current = null;
    privateContentRef.current = "";
    privateContentHashRef.current = undefined;
    privateEditorRevisionRef.current = 0;
    privateDirtyRef.current = false;
  }, [privateModeActive, flushPrivateNote]);

  const handlePrivateContentChange = useCallback((value: string) => {
    privateContentRef.current = value;
    privateDirtyRef.current = true;
    privateEditorRevisionRef.current += 1;
    setPrivateContent(value);
  }, []);

  // 包装 switchToTab：若处于私密模式，先退出再切换
  const handleSelectTab = useCallback(
    async (zone: NoteZone, name: string) => {
      if (privateModeActive) {
        await exitPrivateMode();
      }
      await switchToTab(zone, name);
    },
    [privateModeActive, exitPrivateMode, switchToTab],
  );

  const handleOpenDefaultNote = async () => {
    try {
      if (defaultNoteOpenRef.current) {
        // 已在默认便签，切回上一个普通便签
        await flushSave();
        const target = lastRegularNoteRef.current ?? (await findExistingMarkdownNote());
        if (target) {
          const inTabs = openTabsRef.current.find((t) => tabsEqual(t, target.zone, target.name));
          if (inTabs) await switchToTab(target.zone, target.name);
          else await loadNote(target.name, target.zone);
          return;
        }

        defaultNoteOpenRef.current = false;
        setDefaultNoteOpen(false);
        // 首次只打开默认便签时没有可返回的普通 Tab，创建一个普通笔记恢复主编辑链路。
        const created = await notesService.create(DEFAULT_ZONE);
        await openCreatedNote(created, "\n");
        return;
      }
      await flushSave();
      // 记录当前普通便签以便返回
      const curName = activeNoteRef.current;
      const curZone = activeZoneRef.current;
      if (
        curName &&
        !isRootDefaultNote({
          zone: curZone,
          name: curName,
          defaultNoteOpen: defaultNoteOpenRef.current,
        })
      ) {
        lastRegularNoteRef.current = { name: curName, zone: curZone };
      }
    setLibraryOpen(false);
    setSearchOmniboxOpen(false);
    // 确保文件存在并读取内容
    await notesService.ensureDefault();
    const snapshot = await notesService.readDefaultSnapshot();
    cancelDebouncedSave();
      setViewMode("edit");
      setActiveNote(DEFAULT_NOTE_NAME);
      setActiveZone("default");
      setActiveNoteColor(null);
    setContent(snapshot.content);
    contentRef.current = snapshot.content;
    diskContentHashRef.current = snapshot.contentHash;
    editorRevisionRef.current = 0;
    resetHistory(snapshot.content);
      setDirty(false);
      setSaveStatus("idle");
      setContentRevision((n) => n + 1);
      defaultNoteOpenRef.current = true;
      setDefaultNoteOpen(true);
      setError(null);
    } catch (e) {
      setError(formatError(e));
    }
  };

  const handleLibraryZoneChange = async (zone: NoteZone) => {
    try {
      const selection = getFolderSelection(zone);
      await refreshLibrary(selection.zone, selection.color);
      setError(null);
    } catch (e) {
      setError(formatError(e));
    }
  };

  const handleColorSelect = async (color: string | null) => {
    try {
      await refreshLibrary(libraryZone, color);
      setError(null);
    } catch (e) {
      setError(formatError(e));
    }
  };

  const handleMoveNote = async (name: string, from: NoteZone, to: NoteZone, decision?: FolderDecision) => {
    try {
      cancelDebouncedSave();
      await flushTab(from, name);
      const updated = decision ? await noteClassificationService.apply(name, decision) : await notesService.move(from, to, name);
      tabSessions.migrateKeyZone(from, name, to, updated.name);
      const nextTabs = openTabsRef.current.map((t) =>
        tabsEqual(t, from, name)
          ? { zone: to, name: updated.name, title: updated.title }
          : t,
      );
      const nextPinned = pinnedTabsRef.current.map((p) =>
        p.zone === from && p.name === name
          ? { zone: to, name: updated.name }
          : p,
      );
      setPinnedTabs(nextPinned);
      commitOpenTabs(nextTabs);
      if (activeNoteRef.current === name && activeZoneRef.current === from) {
        setActiveZone(to);
        setActiveNote(updated.name);
        setActiveNoteColor(updated.color ?? null);
      }
      const curName = activeNoteRef.current;
      const curZone = activeZoneRef.current;
      if (curName && curZone) {
        await persistOpenTabsNow(nextTabs, curZone, curName);
      }
      await refreshAll();
      setError(null);
    } catch (e) {
      setError(formatError(e));
    }
  };

  const handleRenameNote = async (zone: NoteZone, oldName: string, newTitle: string) => {
    try {
      cancelDebouncedSave();
      await flushTab(zone, oldName);
      const updated = await notesService.rename(zone, oldName, newTitle);
      tabSessions.renameKey(zone, oldName, updated.name);
      const nextTabs = openTabsRef.current.map((t) =>
        t.zone === zone && t.name === oldName
          ? { zone, name: updated.name, title: updated.title }
          : t,
      );
      const nextPinned = pinnedTabsRef.current.map((p) =>
        p.zone === zone && p.name === oldName ? { zone, name: updated.name } : p,
      );
      setPinnedTabs(nextPinned);
      tabVisitOrderRef.current = tabVisitOrderRef.current.map((k) => {
        const parsed = parseTabKey(k);
        if (parsed.zone === zone && parsed.name === oldName) {
          return tabKey(zone, updated.name);
        }
        return k;
      });
      commitOpenTabs(nextTabs);
      if (activeNoteRef.current === oldName && activeZoneRef.current === zone) {
        setActiveNote(updated.name);
        setActiveNoteColor(updated.color ?? null);
      }
      const curName = activeNoteRef.current;
      const curZone = activeZoneRef.current;
      if (curName && curZone) {
        await persistOpenTabsNow(nextTabs, curZone, curName);
      }
      await refreshAll();
      const cfg = await configService.getConfig();
      setConfig(cfg);
      setError(null);
    } catch (e) {
      setError(formatError(e));
    }
  };

  const handleDeleteNote = async (zone: NoteZone, name: string) => {
    try {
      cancelDebouncedSave();
      await flushTab(zone, name);
      await notesService.delete(zone, name);
      await refreshAll();
      const wasActive = activeNoteRef.current === name && activeZoneRef.current === zone;
      const nextTabs = openTabsRef.current.filter((t) => !tabsEqual(t, zone, name));
      const nextPinned = prunePinnedTabs(pinnedTabsRef.current, nextTabs);
      setPinnedTabs(nextPinned);
      tabSessions.remove(zone, name);
      tabVisitOrderRef.current = tabVisitOrderRef.current.filter(
        (k) => k !== tabKey(zone, name),
      );
      commitOpenTabs(nextTabs);
      if (wasActive) {
        const nextTab = getTabAfterClose(zone, name);
        if (nextTab) {
          await switchToTab(nextTab.zone, nextTab.name);
          await persistOpenTabsNow(openTabsRef.current, nextTab.zone, nextTab.name);
        } else {
          cancelDebouncedSave();
          setActiveNote(null);
          setContent("");
          contentRef.current = "";
          setDirty(false);
          setSaveStatus("idle");
          void configService.setOpenTabs({
            tabs: [],
            activeZone: "default",
            activeName: "",
            pinnedTabs: [],
          }).then((cfg) => setConfig(cfg));
        }
      } else {
        const curName = activeNoteRef.current;
        const curZone = activeZoneRef.current;
        if (curName && curZone) await persistOpenTabsNow(nextTabs, curZone, curName);
      }
      setError(null);
    } catch (e) {
      setError(formatError(e));
    }
  };

  const handleCreateFolder = async (title: string) => {
    try {
      const folder = await libraryService.createFolder(title);
      await refreshAfterStructureChange("create-folder", () => refreshLibrary(folder.zone));
      setError(null);
    } catch (e) {
      setError(formatError(e));
    }
  };

  const handleRenameFolder = async (oldId: string, newTitle: string) => {
    try {
      const folder = await libraryService.renameFolder(oldId, newTitle);
      await refreshAfterStructureChange("rename-folder", () => refreshLibrary(folder.zone));
      setError(null);
    } catch (e) {
      setError(formatError(e));
    }
  };

  const handleSetNoteColor = async (zone: NoteZone, name: string, color: string | null) => {
    try {
      await notesService.setColor(zone, name, color);
      await refreshAll();
      if (activeZoneRef.current === zone && activeNoteRef.current === name) {
        setActiveNoteColor(color);
      }
      // 同步更新 Tab 上的颜色标签，使 Tab 顶部色条即时刷新
      setOpenTabs((prev) =>
        prev.map((t) => (t.zone === zone && t.name === name ? { ...t, color } : t)),
      );
      setError(null);
    } catch (e) {
      setError(formatError(e));
    }
  };

  const setThemeConfig = (cfg: AppConfig) => {
    setConfig(cfg);
    applyTheme(cfg);
    void appBridge.emit("mknote:theme-changed", cfg).catch(() => undefined);
  };

  const handleThemeModeChange = async (themeMode: ThemeMode) => {
    try {
      const cfg = await configService.setThemeMode(themeMode);
      setThemeConfig(cfg);
      setError(null);
    } catch (e) {
      setError(formatError(e));
    }
  };

  const handleThemeModeCycle = async () => {
    const current = config?.theme_mode ?? "system";
    await handleThemeModeChange(nextThemeMode(current));
  };

  const handleNoteColorLabelsChange = async (labels: Record<string, string>) => {
    try {
      const trimmed: Record<string, string> = {};
      for (const [key, value] of Object.entries(labels)) {
        const v = value.trim();
        if (v) trimmed[key] = v;
      }
      const cfg = await configService.setNoteColorLabels(trimmed);
      setConfig(cfg);
      setError(null);
    } catch (e) {
      setError(formatError(e));
    }
  };

  const handleSiyuanConfigSave = async (patch: {
    apiUrl: string;
    apiToken: string;
    notebookId: string;
  }) => {
    try {
      const cfg = await siyuanService.setConfig(patch);
      setConfig(cfg);
      setError(null);
    } catch (e) {
      setError(formatError(e));
    }
  };

  const handleUploadConfigSave = async (patch: NoteUploadConfigPatch) => {
    const next = await noteUploadService.setConfig(patch);
    setConfig(next);
    setSiyuanHint(null);
  };

  const handleSiyuanTestConnection = useCallback(async (
    apiUrl: string,
    apiToken: string,
  ): Promise<SiyuanNotebookSummary[]> => {
    return siyuanService.testConnection(apiUrl, apiToken);
  }, []);

  const handleSiyuanUpload = async () => {
    const name = activeNoteRef.current;
    const zone = activeZoneRef.current;
    if (!name) return;
    const target = config ? effectiveUploadTarget(config) : "none";
    if (target === "none" || siyuanUploading) return;
    const rootDefault = defaultNoteOpenRef.current;
    if (privateModeActive || zone === "private" || activeNoteColor === "隐私") {
      setError("隐私便签不能上传");
      return;
    }
    setSiyuanUploading(true);
    setSiyuanHint(null);
    try {
      await flushSave();
      if (activeNoteRef.current !== name || activeZoneRef.current !== zone || defaultNoteOpenRef.current !== rootDefault) {
        throw new Error("当前笔记已切换，请重新点击上传");
      }
      if (target === "obsidian") {
        const result = await noteUploadService.uploadObsidian(zone, name, rootDefault);
        const displayPath = result.path.replace(/^\\\\\?\\UNC\\/, "\\\\").replace(/^\\\\\?\\/, "");
        setSiyuanHint(`${result.overwritten ? "已覆盖" : "已复制到"} Obsidian：${displayPath}`);
        setError(null);
        return;
      }
      const title =
        openTabsRef.current.find((t) => tabsEqual(t, zone, name))?.title ??
        titleFromName(name);
      const result = await siyuanService.uploadCurrentNote(zone, name, contentRef.current, title);
      setSiyuanHint(
        result.created
          ? `已上传到思源：${result.h_path}`
          : `已覆盖思源：${result.h_path}`,
      );
      await refreshSiyuanSyncedNotes();
      setError(null);
    } catch (e) {
      setError(formatError(e));
    } finally {
      setSiyuanUploading(false);
    }
  };

  const handleMessageHubSettingsSave = async (patch: {
    endpoint: string;
    bucket: string;
    objectKey: string;
    accessKey: string;
    secretKey: string;
  }) => {
    const cfg = await messageHubService.setS3Config(patch);
    setConfig(cfg);
    setError(null);
  };

  const handleMessageHubTestConnection = async (
    endpoint: string,
    bucket: string,
    objectKey: string,
    accessKey: string,
    secretKey: string,
  ) => {
    await messageHubService.testConnection({
      endpoint,
      bucket,
      objectKey,
      accessKey,
      secretKey,
    });
  };

  const handleSyncEnabledChange = async (enabled: boolean) => {
    const cfg = await syncService.setEnabled(enabled);
    setConfig(cfg);
    setError(null);
  };

  const handleSyncBootstrap = async (mode: "local" | "remote") => {
    await flushSave();
    await syncService.bootstrap(mode);
    const cfg = await configService.getConfig();
    setConfig(cfg);
    setError(null);
  };

  const handleSyncResolveConflicts = async (resolution: "local" | "remote") => {
    if (!config?.sync_initialized) return;
    const flushed = await flushAllDirty();
    if (!flushed) return;
    await syncService.resolveConflicts(resolution);
    const cfg = await configService.getConfig();
    setConfig(cfg);
    setError(null);
  };

  const handleManualSync = async () => {
    if (manualSyncBusy || !config?.sync_enabled || !config.sync_initialized) return;
    setManualSyncBusy(true);
    try {
      const flushed = await flushAllDirty();
      if (!flushed) return;
      await syncService.tick(false);
      setError(null);
    } catch (e) {
      setError(formatError(e));
    } finally {
      setManualSyncBusy(false);
    }
  };

  const handleAddCustomTag = async (name: string, hex: string) => {
    try {
      await libraryService.addCustomTag(name, hex);
      await Promise.all([refreshCustomTags(), refreshNoteColors()]);
      setError(null);
    } catch (e) {
      setError(formatError(e));
      throw e;
    }
  };

  const handleDeleteCustomTag = async (id: string) => {
    try {
      await libraryService.deleteCustomTag(id);
      await Promise.all([refreshCustomTags(), refreshNoteColors(), refreshAll()]);
      if (activeNoteColor && activeNoteColor === id) {
        setActiveNoteColor(null);
      }
      setError(null);
    } catch (e) {
      setError(formatError(e));
      throw e;
    }
  };

  const handleUpdateCustomTag = async (
    id: string,
    patch: { name?: string; hex?: string },
  ) => {
    try {
      await libraryService.updateCustomTag(id, patch);
      await Promise.all([refreshCustomTags(), refreshNoteColors()]);
      setError(null);
    } catch (e) {
      setError(formatError(e));
      throw e;
    }
  };

  const handleArchiveNote = async () => {
    const name = activeNoteRef.current;
    const zone = activeZoneRef.current;
    if (!name) return;
    try {
      cancelDebouncedSave();
      await flushTab(zone, name);
      const updated = await notesService.archive(zone, name);
      const toZone = updated.zone as NoteZone;
      tabSessions.migrateKeyZone(zone, name, toZone, updated.name);
      const nextTabs = openTabsRef.current.map((t) =>
        tabsEqual(t, zone, name)
          ? { zone: toZone, name: updated.name, title: updated.title }
          : t,
      );
      const nextPinned = pinnedTabsRef.current.map((p) =>
        p.zone === zone && p.name === name
          ? { zone: toZone, name: updated.name }
          : p,
      );
      setPinnedTabs(nextPinned);
      commitOpenTabs(nextTabs);
      if (activeNoteRef.current === name && activeZoneRef.current === zone) {
        setActiveZone(toZone);
        setActiveNote(updated.name);
        setActiveNoteColor(updated.color ?? null);
      }
      const curName = activeNoteRef.current;
      const curZone = activeZoneRef.current;
      if (curName && curZone) {
        await persistOpenTabsNow(nextTabs, curZone, curName);
      }
      await refreshAll();
      setError(null);
    } catch (e) {
      setError(formatError(e));
    }
  };

  const handleRestoreFromTrash = async (id: string) => {
    try {
      const note = await notesService.restoreFromTrash(id);
      const snapshot = await notesService.readSnapshot(note.zone, note.name);
      await refreshAll();
      await addTabAndActivate(note, snapshot);
      setError(null);
    } catch (e) {
      setError(formatError(e));
    }
  };

  const handlePermanentlyDeleteTrash = async (id: string) => {
    try {
      await notesService.permanentlyDeleteTrash(id);
      await refreshAfterStructureChange("permanently-delete-trash");
      setError(null);
    } catch (e) {
      setError(formatError(e));
    }
  };

  const handleCreateFromTemplate = async (templateId: string) => {
    try {
      const zone = activeZoneRef.current ?? "default";
      const note = await notesService.createFromTemplate(zone, templateId);
      const snapshot = await notesService.readSnapshot(note.zone, note.name);
      await refreshAll();
      await addTabAndActivate(note, snapshot);
      setViewMode("preview");
      setError(null);
    } catch (e) {
      setError(formatError(e));
    }
  };

  const handleThemeStyleChange = async (theme: ThemeStyle) => {
    try {
      const cfg = await configService.setThemeStyles(theme, theme, theme);
      setThemeConfig(cfg);
      setError(null);
    } catch (e) {
      setError(formatError(e));
    }
  };

  const handleReorderTabs = useCallback(
    (fromIndex: number, toIndex: number) => {
      const tabs = [...openTabsRef.current];
      if (fromIndex < 0 || toIndex < 0 || fromIndex >= tabs.length || toIndex >= tabs.length) {
        return;
      }
      const [item] = tabs.splice(fromIndex, 1);
      tabs.splice(toIndex, 0, item);
      const newPinnedOrder = tabs
        .filter((t) => isTabPinned(pinnedTabsRef.current, t.zone, t.name))
        .map((t) => ({ zone: t.zone, name: t.name }));
      setPinnedTabs(newPinnedOrder);
      commitOpenTabs(tabs);
      const name = activeNoteRef.current;
      const zone = activeZoneRef.current;
      if (name) schedulePersistTabs(tabs, zone, name);
    },
    [commitOpenTabs, schedulePersistTabs, setPinnedTabs],
  );

  const resolveRecentTitle = useCallback(
    (zone: NoteZone, name: string) => {
      const tab = openTabsRef.current.find((t) => t.zone === zone && t.name === name);
      if (tab) return tab.title;
      const fromInbox = inboxNotes.find((n) => n.zone === zone && n.name === name);
      if (fromInbox) return fromInbox.title;
      const fromLibrary = libraryNotes.find((n) => n.zone === zone && n.name === name);
      if (fromLibrary) return fromLibrary.title;
      return titleFromName(name);
    },
    [inboxNotes, libraryNotes],
  );

  const handleGlobalHotkeysSave = async (hotkeys: GlobalHotkeys) => {
    const cfg = await configService.setGlobalHotkeys(hotkeys);
    setConfig(cfg);
    setError(null);
  };

  const handleAiConfigSave = async (patch: {
    api_url?: string | null;
    api_token?: string | null;
    model?: string | null;
  }) => {
    const cfg = await aiService.setConfig(patch);
    setConfig(cfg);
    setError(null);
  };

  const handlePinnedTabLimitChange = async (limit: number) => {
    try {
      const cfg = await configService.setPinnedTabLimit(limit);
      setConfig(cfg);
      // 如果当前置顶数超出新上限，截断
      const trimmed = pinnedTabsRef.current.slice(0, limit);
      if (trimmed.length !== pinnedTabsRef.current.length) {
        setPinnedTabs(trimmed);
        commitOpenTabs(openTabsRef.current);
      }
    } catch (e) {
      setError(formatError(e));
    }
  };

  const handleFullscreenDodgeChange = async (enabled: boolean) => {
    try {
      const cfg = await configService.setFullscreenDodge(enabled);
      setConfig(cfg);
    } catch (e) {
      setError(formatError(e));
    }
  };

  const handleImportAsset = useCallback(async (filePath: string): Promise<string> => {
    try {
      return await assetService.importAsset(filePath);
    } catch (e) {
      throw new Error(formatError(e));
    }
  }, []);

  const handleWikilinkNavigate = (linkTitle: string) => {
    void (async () => {
      const hits = await notesService.search(linkTitle, null);
      const exact = hits.find((h) => h.title === linkTitle) ?? hits[0];
      if (exact) await handleOpenNote(exact.zone as NoteZone, exact.name);
      else setError(`未找到笔记：${linkTitle}`);
    })();
  };

  const handleAiAssist = (selection: AiSelectionContext) => {
    if (!selection.text.trim()) return;
    setAiSelection(selection);
    setAiAssistOpen(true);
  };

  if (loading || !config) {
    return (
      <div className="app setup">
        <BootLoader />
      </div>
    );
  }

  return (
    <div className="app">
      {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}

      {activeNote ? (
          <CompactView
            config={config}
            activeNote={activeNote}
            activeZone={activeZone}
            contentRevision={contentRevision}
            title={titleFromName(activeNote)}
            activeNoteColor={activeNoteColor}
            content={content}
            viewMode={viewMode}
            saveStatus={saveStatus}
            dirty={dirty}
            siyuanHint={siyuanHint}
            siyuanSyncedNotes={siyuanSyncedNotes}
            customTags={customTags}
            onAddCustomTag={handleAddCustomTag}
            onUpdateCustomTag={handleUpdateCustomTag}
            onDeleteCustomTag={handleDeleteCustomTag}
            inboxNotes={inboxNotes}
            folders={folders}
            noteColors={noteColors}
            libraryNotes={libraryNotes}
            libraryZone={libraryZone}
            activeColor={activeColor}
            libraryOpen={libraryOpen}
            onTitleChange={() => {}}
            onTitleCommit={(t) => void handleRenameTitle(t)}
            onActiveNoteColorChange={(color) => void handleSetNoteColor(activeZone, activeNote, color)}
            onContentChange={handleContentChange}
            onEditorBlur={() => void flushSave()}
            onTogglePreview={() => void togglePreview()}
            onTogglePin={async () => {
                    const cfg = await configService.setAlwaysOnTop(!config.always_on_top);
              setConfig(cfg);
            }}
            onHide={() => {
              void (async () => {
                if (!(await flushAllDirty())) return;
                await appBridge.window.hide();
              })();
            }}
            onCreate={() =>
              void handleCreate(libraryOpen ? libraryZone : DEFAULT_ZONE)
            }
            onUndo={() => {
              const prev = undoHistory();
              if (prev != null) applyEditorContent(prev);
            }}
            onRedo={() => {
              const next = redoHistory();
              if (next != null) applyEditorContent(next);
            }}
            onFontSizeChange={async (size) => {
              const cfg = await configService.setEditorFontSize(size);
              setConfig(cfg);
            }}
            onThemeModeCycle={() => void handleThemeModeCycle()}
            onThemeModeChange={(mode) => void handleThemeModeChange(mode)}
            onThemeStyleChange={(theme) => void handleThemeStyleChange(theme)}
            onNoteColorLabelsChange={(labels) => void handleNoteColorLabelsChange(labels)}
            onToggleLibrary={() => setLibraryOpen((v) => !v)}
            onCloseLibrary={() => setLibraryOpen(false)}
            onOpenNote={(zone, name) => void handleOpenNote(zone, name)}
            onOpenNoteInMain={(zone, name) => void handleOpenNote(zone, name)}
            onOpenNoteAsSticky={(zone, name) => void handlePopoutTab(zone, name)}
            onCreateNote={(zone) => void handleCreate(zone)}
            onOpenLibraryFolder={() => void handleOpenLibraryFolder()}
            onCreateCapsuleTodo={() => void handleCreateCapsuleTodo()}
            onLibraryZoneChange={(zone) => void handleLibraryZoneChange(zone)}
            onColorSelect={(color) => void handleColorSelect(color)}
            onMoveNote={(name, from, to) => void handleMoveNote(name, from, to)}
            onRenameNote={(zone, oldName, newTitle) => void handleRenameNote(zone, oldName, newTitle)}
            onDeleteNote={(zone, name) => void handleDeleteNote(zone, name)}
            onSetNoteColor={(zone, name, color) => void handleSetNoteColor(zone, name, color)}
            onCreateFolder={(title) => void handleCreateFolder(title)}
            onRenameFolder={(oldId, title) => void handleRenameFolder(oldId, title)}
            onAutostartChange={async (enabled) => {
              const cfg = await configService.setAutostart(enabled);
              setConfig(cfg);
            }}
            onGlobalHotkeysSave={handleGlobalHotkeysSave}
            onClassificationConfigSave={async settings => { setConfig(await noteClassificationService.save(settings)); }}
            onAiConfigSave={handleAiConfigSave}
            onPinnedTabLimitChange={handlePinnedTabLimitChange}
            onFullscreenDodgeChange={handleFullscreenDodgeChange}
            fullSearchOpen={searchOmniboxOpen}
            onFullSearchOpenChange={setSearchOmniboxOpen}
            onReorderTabs={handleReorderTabs}
            onOpenCapsule={() => void handleOpenCapsule()}
            openTabs={openTabs}
            onSelectTab={(zone, name) => void handleSelectTab(zone, name)}
            onMiddleClickCloseTab={(zone, name) => void handleMiddleClickCloseTab(zone, name)}
            onCloseOtherTabs={() => void handleCloseOtherTabs()}
            isActiveTabPinned={isTabPinned(pinnedTabs, activeZone, activeNote)}
            onToggleTabPin={handleToggleTabPin}
            poppedOutNotes={poppedOutNotes}
            onPopoutTab={handlePopoutTab}
            pinnedTabs={pinnedTabs}
            replacePinPrompt={replacePinPrompt}
            onReplacePinnedTab={handleReplacePinnedTab}
            onDismissReplacePin={() => setReplacePinPrompt(null)}
            closePinnedPrompt={closePinnedPrompt}
            onConfirmClosePinned={() => void handleConfirmClosePinned()}
            onDismissClosePinned={() => setClosePinnedPrompt(null)}
            onOpenContainingFolder={() => void handleOpenContainingFolder()}
            onSiyuanUpload={() => void handleSiyuanUpload()}
            classificationEnabled={classificationReady(config.note_classification) && canClassifyNote(activeZone, activeNote, activeNoteColor === "隐私", defaultNoteOpen)}
            classificationBusy={classificationBusy}
            onClassifyNote={() => void handleClassifyNote()}
            siyuanUploading={siyuanUploading}
            onUploadConfigSave={handleUploadConfigSave}
            onManualSync={() => void handleManualSync()}
            manualSyncBusy={manualSyncBusy}
            onSiyuanConfigSave={handleSiyuanConfigSave}
            onSiyuanTestConnection={handleSiyuanTestConnection}
            recentNotes={config.recent_notes ?? []}
            resolveRecentTitle={resolveRecentTitle}
            onClearRecentNotes={handleClearRecentNotes}
            backlinks={backlinks}
            onImportAsset={handleImportAsset}
            onImportError={(message) => setError(message)}
            onEnsurePreviewMode={ensurePreviewMode}
            onWikilinkNavigate={handleWikilinkNavigate}
            onAiAssist={handleAiAssist}
            onArchiveNote={handleArchiveNote}
            onRestoreFromTrash={handleRestoreFromTrash}
            onPermanentlyDeleteTrash={handlePermanentlyDeleteTrash}
            onCreateFromTemplate={handleCreateFromTemplate}
            onDeleteCurrentNote={() => handleDeleteNote(activeZone, activeNote)}
            defaultNoteOpen={defaultNoteOpen}
            onOpenDefaultNote={() => void handleOpenDefaultNote()}
            onMessageHubSettingsSave={handleMessageHubSettingsSave}
            onMessageHubTestConnection={handleMessageHubTestConnection}
            onSyncEnabledChange={handleSyncEnabledChange}
            onSyncBootstrap={handleSyncBootstrap}
            onSyncResolveConflicts={handleSyncResolveConflicts}
            onLskyCleanupScan={handleLskyCleanupScan}
            onLskyCleanupDelete={handleLskyCleanupDelete}
            onCloudImgsCleanupScan={handleCloudImgsCleanupScan}
            onCloudImgsCleanupDelete={handleCloudImgsCleanupDelete}
            onImageHostConfigSave={handleImageHostConfigSave}
            onLskyTestConnection={handleLskyTestConnection}
            onCloudImgsTestConnection={handleCloudImgsTestConnection}
            windowFocusRevision={windowFocusRevision}
            privateModeActive={privateModeActive}
            privateContent={privateContent}
            privateContentRevision={privateContentRevision}
            onPrivateContentChange={handlePrivateContentChange}
            onEnterPrivateMode={() => void handleEnterPrivateMode()}
            onImagePasted={handleImagePasted}
            onHostedImageEdited={handleHostedImageEdited}
            onReuploadImage={handleReuploadImage}
            onDoodleSaved={handleDoodleSaved}
          />
        ) : (
          <div className="setup">
            <p>暂无便签</p>
            <div className="setup-quick-todo">
              <QuickTodoEntry />
            </div>
            <button type="button" className="primary" onClick={() => void handleCreate()}>
              新建便签
            </button>
            <button type="button" className="setup-capsule-todo-btn" onClick={() => void handleCreateCapsuleTodo()}>
              新建胶囊待办
            </button>
            <button type="button" onClick={() => void handleExpand()}>
              打开资料库
            </button>
          </div>
        )
      }
      {captureToast && <div className="capture-toast">{captureToast}</div>}
      {config && aiAssistOpen && (
        <Suspense fallback={null}>
          <AiAssistPanel
            open={aiAssistOpen}
            selection={aiSelection}
            config={config}
            onClose={() => {
              setAiAssistOpen(false);
              setAiSelection(null);
            }}
            onApply={(text, action) => {
              if (aiSelection) applyAiResult(aiSelection, text, action);
            }}
          />
        </Suspense>
      )}
    </div>
  );
}

export default App;
