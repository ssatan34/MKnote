/**
 * PopoutView — 便签弹出独立窗口
 *
 * 通过 Tauri 事件 mknote:popout-init 接收 zone/name/title 参数。
 * 极简 UI：顶栏（Logo + 状态点 + 标题 + 预览切换 + 置顶 + 关闭）+ 编辑区。
 * 无 Tab 栏、无资料库、无底部状态栏。
 */
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { Icon } from "./Icon";
import { CloseButton } from "./CloseButton";
import { DeleteButton } from "./DeleteButton";
import { WindowPinButton } from "./WindowPinButton";
import { ColorTagPicker, ColorTagSwatch } from "./ColorTagPicker";
import { noteColorHex, noteColorTooltip, type CustomTagDef } from "../constants/noteColors";
import type { AppConfig, NoteZone } from "../types";
import { useDebouncedCallback } from "../hooks/useDebouncedCallback";
import { useEditorHistory } from "../hooks/useEditorHistory";
import { useQueuedNoteWriter } from "../hooks/useQueuedNoteWriter";
import { resolveEffectiveThemeMode } from "../constants/themeAccents";
import type { ThemeMode } from "../types";
import { validateFilenameTitle } from "../utils/filenameValidation";
import { titleFromName } from "../utils/noteTabs";
import { appBridge } from "../services/appBridge";
import { createAsyncUnlistenCleanup } from "../utils/asyncUnlisten";
import { configService } from "../services/configService";
import { libraryService } from "../services/libraryService";
import { notesService } from "../services/notesService";
import { windowService } from "../services/windowService";
import { resolveVisualEditorMode } from "../utils/visualEditorMode";
import { VisualEditorErrorBoundary } from "./VisualEditorErrorBoundary";
import { VisualEditorRecoveryPanel } from "./VisualEditorRecoveryPanel";
import "../App.css";

const VisualEditor = lazy(() =>
  import("./VisualEditor").then((module) => ({ default: module.VisualEditor })),
);

const SAVE_DEBOUNCE_MS = 600;
const DRAG_THRESHOLD_PX = 5;
const SHAPE_MOTION_MS = 72;
const USE_UNIFIED_NOTE_WINDOW = true;

type ViewMode = "edit" | "preview";
type WindowMode = "expanded" | "capsule";
type SaveStatus = "idle" | "saving" | "saved" | "error";
type SnapEdge = "left" | "right" | "top";

interface UnifiedWindowModePayload {
  mode: "expanded" | "transitioning-to-capsule" | "capsule" | "transitioning-to-expanded";
  snapEdge?: SnapEdge | null;
}

interface PopoutInitPayload {
  zone: string;
  name: string;
  title: string;
  always_on_top: boolean;
}

function applyTheme(config: AppConfig) {
  const mode = (config.theme_mode ?? "system") as ThemeMode;
  const effective = resolveEffectiveThemeMode(mode);
  document.documentElement.setAttribute("data-theme-mode", mode);
  document.documentElement.setAttribute("data-theme", effective);
  document.documentElement.setAttribute("data-light-theme", config.light_theme ?? "mknote");
  document.documentElement.setAttribute("data-dark-theme", config.dark_theme ?? "mknote");
  document.documentElement.setAttribute("data-accent-skin", config.accent_skin ?? "mknote");
  try {
    localStorage.setItem("mk-theme", effective);
    localStorage.setItem("mk-light-theme", config.light_theme ?? "mknote");
    localStorage.setItem("mk-dark-theme", config.dark_theme ?? "mknote");
    localStorage.setItem("mk-accent-skin", config.accent_skin ?? "mknote");
  } catch { /* 存储失败不影响功能 */ }
}

/**
 * 外层组件：挂载后按自身窗口 label 主动拉取 zone/name/title，收到后渲染内层。
 * 采用「拉」而非「推」：避免 Rust emit 与前端 listen 注册之间的时序竞争
 * （之前 emit 在 listen 注册前就派发，导致永远收不到、卡在初始化占位符 = 白屏）。
 */
export function PopoutView() {
  const [initParams, setInitParams] = useState<PopoutInitPayload | null>(null);
  const [initError, setInitError] = useState<string | null>(null);

  // 初始化参数丢失时无法调用 close_note_popout（此时还不知道 zone/name），
  // 但窗口仍然必须可关闭，避免无边框窗口留下无法操作的错误页。
  const closeInitErrorWindow = useCallback(async () => {
    try {
      await appBridge.window.current().destroy();
    } catch {
      // 关闭失败时保留错误页，方便用户通过任务管理器结束异常窗口。
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const label = appBridge.window.current().label;
        const params = await windowService.takePopoutInit<PopoutInitPayload>(label);
        if (cancelled) return;
        if (params) {
          setInitParams(params);
        } else {
          setInitError("未能获取窗口初始化参数");
        }
      } catch (e) {
        if (!cancelled) setInitError(String(e));
      }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!initError) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" || ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "w")) {
        event.preventDefault();
        void closeInitErrorWindow();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [closeInitErrorWindow, initError]);

  if (!initParams) {
    return (
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        height: "100%",
        color: initError ? "var(--mk-status-error, #c00)" : "var(--mk-body-muted, #888)",
        fontFamily: "sans-serif",
        fontSize: 14,
        background: "var(--mk-canvas, #fefcf7)",
        position: "relative",
      }}>
        <span>{initError ?? "正在初始化…"}</span>
        {initError && (
          <CloseButton
            size="standard"
            aria-label="关闭初始化失败窗口"
            title="关闭初始化失败窗口"
            onClick={() => void closeInitErrorWindow()}
            className="popout-init-error-close"
          />
        )}
      </div>
    );
  }

  return (
    <PopoutViewInner
      zone={initParams.zone as NoteZone}
      name={initParams.name}
      initialTitle={initParams.title}
      initialAlwaysOnTop={initParams.always_on_top}
    />
  );
}

interface PopoutViewInnerProps {
  zone: NoteZone;
  name: string;
  initialTitle: string;
  initialAlwaysOnTop: boolean;
}

function PopoutViewInner({ zone, name, initialTitle, initialAlwaysOnTop }: PopoutViewInnerProps) {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [content, setContent] = useState("");
  const [title, setTitle] = useState(titleFromName(name) || initialTitle);
  const [titleDraft, setTitleDraft] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("preview");
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [dirty, setDirty] = useState(false);
  const [alwaysOnTop, setAlwaysOnTop] = useState(initialAlwaysOnTop);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // 颜色标签：与主窗口标题栏左侧的 ColorTagSwatch 功能一致
  const [noteColor, setNoteColor] = useState<string | null>(null);
  const [customTags, setCustomTags] = useState<CustomTagDef[]>([]);
  const [colorPickerOpen, setColorPickerOpen] = useState(false);
  const [windowMode, setWindowMode] = useState<WindowMode>("expanded");
  const [shapeMotion, setShapeMotion] = useState<"idle" | "to-capsule" | "to-expanded">("idle");
  const [snapEdge, setSnapEdge] = useState<SnapEdge | null>(null);
  const [completing, setCompleting] = useState(false);
  const [deleteConfirming, setDeleteConfirming] = useState(false);
  const [returningDelete, setReturningDelete] = useState(false);
  const [visualEditorFailed, setVisualEditorFailed] = useState(false);

  const contentRef = useRef(content);
  const dirtyRef = useRef(dirty);
  const contentHashRef = useRef<string | undefined>(undefined);
  const editorRevisionRef = useRef(0);
  const windowModeRef = useRef<WindowMode>("expanded");
  const nameRef = useRef(name);

  const visualEditorRequested =
    resolveVisualEditorMode(import.meta.env.VITE_MKNOTE_EDITOR_MODE) === "visual-prosemirror" &&
    viewMode === "preview" &&
    zone !== "private" &&
    windowMode === "expanded";
  const useVisualEditor = visualEditorRequested && !visualEditorFailed;
  const openSourceEditor = useCallback(() => {
    setVisualEditorFailed(true);
    setViewMode("edit");
  }, []);
  const [activeName, setActiveName] = useState(name);

  const { reset: resetHistory, push: pushHistory, undo: undoHistory, redo: redoHistory } = useEditorHistory();
  const dragDownRef = useRef<{ x: number; y: number } | null>(null);
  const didDragRef = useRef(false);
  const geometryTimersRef = useRef<number[]>([]);
  const capsuleSettleTimerRef = useRef<number | null>(null);
  const closingRef = useRef(false);

  const writeNoteQueued = useQueuedNoteWriter(
    ({ zone: saveZone, name: saveName, text, expectedContentHash }) =>
      notesService.write(saveZone, saveName, text, expectedContentHash),
  );

  useEffect(() => {
    if (!deleteConfirming) return;
    const timer = window.setTimeout(() => {
      setDeleteConfirming(false);
      setReturningDelete(true);
      window.setTimeout(() => setReturningDelete(false), 320);
    }, 2000);
    return () => window.clearTimeout(timer);
  }, [deleteConfirming]);

  useEffect(() => { contentRef.current = content; }, [content]);
  useEffect(() => { dirtyRef.current = dirty; }, [dirty]);
  useEffect(() => { windowModeRef.current = windowMode; }, [windowMode]);
  useEffect(() => {
    document.body.classList.toggle("unified-capsule-window", windowMode === "capsule");
    if (windowMode === "capsule") {
      document.documentElement.style.background = "transparent";
    } else {
      document.documentElement.style.background = "";
    }
    return () => {
      document.body.classList.remove("unified-capsule-window");
      document.documentElement.style.background = "";
    };
  }, [windowMode]);

  const cancelGeometrySettle = useCallback(() => {
    for (const timer of geometryTimersRef.current) {
      window.clearTimeout(timer);
    }
    geometryTimersRef.current = [];
  }, []);

  const scheduleGeometrySettle = useCallback(() => {
    if (windowModeRef.current === "capsule") return;
    const win = appBridge.window.current();
    for (const delay of [120, 500, 1200]) {
      const timer = window.setTimeout(() => {
        if (closingRef.current || windowModeRef.current !== "expanded") return;
        void windowService.settlePopoutGeometry({
          zone,
          name: nameRef.current,
          label: win.label,
          title,
        }).catch(() => undefined);
      }, delay);
      geometryTimersRef.current.push(timer);
    }
  }, [title, zone]);

  const scheduleUnifiedCapsuleSettle = useCallback(() => {
    const win = appBridge.window.current();
    if (capsuleSettleTimerRef.current !== null) {
      window.clearTimeout(capsuleSettleTimerRef.current);
    }
    capsuleSettleTimerRef.current = window.setTimeout(() => {
      capsuleSettleTimerRef.current = null;
      if (closingRef.current || windowModeRef.current !== "capsule") return;
      void windowService.settleUnifiedNoteCapsulePosition({
        label: win.label,
      })
        .then((edge) => {
          setSnapEdge((edge as SnapEdge | null) ?? null);
        })
        .catch(() => undefined);
    }, 120);
  }, []);

  useEffect(() => () => {
    cancelGeometrySettle();
    if (capsuleSettleTimerRef.current !== null) {
      window.clearTimeout(capsuleSettleTimerRef.current);
    }
  }, [cancelGeometrySettle]);

  // ── 初始化：加载配置和笔记内容 ─────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const cfg = await configService.getConfig();
        if (cancelled) return;
        setConfig(cfg);
        applyTheme(cfg);

        const snapshot = await notesService.readSnapshot(zone, name);
        if (cancelled) return;
        setContent(snapshot.content);
        contentRef.current = snapshot.content;
        contentHashRef.current = snapshot.contentHash;
        editorRevisionRef.current = 0;
        resetHistory(snapshot.content);
        setLoading(false);

        // 加载颜色标签与自定义标签（供标题栏颜色选择器使用）
        try {
          const [notes, tags] = await Promise.all([
            notesService.list(zone),
            libraryService.listCustomTags(),
          ]);
          if (cancelled) return;
          setNoteColor(notes.find((n) => n.name === nameRef.current)?.color ?? null);
          setCustomTags(tags);
        } catch { /* 颜色信息加载失败不影响编辑 */ }
      } catch (e) {
        if (!cancelled) {
          setError(String(e));
          setLoading(false);
        }
      }

      // 无论初始化成功与否，都显示窗口（窗口以 visible(false) 创建）
      if (!cancelled) {
        void appBridge.window.current().show().catch(() => undefined);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const cleanup = createAsyncUnlistenCleanup(appBridge.listen<AppConfig>("mknote:theme-changed", (event) => {
      const cfg = event.payload;
      setConfig(cfg);
      applyTheme(cfg);
    }));
    return cleanup;
  }, []);

  useEffect(() => {
    const cleanup = createAsyncUnlistenCleanup(appBridge.listen<"left" | "right" | "top" | null>("mknote:capsule-snap-changed", (event) => {
      setSnapEdge(event.payload ?? null);
    }));
    return cleanup;
  }, []);

  useEffect(() => {
    const cleanup = createAsyncUnlistenCleanup(appBridge.listen<UnifiedWindowModePayload>("mknote:unified-window-mode", (event) => {
      const payload = event.payload;
      const nextMode: WindowMode =
        payload.mode === "capsule" || payload.mode === "transitioning-to-capsule"
          ? "capsule"
          : "expanded";
      windowModeRef.current = nextMode;
      setWindowMode(nextMode);
      setSnapEdge(payload.snapEdge ?? null);
      setShapeMotion("idle");

      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => {
          void windowService.ackUnifiedNoteWindowModeReady({
            label: appBridge.window.current().label,
          }).catch(() => undefined);
        });
      });
    }));
    return cleanup;
  }, []);

  // ── 保存 ──────────────────────────────────────────────────────────────
  const writeCurrentNote = useCallback(async (text: string) => {
    const revision = await writeNoteQueued({
      zone,
      name: nameRef.current,
      text,
      expectedContentHash: contentHashRef.current,
      editorRevision: editorRevisionRef.current,
    });
    contentHashRef.current = revision.contentHash;
    return revision;
  }, [writeNoteQueued, zone]);

  const flushSave = useCallback(async () => {
    if (!dirtyRef.current) return;
    const text = contentRef.current;
    setSaveStatus("saving");
    try {
      await writeCurrentNote(text);
      if (contentRef.current === text) {
        setDirty(false);
        setSaveStatus("saved");
      }
    } catch (e) {
      setSaveStatus("error");
      setError(String(e));
    }
  }, [writeCurrentNote]);

  const [debouncedSave, cancelDebouncedSave] = useDebouncedCallback(() => {
    void flushSave();
  }, SAVE_DEBOUNCE_MS);

  const handleContentChange = (value: string) => {
    contentRef.current = value;
    editorRevisionRef.current += 1;
    setContent(value);
    setDirty(true);
    dirtyRef.current = true;
    setSaveStatus("idle");
    pushHistory(value);
    debouncedSave();
  };

  // ── 关闭 ──────────────────────────────────────────────────────────────
  // 防重入：close_note_popout 会触发 w.close() → onCloseRequested → 若再次
  // 调用 handleClose 就会无限递归（窗口永远关不掉、CPU 打满）。用此守卫打断。
  const handleClose = useCallback(async () => {
    if (closingRef.current) return;
    closingRef.current = true;
    cancelDebouncedSave();
    if (dirtyRef.current) {
      try {
        await writeCurrentNote(contentRef.current);
      } catch (e) {
        closingRef.current = false;
        setSaveStatus("error");
        setError(String(e));
        return;
      }
    }
    try {
      await windowService.closeNotePopout(zone, nameRef.current);
    } catch {
      // 兜底：命令失败也强制销毁窗口，避免关不掉
      try { await appBridge.window.current().destroy(); } catch { /* ignore */ }
    }
  }, [cancelDebouncedSave, writeCurrentNote, zone]);

  const handleDelete = useCallback(async () => {
    if (closingRef.current) return;
    closingRef.current = true;
    cancelDebouncedSave();
    try {
      if (dirtyRef.current) {
      await writeCurrentNote(contentRef.current);
      }
      await windowService.deleteNotePopout(zone, nameRef.current);
    } catch (e) {
      closingRef.current = false;
      setError(String(e));
    }
  }, [cancelDebouncedSave, writeCurrentNote, zone]);

  useEffect(() => {
    const cleanup = createAsyncUnlistenCleanup(appBridge.window.current()
      .onCloseRequested(async (event) => {
        // 已在关闭流程中：放行本次 close，不再拦截（否则窗口永远关不掉）。
        if (closingRef.current) return;
        event.preventDefault();
        await handleClose();
      }));
    return cleanup;
  }, [handleClose]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "w") {
        e.preventDefault();
        void handleClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [handleClose]);

  // ── 顶栏拖动 ──────────────────────────────────────────────────────────
  useEffect(() => {
    const onPointerMove = (e: PointerEvent) => {
      const down = dragDownRef.current;
      if (!down || didDragRef.current) return;
      const dx = e.clientX - down.x;
      const dy = e.clientY - down.y;
      if (dx * dx + dy * dy >= DRAG_THRESHOLD_PX * DRAG_THRESHOLD_PX) {
        didDragRef.current = true;
        if (windowModeRef.current === "capsule") {
          void windowService.beginCapsuleDrag({ label: appBridge.window.current().label })
            .catch(() => undefined);
          setSnapEdge(null);
        }
        void appBridge.window.current().startDragging()
          .catch(() => undefined)
          .finally(() => {
            if (windowModeRef.current === "capsule") {
              scheduleUnifiedCapsuleSettle();
            } else {
              scheduleGeometrySettle();
            }
          });
      }
    };
    const onPointerUp = () => { dragDownRef.current = null; didDragRef.current = false; };
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    };
  }, [scheduleGeometrySettle, scheduleUnifiedCapsuleSettle]);

  useEffect(() => {
    const win = appBridge.window.current();
    const unsubs = [
      createAsyncUnlistenCleanup(win.onMoved(() => {
        scheduleGeometrySettle();
      })),
      createAsyncUnlistenCleanup(win.onResized(() => {
        scheduleGeometrySettle();
      })),
    ];
    return () => unsubs.forEach((unlisten) => unlisten());
  }, [scheduleGeometrySettle]);

  // ── 颜色选择器：点击外部 / Esc 关闭 ─────────────────────────────────────
  useEffect(() => {
    if (!colorPickerOpen) return;
    const onDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest("[data-popout-color]")) return;
      setColorPickerOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setColorPickerOpen(false); };
    document.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [colorPickerOpen]);

  // ── 置顶 ──────────────────────────────────────────────────────────────
  const handleTogglePin = useCallback(async () => {
    const next = !alwaysOnTop;
    try {
      await windowService.setPopoutAlwaysOnTop({
        zone,
        name: nameRef.current,
        label: appBridge.window.current().label,
        title,
        always_on_top: next,
        alwaysOnTop: next,
      });
      setAlwaysOnTop(next);
    } catch (e) { setError(String(e)); }
  }, [alwaysOnTop, title, zone]);

  const handleCompleteCapsule = useCallback(async () => {
    if (closingRef.current || completing) return;
    cancelDebouncedSave();
    if (dirtyRef.current) {
      try { await flushSave(); } catch { /* archive flow will surface the final error */ }
    }
    closingRef.current = true;
    setCompleting(true);
    try {
      await windowService.completeCapsuleNote({
        zone,
        name: nameRef.current,
        label: appBridge.window.current().label,
      });
    } catch (e) {
      closingRef.current = false;
      setCompleting(false);
      setError(String(e));
    }
  }, [cancelDebouncedSave, completing, flushSave, zone]);

  // ── 颜色标签 ──────────────────────────────────────────────────────────
  const handleSetColor = useCallback(async (color: string | null) => {
    setColorPickerOpen(false);
    try {
      await notesService.setColor(zone, nameRef.current, color);
      setNoteColor(color);
    } catch (e) { setError(String(e)); }
  }, [zone]);

  // ── 进入胶囊模式 ──────────────────────────────────────────────────────
  const handleEnterCapsule = useCallback(async () => {
    if (shapeMotion !== "idle") return;
    try {
      const win = appBridge.window.current();
      if (USE_UNIFIED_NOTE_WINDOW) {
        cancelGeometrySettle();
        setShapeMotion("to-capsule");
        await windowService.collapseNoteWindowToCapsule({
          zone,
          name: nameRef.current,
          title,
          always_on_top: true,
          alwaysOnTop: true,
          label: win.label,
        });
        setAlwaysOnTop(true);
        return;
      }
      setShapeMotion("to-capsule");
      await new Promise((resolve) => window.setTimeout(resolve, SHAPE_MOTION_MS));
      const scale = await win.scaleFactor();
      const pos = await win.outerPosition();
      const anchorX = pos.x / scale;
      const anchorY = pos.y / scale;
      await windowService.restorePopoutToCapsule({
        zone,
        name: nameRef.current,
        title,
        noteColor,
        alwaysOnTop: true,
        anchorX,
        anchorY,
        source: "popout",
        popoutWindowLabel: win.label,
      });
    } catch (e) {
      setShapeMotion("idle");
      setError(String(e));
    }
  }, [shapeMotion, zone, title, noteColor, cancelGeometrySettle]);

  const handleExitCapsule = useCallback(async () => {
    if (shapeMotion !== "idle") return;
    setShapeMotion("to-expanded");
    try {
      await windowService.expandNoteWindowFromCapsule({
        zone,
        name: nameRef.current,
        title,
        always_on_top: alwaysOnTop,
        alwaysOnTop,
        label: appBridge.window.current().label,
      });
    } catch (e) {
      setShapeMotion("idle");
      setError(String(e));
    }
  }, [shapeMotion, zone, title, alwaysOnTop]);

  // ── 预览切换 ──────────────────────────────────────────────────────────
  const handleTogglePreview = useCallback(async () => {
    if (viewMode === "edit") {
      cancelDebouncedSave();
      await flushSave();
      setViewMode("preview");
    } else {
      setViewMode("edit");
    }
  }, [viewMode, flushSave, cancelDebouncedSave]);

  // ── 标题重命名 ────────────────────────────────────────────────────────
  const handleTitleCommit = useCallback(async (newTitle: string) => {
    const stem = newTitle.trim();
    setTitleDraft(null);
    if (!stem) {
      return;
    }
    if (stem === title) {
      return;
    }
    const err = validateFilenameTitle(stem);
    if (err) { setError(err); return; }
    try {
      cancelDebouncedSave();
      if (dirtyRef.current) {
      await writeCurrentNote(contentRef.current);
        setDirty(false);
        dirtyRef.current = false;
      }
      const oldName = nameRef.current;
      const updated = await notesService.rename(zone, oldName, stem);
      nameRef.current = updated.name;
      setActiveName(updated.name);
      setTitle(updated.title);
      await windowService.notifyPoppedOutRenamed({
        zone,
        oldName,
        newName: updated.name,
        title: updated.title,
      });
      setError(null);
    } catch (e) { setError(String(e)); }
  }, [cancelDebouncedSave, title, writeCurrentNote, zone]);

  // ── Undo/Redo ─────────────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      if (e.key.toLowerCase() === "z" && !e.shiftKey) {
        e.preventDefault();
        const prev = undoHistory();
      if (prev != null) {
        contentRef.current = prev;
        editorRevisionRef.current += 1;
        setContent(prev);
        setDirty(true);
        dirtyRef.current = true;
        debouncedSave();
      }
      }
      if (e.key.toLowerCase() === "y" || (e.key.toLowerCase() === "z" && e.shiftKey)) {
        e.preventDefault();
        const next = redoHistory();
      if (next != null) {
        contentRef.current = next;
        editorRevisionRef.current += 1;
        setContent(next);
        setDirty(true);
        dirtyRef.current = true;
        debouncedSave();
      }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undoHistory, redoHistory, debouncedSave]);

  if (loading || !config) {
    return (
      <div style={{ padding: 20, color: "var(--mk-body-muted, #555)", background: "var(--mk-canvas, #fefcf7)", fontFamily: "sans-serif", fontSize: 14 }}>
        加载笔记中…
      </div>
    );
  }

  const saveStatusText =
    saveStatus === "saving" ? "保存中…" :
    saveStatus === "error" ? "保存失败" :
    dirty ? "未保存" : "已保存";
  const colorHex = noteColor ? noteColorHex(noteColor, customTags) : undefined;

  if (windowMode === "capsule") {
    return (
      <div className={`popout-view popout-view--capsule${shapeMotion === "to-expanded" ? " popout-view--to-expanded" : ""}`}>
        <div
          className={`capsule-bar popout-unified-capsule-bar${snapEdge === "left" ? " capsule-bar-left-snap" : ""}`}
          onPointerDown={(e) => {
            if (e.button !== 0) return;
            const target = e.target as HTMLElement;
            if (target.closest("button, input, [data-no-drag]")) return;
            dragDownRef.current = { x: e.clientX, y: e.clientY };
            didDragRef.current = false;
          }}
        >
          <button
            type="button"
            className="capsule-dot-wrap"
            data-no-drag
            title="还原便签模式"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => void handleExitCapsule()}
          >
            {colorHex
              ? <span className="capsule-dot" style={{ background: colorHex }} />
              : <ColorTagSwatch color={noteColor} customTags={customTags} className="capsule-dot" />
            }
          </button>

          {titleDraft !== null ? (
            <input
              className="capsule-title-input"
              data-no-drag
              value={titleDraft}
              autoFocus
              onChange={(e) => setTitleDraft(e.target.value)}
              onBlur={() => void handleTitleCommit(titleDraft)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  e.currentTarget.blur();
                }
                if (e.key === "Escape") setTitleDraft(null);
              }}
            />
          ) : (
            <span
              className="capsule-title"
              title={saveStatusText}
              onDoubleClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setTitleDraft(title);
              }}
            >
              {title}
            </span>
          )}

          <button
            type="button"
            className={`capsule-btn capsule-complete-btn${completing ? " active" : ""}`}
            data-no-drag
            title="完成并归档"
            aria-label="完成并归档"
            disabled={completing}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => void handleCompleteCapsule()}
          >
            <Icon name="task_done" size={16} />
          </button>
          <WindowPinButton className="capsule-btn capsule-pin-btn" pinned={alwaysOnTop} onPointerDown={(e) => e.stopPropagation()} onClick={() => void handleTogglePin()} />
          <CloseButton className="capsule-btn capsule-close-btn" aria-label="关闭（Tab 返回主窗口）" title="关闭（Tab 返回主窗口）" onPointerDown={(e) => e.stopPropagation()} onClick={() => void handleClose()} />
        </div>
      </div>
    );
  }

  return (
    <div className={`popout-view${shapeMotion === "to-capsule" ? " popout-view--to-capsule" : ""}`}>
      <div
        className="popout-titlebar"
        onPointerDown={(e) => {
          if (e.button !== 0) return;
          if (e.detail >= 2) return;
          const target = e.target as HTMLElement;
          if (target.closest("button, input, [data-no-drag]")) return;
          dragDownRef.current = { x: e.clientX, y: e.clientY };
          didDragRef.current = false;
        }}
      >
        <span className="popout-color-wrap" data-popout-color data-no-drag onPointerDown={(e) => e.stopPropagation()}>
          <button
            type="button"
            className={`popout-color-btn${colorPickerOpen ? " active" : ""}`}
            title={`${noteColorTooltip(noteColor, config.note_color_labels, customTags)} · 双击进入胶囊模式`}
            onClick={() => setColorPickerOpen((v) => !v)}
            onDoubleClick={(e) => { e.stopPropagation(); void handleEnterCapsule(); }}
          >
            <ColorTagSwatch color={noteColor} customTags={customTags} className="note-color-trigger-dot" />
          </button>
          {colorPickerOpen && (
            <div className="popout-color-menu" onMouseDown={(e) => e.stopPropagation()}>
              <ColorTagPicker
                value={noteColor}
                layout="horizontal"
                colorLabels={config.note_color_labels}
                customTags={customTags}
                showCustomTags
                onChange={(color) => void handleSetColor(color)}
              />
            </div>
          )}
        </span>

        <span
          className={`popout-status-dot${dirty ? " dirty" : ""}`}
          title={saveStatusText}
          aria-label={saveStatusText}
        />

        {titleDraft !== null ? (
          <input
            className="popout-title-input"
            data-no-drag
            value={titleDraft}
            title={titleDraft}
            autoFocus
            onChange={(e) => setTitleDraft(e.target.value)}
            onFocus={(e) => e.currentTarget.select()}
            onBlur={() => void handleTitleCommit(titleDraft)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.currentTarget.blur();
              }
              if (e.key === "Escape") {
                setTitleDraft(null);
              }
            }}
          />
        ) : (
          <span
            className="popout-title"
            title="双击重命名"
            onDoubleClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setTitleDraft(title);
            }}
          >
            {title}
          </span>
        )}

        <div className="popout-actions" onPointerDown={(e) => e.stopPropagation()} data-no-drag>
          <button
            type="button"
            className="popout-action-btn"
            title="进入胶囊模式"
            onClick={() => void handleEnterCapsule()}
          >
            <Icon name="collapse" size={16} />
          </button>
          <button
            type="button"
            className={`popout-action-btn${viewMode === "preview" ? " active" : ""}`}
            title={viewMode === "preview" ? "切换到编辑" : "切换到预览"}
            onClick={() => void handleTogglePreview()}
          >
            <Icon name="preview" size={16} />
          </button>
          <WindowPinButton className="popout-action-btn" pinned={alwaysOnTop} onClick={() => void handleTogglePin()} />
          {deleteConfirming ? (
            <button
              type="button"
              className="popout-action-btn popout-delete-confirm"
              aria-label="确认删除笔记"
              title="确认删除"
              onClick={() => void handleDelete()}
            >
              <Icon name="confirm" size={16} />
            </button>
          ) : (
            <DeleteButton
              className={`popout-action-btn popout-delete${returningDelete ? " delete-button--returning" : ""}`}
              aria-label="删除笔记"
              title="删除笔记"
              onClick={() => setDeleteConfirming(true)}
              iconSize={11}
            />
          )}
          <CloseButton className="popout-action-btn popout-close-btn" aria-label="关闭（Tab 返回主窗口）" title="关闭（Tab 返回主窗口）" onClick={() => void handleClose()} />
        </div>
      </div>

      {error && (
        <div style={{ padding: "6px 12px", background: "#fee2e2", color: "#991b1b", fontSize: 12, display: "flex", justifyContent: "space-between" }} role="alert">
          <span>{error}</span>
          <button type="button" onClick={() => setError(null)} style={{ background: "none", border: "none", cursor: "pointer" }}>×</button>
        </div>
      )}

      <div className="popout-editor">
        {viewMode === "edit" ? (
          <textarea
            key={`${activeName}:edit`}
            className="editor"
            defaultValue={content}
            onInput={(e) => handleContentChange(e.currentTarget.value)}
            onBlur={() => void flushSave()}
            spellCheck={false}
            placeholder="在此输入 Markdown…"
            style={{ fontSize: config.editor_font_size ?? 16 }}
          />
        ) : useVisualEditor ? (
          <Suspense fallback={null}>
            <VisualEditorErrorBoundary onError={openSourceEditor}>
              <VisualEditor
                key={`${activeName}:visual`}
                noteKey={`${zone}:${activeName}`}
                content={content}
                contentRevision={editorRevisionRef.current}
                onChange={handleContentChange}
                onPrepareMigrationSnapshot={async () => {
                  await notesService.ensureVisualEditorMigrationSnapshot(zone, nameRef.current);
                }}
                onBlur={() => void flushSave()}
                onError={openSourceEditor}
              />
            </VisualEditorErrorBoundary>
          </Suspense>
        ) : (
          <VisualEditorRecoveryPanel onOpenSourceEditor={openSourceEditor} />
        )}
      </div>
    </div>
  );
}
