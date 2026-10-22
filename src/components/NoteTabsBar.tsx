import { memo, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { join } from "@tauri-apps/api/path";
import { Icon } from "./Icon";
import type { NoteTab, NoteZone, OpenTabRef } from "../types";
import { tabKey, tabsEqual } from "../utils/noteTabs";
import { fitPinnedTabs } from "../utils/pinnedTabLayout";
import {
  applyTabDisplacement,
  canReorderTabGroups,
  clearTabDisplacementWithoutAnimation,
  findTabIntrusionTarget,
  getTabDisplacement,
  nativePreviewOffset,
  reorderTabsByKey,
  type TabDragRect,
} from "../utils/noteTabDragModel";
import { noteColorHex } from "../constants/noteColors";
import { windowService } from "../services/windowService";
import { notesService } from "../services/notesService";
import "./NoteTabsBar.css";

function truncateTabTitle(title: string, maxCharacters = 6): string {
  const characters = Array.from(title);
  return characters.length > maxCharacters
    ? `${characters.slice(0, maxCharacters).join("")}...`
    : title;
}

interface DraggableNoteTabProps {
  tab: NoteTab;
  active: boolean;
  accentHex?: string;
  isDragging: boolean;
  onPointerDown: React.PointerEventHandler<HTMLButtonElement>;
  onPointerMove: React.PointerEventHandler<HTMLButtonElement>;
  onPointerUp: React.PointerEventHandler<HTMLButtonElement>;
  onPointerCancel: React.PointerEventHandler<HTMLButtonElement>;
  onSelect: () => void;
  onAuxClick: (e: React.MouseEvent) => void;
  onContextMenu: (e: React.MouseEvent) => void;
}

function DraggableNoteTab({
  tab,
  active,
  accentHex,
  isDragging,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
  onSelect,
  onAuxClick,
  onContextMenu,
}: DraggableNoteTabProps) {
  const id = tabKey(tab.zone, tab.name);
  const visibleTitle = tab.pinned ? tab.title : truncateTabTitle(tab.title);
  const style = {
    ...(active && accentHex ? { "--tab-accent": accentHex } : {}),
  } as React.CSSProperties;

  return (
    <button
      type="button"
      data-tab-key={id}
      data-tab-group={tab.pinned ? "pinned" : "regular"}
      className={`note-tab${active ? " active" : ""}${isDragging ? " dragging" : ""}${tab.pinned ? " pinned" : ""}`}
      style={style}
      title={`${tab.title}${tab.pinned ? "（已置顶）" : ""}（拖动排序，中键关闭）`}
      aria-label={tab.title}
      aria-current={active ? "page" : undefined}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      onClick={onSelect}
      onAuxClick={onAuxClick}
      onContextMenu={onContextMenu}
    >
      <span className="note-tab-label">{visibleTitle}</span>
    </button>
  );
}

interface NoteTabsBarProps {
  pinnedDockTarget: HTMLElement | null;
  "data-testid"?: string;
  tabs: NoteTab[];
  activeZone: NoteZone;
  activeNote: string;
  onSelectTab: (zone: NoteZone, name: string) => void;
  onMiddleClickClose: (zone: NoteZone, name: string) => void;
  onCloseOthers: () => void;
  onNewTab: () => void;
  onNewCapsuleTodo?: () => void;
  onReorderTabs?: (fromIndex: number, toIndex: number) => void;
  closePinnedPrompt?: OpenTabRef | null;
  closePinnedPromptTitle?: string;
  onConfirmClosePinned?: () => void;
  onDismissClosePinned?: () => void;
  /** 弹出 Tab 为独立窗口；screenX/screenY 为新窗口左上角位置（屏幕坐标） */
  onPopoutTab?: (zone: NoteZone, name: string, screenX?: number, screenY?: number) => void;
}

function NoteTabsBarComponent({
  pinnedDockTarget,
  "data-testid": dataTestId,
  tabs,
  activeZone,
  activeNote,
  onSelectTab,
  onMiddleClickClose,
  onCloseOthers,
  onNewTab,
  onNewCapsuleTodo,
  onReorderTabs,
  closePinnedPrompt,
  closePinnedPromptTitle,
  onConfirmClosePinned,
  onDismissClosePinned,
  onPopoutTab,
}: NoteTabsBarProps) {
  const closePinnedWrapRef = useRef<HTMLDivElement>(null);
  const closePinnedPopoverRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const pinnedTrackRef = useRef<HTMLDivElement>(null);
  const pinnedMeasureRef = useRef<HTMLDivElement>(null);
  const pinnedMoreRef = useRef<HTMLDivElement>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);
  const [visiblePinnedIndices, setVisiblePinnedIndices] = useState<number[]>([]);
  const [pinnedMenuOpen, setPinnedMenuOpen] = useState(false);
  const didDragRef = useRef(false);
  const dragGrabOffsetRef = useRef({ x: 0, y: 0 });
  const dragElementsRef = useRef<HTMLElement[]>([]);
  const dragRectsRef = useRef<TabDragRect[]>([]);
  const dragActiveWidthRef = useRef(0);
  const dragSlotWidthRef = useRef(0);
  const dragOverKeyRef = useRef<string | null>(null);
  const dragActiveKeyRef = useRef<string | null>(null);
  const dragPointerRef = useRef<{
    pointerId: number;
    key: string;
    startClientX: number;
    startClientY: number;
  } | null>(null);
  const dragDeltaXRef = useRef(0);
  const dragOutPreviewVisibleRef = useRef(false);
  const dragCanceledRef = useRef(false);
  const latestTabsRef = useRef(tabs);
  const latestOnReorderRef = useRef(onReorderTabs);
  const latestOnPopoutRef = useRef(onPopoutTab);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const [activeDragKey, setActiveDragKey] = useState<string | null>(null);
  const [, setDragOverKey] = useState<string | null>(null);
  // 右键菜单状态
  const [contextMenu, setContextMenu] = useState<{
    tab: NoteTab;
    x: number;
    y: number;
  } | null>(null);

  useLayoutEffect(() => {
    const menu = contextMenuRef.current;
    if (!menu || !contextMenu) return;
    const rect = menu.getBoundingClientRect();
    menu.style.left = `${Math.max(4, Math.min(contextMenu.x, window.innerWidth - rect.width - 4))}px`;
    menu.style.top = `${Math.max(4, Math.min(contextMenu.y, window.innerHeight - rect.height - 4))}px`;
  }, [contextMenu]);

  const pinnedTabs = tabs.filter((t) => t.pinned);
  const regularTabs = tabs.filter((t) => !t.pinned);
  const pinnedTabKeys = pinnedTabs.map((t) => `${tabKey(t.zone, t.name)}:${t.title}`).join("\n");
  const visiblePinnedTabs = pinnedTabs.filter((_, index) => visiblePinnedIndices.includes(index));
  const hiddenPinnedTabs = pinnedTabs.filter((_, index) => !visiblePinnedIndices.includes(index));

  useLayoutEffect(() => {
    const track = pinnedTrackRef.current;
    const measure = pinnedMeasureRef.current;
    if (!track || !measure) return;
    const update = () => {
      const widths = Array.from(measure.children, (child) => child.getBoundingClientRect().width);
      const activeIndex = pinnedTabs.findIndex((tab) => tabsEqual(tab, activeZone, activeNote));
      const next = fitPinnedTabs(widths, track.clientWidth, activeIndex);
      setVisiblePinnedIndices((previous) => previous.join(",") === next.join(",") ? previous : next);
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(track);
    observer.observe(measure);
    return () => observer.disconnect();
  }, [pinnedDockTarget, pinnedTabKeys, activeZone, activeNote]);

  useEffect(() => {
    if (!pinnedMenuOpen) return;
    const closeOutside = (event: MouseEvent) => {
      if (!pinnedMoreRef.current?.contains(event.target as Node)) setPinnedMenuOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setPinnedMenuOpen(false);
        pinnedMoreRef.current?.querySelector<HTMLButtonElement>("button")?.focus();
      }
    };
    document.addEventListener("mousedown", closeOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [pinnedMenuOpen]);
  const regularTabKeys = regularTabs
    .map((t) => `${tabKey(t.zone, t.name)}:${t.title}`)
    .join("\n");

  useEffect(() => {
    latestTabsRef.current = tabs;
    latestOnReorderRef.current = onReorderTabs;
    latestOnPopoutRef.current = onPopoutTab;
  }, [onPopoutTab, onReorderTabs, tabs]);

  const updateScrollAffordance = useCallback(() => {
    const el = scrollRef.current;
    if (!el) {
      setCanScrollLeft((prev) => (prev ? false : prev));
      setCanScrollRight((prev) => (prev ? false : prev));
      return;
    }
    const max = el.scrollWidth - el.clientWidth;
    const nextLeft = el.scrollLeft > 1;
    const nextRight = max > 1 && el.scrollLeft < max - 1;
    setCanScrollLeft((prev) => (prev === nextLeft ? prev : nextLeft));
    setCanScrollRight((prev) => (prev === nextRight ? prev : nextRight));
  }, []);

  const scrollTabsBy = useCallback((direction: -1 | 1) => {
    const el = scrollRef.current;
    if (!el) return;
    const distance = Math.max(140, Math.round(el.clientWidth * 0.72));
    el.scrollBy({ left: direction * distance, behavior: "smooth" });
    window.setTimeout(updateScrollAffordance, 180);
  }, [updateScrollAffordance]);

  useEffect(() => {
    const scrollEl = scrollRef.current;
    if (!scrollEl) return;

    const ro = new ResizeObserver(() => {
      updateScrollAffordance();
    });
    ro.observe(scrollEl);
    return () => ro.disconnect();
  }, [regularTabKeys, updateScrollAffordance]);

  useEffect(() => {
    updateScrollAffordance();
  }, [tabs.length, activeZone, activeNote]);

  const visibleRegularTabKeys = regularTabs
    .map((t) => tabKey(t.zone, t.name))
    .join("\n");

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const activeTab = tabs.find((t) => tabsEqual(t, activeZone, activeNote));
    if (activeTab?.pinned) {
      updateScrollAffordance();
      return;
    }
    const active = el.querySelector<HTMLElement>(".note-tab.active");
    active?.scrollIntoView({ block: "nearest", inline: "nearest" });
    updateScrollAffordance();
  }, [activeZone, activeNote, visibleRegularTabKeys, updateScrollAffordance, tabs]);

  useEffect(() => {
    if (!closePinnedPrompt) return;
    let disposed = false;
    let listener: ((e: MouseEvent) => void) | null = null;
    const timer = window.setTimeout(() => {
      if (disposed) return;
      listener = (e: MouseEvent) => {
        if (e.button === 1) return;
        const target = e.target as Node | null;
        if (closePinnedPopoverRef.current?.contains(target)) return;
        onDismissClosePinned?.();
      };
      document.addEventListener("mousedown", listener);
    }, 0);
    return () => {
      disposed = true;
      window.clearTimeout(timer);
      if (listener) document.removeEventListener("mousedown", listener);
    };
  }, [closePinnedPrompt, onDismissClosePinned]);

  // 关闭右键菜单
  useEffect(() => {
    if (!contextMenu) return;
    const close = () => setContextMenu(null);
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    document.addEventListener("mousedown", close);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", close);
      window.removeEventListener("keydown", onKey);
    };
  }, [contextMenu]);

  const handleWheel = (e: React.WheelEvent) => {
    if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
    const el = scrollRef.current;
    if (!el || el.scrollWidth <= el.clientWidth) return;
    e.preventDefault();
    el.scrollLeft += e.deltaY;
    updateScrollAffordance();
  };

  const resetDragState = useCallback(() => {
    const elements = [...dragElementsRef.current];
    clearTabDisplacementWithoutAnimation(
      elements,
      (element, value) => { element.style.transition = value; },
      (element, value) => { element.style.transform = value; },
    );
    elements.forEach((element) => element.classList.remove("dragging", "drag-outside"));
    window.requestAnimationFrame(() => window.requestAnimationFrame(() => {
      elements.forEach((element) => { element.style.transition = ""; });
    }));
    dragOverKeyRef.current = null;
    dragActiveKeyRef.current = null;
    dragPointerRef.current = null;
    dragDeltaXRef.current = 0;
    dragElementsRef.current = [];
    dragRectsRef.current = [];
    dragActiveWidthRef.current = 0;
    dragSlotWidthRef.current = 0;
    setActiveDragKey(null);
    setDragOverKey(null);
    if (dragOutPreviewVisibleRef.current) {
      dragOutPreviewVisibleRef.current = false;
      void windowService.hideTabDragPreview().catch(() => undefined);
    }
  }, []);

  useEffect(() => () => {
    if (dragOutPreviewVisibleRef.current) {
      void windowService.hideTabDragPreview().catch(() => undefined);
    }
  }, []);

  const prepareDragGeometry = useCallback((
    tab: NoteTab,
    element: HTMLElement,
    input: { clientX: number; clientY: number },
  ) => {
    const rect = element.getBoundingClientRect();
    const group = tab.pinned ? "pinned" : "regular";
    const elements = Array.from(
      document.querySelectorAll<HTMLElement>(`.note-tab[data-tab-group="${group}"]`),
    );
    dragElementsRef.current = elements;
    dragRectsRef.current = elements.map((candidate) => {
      const candidateRect = candidate.getBoundingClientRect();
      return {
        key: candidate.dataset.tabKey ?? "",
        left: candidateRect.left,
        right: candidateRect.right,
      };
    }).filter((candidate) => candidate.key);
    dragActiveWidthRef.current = rect.width;
    const parentGap = Number.parseFloat(getComputedStyle(element.parentElement ?? element).columnGap) || 0;
    dragSlotWidthRef.current = rect.width + parentGap;
    dragGrabOffsetRef.current = nativePreviewOffset(rect, input);
    dragOverKeyRef.current = tabKey(tab.zone, tab.name);
    dragCanceledRef.current = false;
  }, []);

  const activatePointerDrag = useCallback((tab: NoteTab) => {
    const key = tabKey(tab.zone, tab.name);
    didDragRef.current = true;
    dragActiveKeyRef.current = key;
    dragOverKeyRef.current = key;
    dragElementsRef.current
      .find((element) => element.dataset.tabKey === key)
      ?.classList.add("dragging");
    setActiveDragKey(key);
    setDragOverKey(key);
  }, []);

  const updateHorizontalDragPosition = useCallback((clientX: number) => {
    const activeKey = dragActiveKeyRef.current;
    if (!activeKey) return;
    const nextOverKey = findTabIntrusionTarget(
      dragRectsRef.current,
      activeKey,
      clientX,
      dragGrabOffsetRef.current.x,
      dragActiveWidthRef.current,
    );
    const displacement = getTabDisplacement(
      dragRectsRef.current.map((rect) => rect.key),
      activeKey,
      nextOverKey,
      dragSlotWidthRef.current,
    );
    applyTabDisplacement(
      dragElementsRef.current,
      displacement,
      (element) => element.dataset.tabKey ?? "",
      (element, x) => {
        const key = element.dataset.tabKey ?? "";
        const nextX = key === activeKey ? dragDeltaXRef.current : x;
        element.style.transform = nextX ? `translateX(${nextX}px)` : "";
      },
    );
    if (nextOverKey === dragOverKeyRef.current) return;
    dragOverKeyRef.current = nextOverKey;
    setDragOverKey(nextOverKey);
  }, []);

  useEffect(() => {
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && activeDragKey) dragCanceledRef.current = true;
    };
    window.addEventListener("keydown", onEscape, true);
    return () => window.removeEventListener("keydown", onEscape, true);
  }, [activeDragKey]);

  const finishPointerDrag = useCallback((event: React.PointerEvent<HTMLButtonElement>) => {
      const activeKey = dragActiveKeyRef.current;
      const pointer = dragPointerRef.current;
      if (!pointer) return;
      const overKey = dragOverKeyRef.current;
      const outside =
        event.clientX < 0 || event.clientY < 0 ||
        event.clientX > window.innerWidth || event.clientY > window.innerHeight;
      const currentTabs = latestTabsRef.current;
      const tab = activeKey
        ? currentTabs.find((candidate) => tabKey(candidate.zone, candidate.name) === activeKey)
        : null;
      const overTab = overKey
        ? currentTabs.find((candidate) => tabKey(candidate.zone, candidate.name) === overKey)
        : null;
      const canceled = dragCanceledRef.current;
      if (event.currentTarget.hasPointerCapture(pointer.pointerId)) {
        event.currentTarget.releasePointerCapture(pointer.pointerId);
      }
      resetDragState();

      if (!activeKey || canceled || !tab) return;
      if (outside && latestOnPopoutRef.current) {
        latestOnPopoutRef.current(tab.zone, tab.name, event.screenX, event.screenY);
        return;
      }
      if (
        !latestOnReorderRef.current ||
        !overKey ||
        !overTab ||
        activeKey === overKey ||
        !canReorderTabGroups(Boolean(tab.pinned), Boolean(overTab.pinned))
      ) return;

      const nextTabs = reorderTabsByKey(
        currentTabs,
        activeKey,
        overKey,
        (candidate) => tabKey(candidate.zone, candidate.name),
      );
      const fromIndex = currentTabs.findIndex((candidate) => tabKey(candidate.zone, candidate.name) === activeKey);
      const toIndex = nextTabs.findIndex((candidate) => tabKey(candidate.zone, candidate.name) === activeKey);
      if (fromIndex >= 0 && toIndex >= 0 && fromIndex !== toIndex) {
        latestOnReorderRef.current(fromIndex, toIndex);
      }
  }, [resetDragState]);

  const handlePointerDown = useCallback((tab: NoteTab, event: React.PointerEvent<HTMLButtonElement>) => {
    if (event.button === 1) {
      event.preventDefault();
      event.stopPropagation();
      onMiddleClickClose(tab.zone, tab.name);
      return;
    }
    if (event.button !== 0 || (!latestOnReorderRef.current && !latestOnPopoutRef.current)) return;
    const key = tabKey(tab.zone, tab.name);
    dragPointerRef.current = {
      pointerId: event.pointerId,
      key,
      startClientX: event.clientX,
      startClientY: event.clientY,
    };
    prepareDragGeometry(tab, event.currentTarget, event);
    event.currentTarget.setPointerCapture(event.pointerId);
  }, [prepareDragGeometry]);

  const handlePointerMove = useCallback((tab: NoteTab, event: React.PointerEvent<HTMLButtonElement>) => {
    const pointer = dragPointerRef.current;
    if (!pointer || pointer.pointerId !== event.pointerId || pointer.key !== tabKey(tab.zone, tab.name)) return;
    const deltaX = event.clientX - pointer.startClientX;
    const deltaY = event.clientY - pointer.startClientY;
    if (!dragActiveKeyRef.current) {
      if (Math.hypot(deltaX, deltaY) <= 4) return;
      didDragRef.current = true;
      activatePointerDrag(tab);
    }
    dragDeltaXRef.current = deltaX;
    updateHorizontalDragPosition(event.clientX);
    const outside =
      event.clientX < 0 || event.clientY < 0 ||
      event.clientX > window.innerWidth || event.clientY > window.innerHeight;
    if (outside && !dragOutPreviewVisibleRef.current) {
      const rect = event.currentTarget.getBoundingClientRect();
      event.currentTarget.classList.add("drag-outside");
      dragOutPreviewVisibleRef.current = true;
      void windowService.showTabDragPreview({
        title: tab.title,
        pinned: Boolean(tab.pinned),
        active: tabsEqual(tab, activeZone, activeNote),
        accentHex: noteColorHex(tab.color ?? null),
        width: rect.width,
        height: rect.height,
        grabOffsetX: dragGrabOffsetRef.current.x,
        grabOffsetY: dragGrabOffsetRef.current.y,
      }).catch(() => {
        dragOutPreviewVisibleRef.current = false;
        event.currentTarget.classList.remove("drag-outside");
      });
    } else if (!outside && dragOutPreviewVisibleRef.current) {
      event.currentTarget.classList.remove("drag-outside");
      dragOutPreviewVisibleRef.current = false;
      void windowService.hideTabDragPreview().catch(() => undefined);
    }
  }, [activatePointerDrag, activeNote, activeZone, updateHorizontalDragPosition]);

  const handleTabAuxClick = (e: React.MouseEvent) => {
    if (e.button !== 1) return;
    e.preventDefault();
    e.stopPropagation();
    // Middle-button closing already runs on pointerdown; auxclick only suppresses browser behavior.
  };

  const canCloseOthers = tabs.length > 1;
  const copyNotePath = async (tab: NoteTab) => {
    setContextMenu(null);
    try {
      const directory = await notesService.getDir(tab.zone);
      const path = await join(directory, tab.name);
      await navigator.clipboard.writeText(path);
    } catch (error) {
      window.alert(`复制笔记路径失败：${String(error)}`);
    }
  };

  const renderTab = (tab: NoteTab) => {
    const active = tabsEqual(tab, activeZone, activeNote);
    const accentHex = noteColorHex(tab.color ?? null);
    return (
      <DraggableNoteTab
        key={tabKey(tab.zone, tab.name)}
        tab={tab}
        active={active}
        accentHex={accentHex}
        isDragging={activeDragKey === tabKey(tab.zone, tab.name)}
        onPointerDown={(event) => handlePointerDown(tab, event)}
        onPointerMove={(event) => handlePointerMove(tab, event)}
        onPointerUp={finishPointerDrag}
        onPointerCancel={(event) => {
          dragCanceledRef.current = true;
          finishPointerDrag(event);
        }}
        onSelect={() => {
          if (didDragRef.current) {
            didDragRef.current = false;
            return;
          }
          onSelectTab(tab.zone, tab.name);
        }}
        onAuxClick={(e) => handleTabAuxClick(e)}
        onContextMenu={(e) => {
          e.preventDefault();
          setContextMenu({ tab, x: e.clientX, y: e.clientY });
        }}
      />
    );
  };

  return (
    <div
      className="note-tabs-bar"
      data-testid={dataTestId}
      data-no-drag
    >
      <button
        type="button"
        className="plusButton note-tabs-new-lead"
        title="新建笔记"
        aria-label="新建笔记"
        onClick={onNewTab}
      >
        <svg className="plusIcon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 30 30" aria-hidden="true">
          <path d="M13.75 23.75V16.25H6.25V13.75H13.75V6.25H16.25V13.75H23.75V16.25H16.25V23.75H13.75Z" />
        </svg>
      </button>

      <div
        className="note-tabs-scroll-outer"
        data-fade-left={canScrollLeft ? "true" : undefined}
        data-fade-right={canScrollRight ? "true" : undefined}
      >
        <button
          type="button"
          className="note-tabs-scroll-btn note-tabs-scroll-btn-left"
          title="向左滚动标签"
          aria-label="向左滚动标签"
          disabled={!canScrollLeft}
          onClick={() => scrollTabsBy(-1)}
        >
          <Icon name="tab_chevron_left" size={12} />
        </button>
        <div
          ref={scrollRef}
          className="note-tabs-scroll"
          onScroll={updateScrollAffordance}
          onWheel={handleWheel}
        >
          {regularTabs.map((tab) => renderTab(tab))}
        </div>
        <button
          type="button"
          className="note-tabs-scroll-btn note-tabs-scroll-btn-right"
          title="向右滚动标签"
          aria-label="向右滚动标签"
          disabled={!canScrollRight}
          onClick={() => scrollTabsBy(1)}
        >
          <Icon name="tab_chevron_right" size={12} />
        </button>
      </div>

      <div className="note-tabs-actions">
        {onNewCapsuleTodo && (
          <button
            type="button"
            className="note-tabs-action-btn note-tabs-capsule-todo-btn"
            title="新建胶囊待办"
            aria-label="新建胶囊待办"
            onClick={onNewCapsuleTodo}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="50"
              height="50"
              viewBox="0 0 24 24"
              className="note-tabs-capsule-todo-icon"
              aria-hidden="true"
            >
              <path d="M12 22C17.5 22 22 17.5 22 12C22 6.5 17.5 2 12 2C6.5 2 2 6.5 2 12C2 17.5 6.5 22 12 22Z" strokeWidth="1.5" />
              <path d="M8 12H16" strokeWidth="1.5" />
              <path d="M12 16V8" strokeWidth="1.5" />
            </svg>
          </button>
        )}
        <button
          type="button"
          className="note-tabs-action-btn note-tabs-close-others-btn"
          title="关闭其他标签"
          aria-label="关闭其他标签"
          disabled={!canCloseOthers}
          onClick={onCloseOthers}
        >
          <Icon name="close_other_tabs" size={16} />
        </button>
      </div>

      {pinnedDockTarget && pinnedTabs.length > 0 && createPortal(
        <nav className="note-tabs-pinned-dock" ref={closePinnedWrapRef} aria-label="置顶笔记" data-testid="mknote-pinned-tabs"
          data-pinned-active={pinnedTabs.some((tab) => tabsEqual(tab, activeZone, activeNote)) ? "true" : undefined}>
          <div className="note-tabs-pinned-track" ref={pinnedTrackRef}>
            {visiblePinnedTabs.map((tab) => renderTab(tab))}
            {hiddenPinnedTabs.length > 0 && (
              <div className="note-tabs-pinned-more" ref={pinnedMoreRef}>
                <button type="button" className="note-tabs-pinned-more-btn" aria-expanded={pinnedMenuOpen}
                  aria-label={`更多 ${hiddenPinnedTabs.length} 个置顶笔记`} onClick={() => setPinnedMenuOpen((open) => !open)}>
                  更多 {hiddenPinnedTabs.length}<Icon name="tab_chevron_right" size={12} />
                </button>
                {pinnedMenuOpen && (
                  <div className="note-tabs-overflow-menu note-tabs-pinned-menu" aria-label="更多置顶笔记">
                    {hiddenPinnedTabs.map((tab) => (
                      <button type="button" className="note-tabs-overflow-item" key={tabKey(tab.zone, tab.name)} title={tab.title}
                        onContextMenu={(event) => {
                          event.preventDefault();
                          setPinnedMenuOpen(false);
                          setContextMenu({ tab, x: event.clientX, y: event.clientY });
                        }}
                        onClick={() => { setPinnedMenuOpen(false); onSelectTab(tab.zone, tab.name); }}>
                        {tab.title}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
          <div className="note-tabs-pinned-measure" ref={pinnedMeasureRef} aria-hidden="true">
            {pinnedTabs.map((tab) => (
              <span className="note-tab pinned" key={tabKey(tab.zone, tab.name)}><span className="note-tab-label">{tab.title}</span></span>
            ))}
          </div>
          {closePinnedPrompt && (
            <div
              ref={closePinnedPopoverRef}
              className="mk-floating-popover tab-close-pinned-popover"
              role="dialog"
              aria-label="确认关闭置顶标签"
              onMouseDown={(e) => e.stopPropagation()}
            >
              <div className="mk-floating-popover-head">
                <strong>关闭置顶标签？</strong>
                <span>
                  「{closePinnedPromptTitle ?? closePinnedPrompt.name}」已置顶，确认后才会关闭。
                </span>
              </div>
              <div className="tab-close-pinned-actions">
                <button
                  type="button"
                  className="tab-close-pinned-confirm"
                  onClick={() => onConfirmClosePinned?.()}
                >
                  确认关闭
                </button>
              </div>
            </div>
          )}
        </nav>, pinnedDockTarget,
      )}

      {!pinnedTabs.length && closePinnedPrompt && (
        <div className="note-tabs-popover-anchor" ref={closePinnedWrapRef}>
          <div
            ref={closePinnedPopoverRef}
            className="mk-floating-popover tab-close-pinned-popover"
            role="dialog"
            aria-label="确认关闭置顶标签"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="mk-floating-popover-head">
              <strong>关闭置顶标签？</strong>
              <span>
                「{closePinnedPromptTitle ?? closePinnedPrompt.name}」已置顶，确认后才会关闭。
              </span>
            </div>
            <div className="tab-close-pinned-actions">
              <button
                type="button"
                className="tab-close-pinned-confirm"
                onClick={() => onConfirmClosePinned?.()}
              >
                确认关闭
              </button>
            </div>
          </div>
        </div>
      )}

      {contextMenu && (
        <div
          ref={contextMenuRef}
          className="note-tab-context-menu"
          role="menu"
          style={{ position: "fixed", left: contextMenu.x, top: contextMenu.y }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            role="menuitem"
            className="note-tab-context-item"
            onClick={() => void copyNotePath(contextMenu.tab)}
          >
            复制笔记路径
          </button>
          {onPopoutTab && (
            <button
              type="button"
              role="menuitem"
              className="note-tab-context-item"
              onClick={() => {
                setContextMenu(null);
                onPopoutTab(contextMenu.tab.zone, contextMenu.tab.name);
              }}
            >
              在新窗口中打开
            </button>
          )}
          <button
            type="button"
            role="menuitem"
            className="note-tab-context-item"
            onClick={() => {
              setContextMenu(null);
              onMiddleClickClose(contextMenu.tab.zone, contextMenu.tab.name);
            }}
          >
            关闭标签
          </button>
          <button
            type="button"
            role="menuitem"
            className="note-tab-context-item"
            disabled={tabs.length <= 1}
            onClick={() => {
              setContextMenu(null);
              if (tabs.length > 1) onCloseOthers();
            }}
          >
            关闭其他标签
          </button>
        </div>
      )}
    </div>
  );
}

export const NoteTabsBar = memo(NoteTabsBarComponent);
