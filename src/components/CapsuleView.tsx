/**
 * CapsuleView — 胶囊模式窗口（280×40px 透明窗口，圆头胶囊）
 *
 * 方案：透明窗口 + pointer 阈值拖动 → startDragging()
 * - body/#root 完全透明，圆角效果靠 .capsule-bar 自身
 * - 拖拽只绑在 .capsule-bar 的原生 pointer 事件，排除 button/input/[data-no-drag]
 * - 不使用 data-tauri-drag-region，不使用 capture 全局监听
 *
 * 交互：
 *   颜色圆点：只读
 *   标题：单击 → 还原便签窗口（PopoutView）；双击 → 编辑标题
 *   置顶：切换
 *   关闭：关闭胶囊（Tab 归还主窗口）
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { ColorTagSwatch } from "./ColorTagPicker";
import { Icon } from "./Icon";
import { CloseButton } from "./CloseButton";
import { WindowPinButton } from "./WindowPinButton";
import { noteColorHex } from "../constants/noteColors";
import type { CustomTagDef } from "../constants/noteColors";
import type { AppConfig, NoteZone } from "../types";
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
import "../App.css";

const DRAG_THRESHOLD_PX = 5;
const SHAPE_MOTION_MS = 140;
const DEFAULT_POPOUT_WIDTH = 400;
const DEFAULT_POPOUT_HEIGHT = 300;

type CapsuleSnapEdge = "left" | "right" | "top";

interface CapsuleInitPayload {
  zone: string;
  name: string;
  title: string;
  note_color: string | null;
  always_on_top: boolean;
  snap_edge?: CapsuleSnapEdge | null;
  source: "main" | "popout";
}

function applyTheme(config: AppConfig) {
  const mode = (config.theme_mode ?? "system") as ThemeMode;
  const effective = resolveEffectiveThemeMode(mode);
  document.documentElement.setAttribute("data-theme-mode", mode);
  document.documentElement.setAttribute("data-theme", effective);
  document.documentElement.setAttribute("data-light-theme", config.light_theme ?? "mknote");
  document.documentElement.setAttribute("data-dark-theme", config.dark_theme ?? "mknote");
  document.documentElement.setAttribute("data-accent-skin", config.accent_skin ?? "mknote");
}

/** 判断点击目标是否为真正的控件（应排除拖动）。标题不在此列：它需要同时支持点击和拖拽。 */
function isDragBlocked(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return Boolean(
    target.closest(
      'button, input, textarea, select, a, [role="button"], [contenteditable="true"], [data-no-drag]'
    )
  );
}

function isDragBlockedEvent(event: PointerEvent): boolean {
  if (isDragBlocked(event.target)) return true;
  return event.composedPath().some((item) =>
    item instanceof HTMLElement &&
    Boolean(item.closest("[data-no-drag], button, input, textarea, select, a, [role='button']"))
  );
}

export function CapsuleView() {
  const [initParams, setInitParams] = useState<CapsuleInitPayload | null>(null);
  const [initError, setInitError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const label = appBridge.window.current().label;
        const params = await windowService.takeCapsuleInit<CapsuleInitPayload>(label);
        if (cancelled) return;
        if (params) setInitParams(params);
        else setInitError("init failed");
      } catch (e) {
        if (!cancelled) setInitError(String(e));
      }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!initParams) return;
    const frame = window.requestAnimationFrame(() => {
      void appBridge.window.current().show().catch(() => undefined);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [initParams]);

  // 加载中：根层透明，不渲染任何背景
  if (!initParams) {
    return (
      <div className="capsule-root">
        {initError && (
          <div className="capsule-bar">
            <span className="capsule-title" style={{ opacity: 0.5 }}>{initError}</span>
          </div>
        )}
      </div>
    );
  }

  return (
    <CapsuleViewInner
      zone={initParams.zone as NoteZone}
      name={initParams.name}
      initialTitle={initParams.title}
      initialNoteColor={initParams.note_color}
      initialAlwaysOnTop={initParams.always_on_top}
      initialSnapEdge={initParams.snap_edge ?? null}
      source={initParams.source}
    />
  );
}

function CapsuleViewInner({
  zone,
  name,
  initialTitle,
  initialNoteColor,
  initialAlwaysOnTop,
  initialSnapEdge,
  source,
}: {
  zone: NoteZone;
  name: string;
  initialTitle: string;
  initialNoteColor: string | null;
  initialAlwaysOnTop: boolean;
  initialSnapEdge: CapsuleSnapEdge | null;
  source: "main" | "popout";
}) {
  const [title, setTitle] = useState(titleFromName(name) || initialTitle);
  const [titleDraft, setTitleDraft] = useState<string | null>(null);
  const [noteColor, setNoteColor] = useState<string | null>(initialNoteColor);
  const [customTags, setCustomTags] = useState<CustomTagDef[]>([]);
  const [alwaysOnTop, setAlwaysOnTop] = useState(initialAlwaysOnTop);
  const [snapEdge, setSnapEdge] = useState<CapsuleSnapEdge | null>(initialSnapEdge);
  const [error, setError] = useState<string | null>(null);
  const [restoringPopout, setRestoringPopout] = useState(false);
  const [completing, setCompleting] = useState(false);
  const nameRef = useRef(name);
  const closingRef = useRef(false);
  const barRef = useRef<HTMLDivElement>(null);
  const dragStartRef = useRef<{ x: number; y: number } | null>(null);
  const settleTimersRef = useRef<number[]>([]);
  const capsuleDragActiveRef = useRef(false);
  const settlingPositionRef = useRef(false);

  // ── 初始化 ────────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [cfg, tags, notes] = await Promise.all([
          configService.getConfig(),
          libraryService.listCustomTags(),
          notesService.list(zone),
        ]);
        if (cancelled) return;
        applyTheme(cfg);
        setCustomTags(tags);
        const found = notes.find((n) => n.name === nameRef.current);
        if (found?.color !== undefined) setNoteColor(found.color ?? null);
      } catch { /* 静默 */ }
    })();
    return () => { cancelled = true; };
  }, [zone]);

  useEffect(() => {
    const cleanup = createAsyncUnlistenCleanup(appBridge.listen<AppConfig>("mknote:theme-changed", (event) => {
      applyTheme(event.payload);
    }));
    return cleanup;
  }, []);

  useEffect(() => {
    const cleanup = createAsyncUnlistenCleanup(appBridge.listen<CapsuleSnapEdge | null>("mknote:capsule-snap-changed", (event) => {
      setSnapEdge(event.payload);
    }));
    return cleanup;
  }, []);

  const schedulePositionSettle = useCallback(() => {
    const win = appBridge.window.current();
    for (const timer of settleTimersRef.current) window.clearTimeout(timer);
    settleTimersRef.current = [];
    settlingPositionRef.current = true;
    const delays = [220, 480, 900];
    const attempt = (index: number) => {
      const timer = window.setTimeout(() => {
        settleTimersRef.current = [];
        if (closingRef.current) {
          settlingPositionRef.current = false;
          return;
        }
        void windowService.settleCapsulePosition({
          zone,
          name: nameRef.current,
          label: win.label,
        }).then((edge) => {
          if (edge) {
            settlingPositionRef.current = false;
            return;
          }
          if (index + 1 < delays.length) {
            attempt(index + 1);
          } else {
            settlingPositionRef.current = false;
          }
        }).catch(() => {
          settlingPositionRef.current = false;
        });
      }, delays[index]);
      settleTimersRef.current.push(timer);
    };
    attempt(0);
  }, [zone]);

  useEffect(() => {
    const cleanup = createAsyncUnlistenCleanup(appBridge.window.current().onMoved(() => {
      if (
        closingRef.current ||
        settlingPositionRef.current ||
        !capsuleDragActiveRef.current
      ) return;
      schedulePositionSettle();
    }));
    return cleanup;
  }, [schedulePositionSettle]);

  useEffect(() => () => {
    for (const timer of settleTimersRef.current) {
      window.clearTimeout(timer);
    }
    settleTimersRef.current = [];
  }, []);

  // ── 拖动：原生 pointer 事件 + 位移阈值，避免透明窗口和 React click 语义互相干扰 ──
  useEffect(() => {
    const el = barRef.current;
    if (!el) return;

    const clearPendingDrag = () => {
      dragStartRef.current = null;
    };

    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== 0) return;
      if (event.detail >= 2) return;
      if (isDragBlockedEvent(event)) {
        clearPendingDrag();
        return;
      }
      dragStartRef.current = { x: event.clientX, y: event.clientY };
    };

    const onPointerMove = (event: PointerEvent) => {
      const start = dragStartRef.current;
      if (!start) return;
      const dx = event.clientX - start.x;
      const dy = event.clientY - start.y;
      if (dx * dx + dy * dy < DRAG_THRESHOLD_PX * DRAG_THRESHOLD_PX) return;

      clearPendingDrag();
      capsuleDragActiveRef.current = true;
      event.preventDefault();
      const win = appBridge.window.current();
      void windowService.beginCapsuleDrag({ label: win.label })
        .catch(() => undefined)
        .then(() => win.startDragging())
        .catch(() => undefined)
        .finally(() => {
          capsuleDragActiveRef.current = false;
          schedulePositionSettle();
        });
    };

    const onPointerUp = () => {
      clearPendingDrag();
      if (capsuleDragActiveRef.current) {
        capsuleDragActiveRef.current = false;
        schedulePositionSettle();
      }
    };

    el.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerUp);
    return () => {
      el.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);
    };
  }, [schedulePositionSettle]);

  // ── 关闭 ──────────────────────────────────────────────────────────────
  const handleClose = useCallback(async () => {
    if (closingRef.current) return;
    closingRef.current = true;
    try {
      await windowService.closeCapsuleByLabel(zone, nameRef.current, appBridge.window.current().label);
    } catch {
      try { await appBridge.window.current().destroy(); } catch { /* ignore */ }
    }
  }, [zone]);

  useEffect(() => {
    const cleanup = createAsyncUnlistenCleanup(appBridge.window.current()
      .onCloseRequested(async (ev) => {
        if (closingRef.current) return;
        ev.preventDefault();
        await handleClose();
      }));
    return cleanup;
  }, [handleClose]);

  // ── 单击颜色标签：还原为便签窗口 ─────────────────────────────────────
  const handleExitToPopout = useCallback(async () => {
    if (closingRef.current || titleDraft !== null) return;
    setRestoringPopout(true);
    closingRef.current = true;
    try {
      await new Promise((resolve) => window.setTimeout(resolve, SHAPE_MOTION_MS));
      const win = appBridge.window.current();
      const scale = await win.scaleFactor();
      const pos = await win.outerPosition();
      const logicalX = pos.x / scale;
      const logicalY = pos.y / scale;
      await windowService.restoreCapsuleToPopout({
        zone, name: nameRef.current, title,
        width: DEFAULT_POPOUT_WIDTH, height: DEFAULT_POPOUT_HEIGHT,
        x: logicalX, y: logicalY,
        capsuleWindowLabel: win.label,
      });
    } catch (e) {
      closingRef.current = false;
      setRestoringPopout(false);
      setError(String(e));
    }
  }, [zone, title, titleDraft]);

  const handleTitleDoubleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setTitleDraft(title);
  }, [title]);

  // ── 置顶 ──────────────────────────────────────────────────────────────
  const handleTogglePin = useCallback(async () => {
    const next = !alwaysOnTop;
    try {
      await windowService.setCapsuleAlwaysOnTop({
        zone,
        name: nameRef.current,
        label: appBridge.window.current().label,
        always_on_top: next,
        alwaysOnTop: next,
      });
      setAlwaysOnTop(next);
    } catch (e) { setError(String(e)); }
  }, [alwaysOnTop, zone]);

  const handleComplete = useCallback(async () => {
    if (closingRef.current || completing) return;
    setCompleting(true);
    closingRef.current = true;
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
  }, [completing, zone]);


  // ── 标题编辑 ──────────────────────────────────────────────────────────
  const handleTitleCommit = useCallback(async (draft: string) => {
    const stem = draft.trim();
    setTitleDraft(null);
    if (!stem || stem === title) return;
    const err = validateFilenameTitle(stem);
    if (err) { setError(err); return; }
    try {
      const oldName = nameRef.current;
      const updated = await notesService.rename(zone, oldName, stem);
      nameRef.current = updated.name;
      setTitle(updated.title);
      await windowService.notifyPoppedOutRenamed({
        zone,
        oldName,
        newName: updated.name,
        title: updated.title,
      });
      setError(null);
    } catch (e) { setError(String(e)); }
  }, [zone, title]);

  const colorHex = noteColor ? noteColorHex(noteColor, customTags) : undefined;
  const leftSnapLayout = snapEdge === "left";
  void error; // error 通过 title tooltip 展示

  return (
    <div className={`capsule-root capsule-root--source-${source}${restoringPopout ? " capsule-root--restoring" : ""}`}>
      {/* 整个 bar 响应拖动，按钮和输入框用 data-no-drag 排除 */}
      <div
        className={`capsule-bar${leftSnapLayout ? " capsule-bar-left-snap" : ""}`}
        ref={barRef}
      >

        {/* 颜色圆点 */}
        <button
          type="button"
          className="capsule-dot-wrap"
          data-no-drag
          title="还原便签模式"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => void handleExitToPopout()}
        >
          {colorHex
            ? <span className="capsule-dot" style={{ background: colorHex }} />
            : <ColorTagSwatch color={noteColor} customTags={customTags} className="capsule-dot" />
          }
        </button>

        {/* 标题 */}
        {titleDraft !== null ? (
          <input
            className="capsule-title-input"
            data-no-drag
            value={titleDraft}
            autoFocus
            onChange={(e) => setTitleDraft(e.target.value)}
            onBlur={() => void handleTitleCommit(titleDraft)}
            onKeyDown={(e) => {
              if (e.key === "Enter") { e.preventDefault(); void handleTitleCommit(titleDraft); }
              if (e.key === "Escape") setTitleDraft(null);
            }}
          />
        ) : (
          <span
            className="capsule-title"
            title="双击编辑标题"
            onDoubleClick={handleTitleDoubleClick}
          >
            {title}
          </span>
        )}

          {/* 完成并归档 */}
          <button
            type="button"
            className={`capsule-btn capsule-complete-btn${completing ? " active" : ""}`}
            data-no-drag
            title="完成并归档"
            aria-label="完成并归档"
            disabled={completing}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => void handleComplete()}
        >
          <Icon name="task_done" size={16} />
        </button>

        {/* 置顶 */}
        <WindowPinButton className="capsule-btn capsule-pin-btn" pinned={alwaysOnTop} onPointerDown={(e) => e.stopPropagation()} onClick={() => void handleTogglePin()} />

        {/* 关闭 */}
        <CloseButton className="capsule-btn capsule-close-btn" aria-label="关闭胶囊" title="关闭胶囊" onPointerDown={(e) => e.stopPropagation()} onClick={() => void handleClose()} />
      </div>
    </div>
  );
}
