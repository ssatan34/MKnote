import { Fragment, forwardRef, useEffect, useImperativeHandle, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { Icon } from "./Icon";
import { TitleInput } from "./TitleInput";
import { AnimatedCheckbox } from "./AnimatedCheckbox";
import { DeleteButton } from "./DeleteButton";
import { CloseButton } from "./CloseButton";
import { filterQuickTodoItems, pendingCount, searchQuickTodoNoteTargets, isAllnoteWorkTodo, type QuickTodoItem, type QuickTodoLink, type QuickTodoNoteTarget, type QuickTodoTag } from "../utils/quickTodoModel";
import { QuickTodoWorkGroups } from "./QuickTodoWorkGroups";
import { beginQuickTodoDrag, cancelQuickTodoDrag, finishQuickTodoDrag, flattenQuickTodoItems, getQuickTodoInsertionMarkerForTarget, getQuickTodoSiblingItems, handleQuickTodoKey, isQuickTodoInteractionLocked, mergeQuickTodoParentOrder, moveQuickTodoDrag, submitQuickTodoDraft, submitQuickTodoEdit, type QuickTodoDragState, type QuickTodoViewMode } from "../utils/quickTodoPanelModel";
import { QuickTodoTagPicker } from "./QuickTodoTagPicker";
import { QuickTodoAddTagButton } from "./QuickTodoAddTagButton";
import { QUICK_TODO_TAGS, quickTodoTagControlLabel } from "../utils/quickTodoTags";
import { formatQuickTodoCountdown } from "../utils/quickTodoReminder";
import "./QuickTodoPanel.css";

export interface QuickTodoPanelHandle {
  flushEditing(): Promise<void>;
}

export interface QuickTodoPanelProps {
  todoName?: string;
  todoId?: string;
  items: QuickTodoItem[];
  loading: boolean;
  error: string | null;
  onAdd(text: string, tag: QuickTodoTag | null, parentId?: string | null): Promise<void>;
  onEdit(id: string, text: string): Promise<void>;
  onSetTag(id: string, tag: QuickTodoTag | null): Promise<void>;
  onOpenReminder(id: string): void;
  noteTargets: QuickTodoNoteTarget[];
  noteTargetsLoading: boolean;
  onRefreshNoteTargets(): Promise<void>;
  onSetLink(id: string, link: QuickTodoLink | null): Promise<void>;
  onOpenLinkedNote(link: QuickTodoLink): Promise<void>;
  onToggle(id: string): Promise<void>;
  onDelete(id: string): Promise<void>;
  onReorder(ids: string[]): Promise<QuickTodoItem[] | void>;
  onClose(): void;
  onWindowDragStart?(): void;
  headerActions?: ReactNode;
  footerActions?: ReactNode;
  onPickerOpenChange?(open: boolean, closePicker: () => void): void;
  windowDragRegion?: boolean;
  viewMode?: QuickTodoViewMode;
}

export const QuickTodoPanel = forwardRef<QuickTodoPanelHandle, QuickTodoPanelProps>(function QuickTodoPanel({ todoName = "Quick Todo", todoId = "default", items, loading, error, onAdd, onEdit, onSetTag, onOpenReminder, noteTargets, noteTargetsLoading, onRefreshNoteTargets, onSetLink, onOpenLinkedNote, onToggle, onDelete, onReorder, onClose, onWindowDragStart, headerActions, footerActions, onPickerOpenChange, windowDragRegion = false, viewMode = "active" }, ref) {
  const manualItems = items.filter(item => !isAllnoteWorkTodo(item));
  const workMode = todoName === "Work" || manualItems.length !== items.length;
  const [draft, setDraft] = useState("");
  const [draftTag, setDraftTag] = useState<QuickTodoTag | null>(null);
  const [activePicker, setActivePickerState] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [selectedTag, setSelectedTag] = useState<QuickTodoTag | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [returningDeleteId, setReturningDeleteId] = useState<string | null>(null);
  const [previewItems, setPreviewItems] = useState(items);
  const [dragSession, setDragSession] = useState<QuickTodoDragState | null>(null);
  const [dragTargetIndex, setDragTargetIndex] = useState<number | null>(null);
  const [reorderPending, setReorderPending] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState("");
  const [childParentId, setChildParentId] = useState<string | null>(null);
  const [childDraft, setChildDraft] = useState("");
  const [childTag, setChildTag] = useState<QuickTodoTag | null>(null);
  const [linkId, setLinkId] = useState<string | null>(null);
  const [linkMode, setLinkMode] = useState<"select" | "manage">("select");
  const [linkQuery, setLinkQuery] = useState("");
  const [now, setNow] = useState(() => new Date());
  const inputRef = useRef<HTMLInputElement>(null);
  const editInputRef = useRef<HTMLInputElement>(null);
  const childInputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const latestItemsRef = useRef(items);
  const dragRef = useRef<(QuickTodoDragState & { pointerId: number; captureTarget: HTMLDivElement }) | null>(null);
  latestItemsRef.current = manualItems;
  useEffect(() => {
    const drag = dragRef.current;
    if (drag) {
      dragRef.current = null;
      setDragSession(null);
      setDragTargetIndex(null);
      if (drag.captureTarget.hasPointerCapture(drag.pointerId)) drag.captureTarget.releasePointerCapture(drag.pointerId);
      setPreviewItems(cancelQuickTodoDrag(drag, manualItems));
      return;
    }
    setPreviewItems(manualItems);
  }, [items]);
  const setActivePicker = (value: string | null) => {
    setActivePickerState(value);
    onPickerOpenChange?.(value !== null, () => setActivePickerState(null));
  };
  const draftTagLabel = quickTodoTagControlLabel(draftTag);
  const completedView = viewMode === "completed";
  const interactionLocked = isQuickTodoInteractionLocked(dragSession, reorderPending);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    if (!deleteId) return;
    const timer = window.setTimeout(() => {
      setDeleteId(null);
      setReturningDeleteId(deleteId);
      window.setTimeout(() => setReturningDeleteId((current) => current === deleteId ? null : current), 320);
    }, 2000);
    return () => window.clearTimeout(timer);
  }, [deleteId]);
  const currentViewItems = latestItemsRef.current.filter((item) => item.completed === completedView);
  const dragItems = dragSession ? getQuickTodoSiblingItems(latestItemsRef.current, dragSession.draggedId, completedView) : currentViewItems;
  const insertionMarker = dragSession && dragTargetIndex !== null
    ? getQuickTodoInsertionMarkerForTarget(dragItems, dragSession.draggedId, dragTargetIndex)
    : null;
  const displayItems = (dragSession ? manualItems : previewItems).filter(item => !isAllnoteWorkTodo(item));
  const visibleItems = filterQuickTodoItems(flattenQuickTodoItems(displayItems), selectedTag).filter((item) => item.completed === completedView);
  const linkResults = searchQuickTodoNoteTargets(noteTargets, linkQuery).slice(0, 8);

  const handleDragStart = (event: ReactPointerEvent<HTMLButtonElement>, draggedId: string) => {
    if (completedView || event.button !== 0 || interactionLocked) return;
    const siblings = getQuickTodoSiblingItems(latestItemsRef.current, draggedId, completedView);
    const session = beginQuickTodoDrag(siblings, draggedId);
    const captureTarget = listRef.current;
    if (!session || !captureTarget) return;
    event.preventDefault();
    captureTarget.setPointerCapture(event.pointerId);
    dragRef.current = { ...session, pointerId: event.pointerId, captureTarget };
    setDragSession(session);
    const remaining = siblings.filter((item) => item.id !== draggedId);
    setDragTargetIndex(Math.min(siblings.findIndex((item) => item.id === draggedId), remaining.length));
    setPreviewItems(session.previewItems);
  };

  const handleDragMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (completedView) return;
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const rows = Array.from(listRef.current?.querySelectorAll<HTMLElement>(".quick-todo-row") ?? [])
      .filter((row) => row.dataset.todoId !== drag.draggedId && row.dataset.parentId === (drag.parentId ?? ""));
    const targetIndex = rows.findIndex((row) => event.clientY < row.getBoundingClientRect().top + row.getBoundingClientRect().height / 2);
    const moved = moveQuickTodoDrag(drag, targetIndex < 0 ? rows.length : targetIndex);
    dragRef.current = { ...drag, ...moved };
    setDragSession(moved);
    setDragTargetIndex(targetIndex < 0 ? rows.length : targetIndex);
    setPreviewItems(moved.previewItems);
  };

  const finishDrag = async (event: ReactPointerEvent<HTMLDivElement>, cancelled: boolean) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    dragRef.current = null;
    setDragSession(null);
    setDragTargetIndex(null);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    if (cancelled) {
      setPreviewItems(cancelQuickTodoDrag(drag, latestItemsRef.current));
      return;
    }
    setReorderPending(true);
    const result = await finishQuickTodoDrag(drag, () => latestItemsRef.current, async (visibleIds) => {
      return onReorder(mergeQuickTodoParentOrder(latestItemsRef.current, viewMode, drag.parentId, visibleIds));
    });
    setPreviewItems(result.items);
    setReorderPending(false);
  };

  const handleLostPointerCapture = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    dragRef.current = null;
    setDragSession(null);
    setDragTargetIndex(null);
    setPreviewItems(cancelQuickTodoDrag(drag, latestItemsRef.current));
  };

  const submit = async () => {
    if (!draft.trim() || submitting) return;
    setSubmitting(true);
    try {
      const result = await submitQuickTodoDraft(draft, draftTag, onAdd);
      setDraft(result.draft);
      setDraftTag(result.tag);
      inputRef.current?.focus();
    } catch {
      inputRef.current?.focus();
    } finally {
      setSubmitting(false);
    }
  };
  const beginEditing = (item: QuickTodoItem) => {
    if (interactionLocked) return;
    setEditingId(item.id);
    setEditingText(item.text);
    requestAnimationFrame(() => {
      editInputRef.current?.focus();
      editInputRef.current?.select();
    });
  };
  const cancelEditing = () => {
    setEditingId(null);
    setEditingText("");
  };
  const submitEditing = async () => {
    if (editingId === null) return;
    try {
      const result = await submitQuickTodoEdit(editingText, (text) => onEdit(editingId, text));
      if (result.submitted) cancelEditing();
    } catch {
      editInputRef.current?.focus();
    }
  };
  const beginChildInput = (parentId: string) => {
    setChildParentId(parentId);
    setChildDraft("");
    setChildTag(null);
    requestAnimationFrame(() => childInputRef.current?.focus());
  };
  const closeChildInput = () => {
    if (childParentId !== null && activePicker === `child:${childParentId}`) setActivePicker(null);
    setChildParentId(null);
    setChildDraft("");
    setChildTag(null);
  };
  const submitChild = async (discardEmpty = false) => {
    if (childParentId === null) return;
    if (!childDraft.trim()) {
      if (discardEmpty) closeChildInput();
      return;
    }
    try {
      await submitQuickTodoDraft(childDraft, childTag, (text, tag) => onAdd(text, tag, childParentId));
      closeChildInput();
    } catch {
      childInputRef.current?.focus();
    }
  };
  const openLinkPicker = (item: QuickTodoItem) => {
    if (interactionLocked) return;
    setLinkId(item.id);
    setLinkMode("select");
    setLinkQuery("");
    void onRefreshNoteTargets();
  };
  const openLinkManager = (item: QuickTodoItem) => {
    if (interactionLocked) return;
    setLinkId(item.id);
    setLinkMode("manage");
    setLinkQuery("");
    void onRefreshNoteTargets();
  };
  const closeLinkPopover = () => {
    setLinkId(null);
    setLinkQuery("");
  };
  const saveLink = async (itemId: string, link: QuickTodoLink | null) => {
    await onSetLink(itemId, link);
    closeLinkPopover();
  };
  useImperativeHandle(ref, () => ({ flushEditing: async () => { await submit(); await submitChild(true); } }), [draft, draftTag, submitting, childDraft, childTag, childParentId]);

  return <section className="quick-todo-panel" aria-label={todoName} onKeyDown={(event) => {
    const action = handleQuickTodoKey(event.key);
    if (action === "close") {
      event.preventDefault(); event.stopPropagation();
      if (activePicker !== null) setActivePicker(null); else if (linkId !== null) closeLinkPopover(); else onClose();
    }
  }}>
    <header className="quick-todo-panel-header" onMouseDown={(event) => { if (windowDragRegion && event.button === 0 && !(event.target as HTMLElement).closest("[data-no-drag]")) onWindowDragStart?.(); }}>
      <span className="quick-todo-panel-title"><Icon name="task" size={16} />{todoName}</span>
      <span className="quick-todo-panel-actions">{headerActions}<CloseButton aria-label="关闭 Quick Todo" title="关闭 Quick Todo" onClick={onClose} /></span>
    </header>
    {!completedView && <div className="quick-todo-input-row"><div className="quick-todo-input-focus-scope" onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) void submit(); }}>
      <div className="compact-title-wrap">
        <TitleInput
          ref={inputRef}
          autoFocus
          value={draft}
          placeholder={workMode ? "添加手工待办…" : "添加待办…"}
          disabled={loading || interactionLocked}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") { event.preventDefault(); void submit(); }
          }}
        />
      </div>
      <span className="quick-todo-tag-control" onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setActivePicker(null); }}>
        {draftTag ? <button type="button" className={`quick-todo-tag-trigger quick-todo-tag-trigger--semantic quick-todo-tag-${draftTag}`} disabled={interactionLocked} aria-label={draftTagLabel} title={draftTagLabel} aria-expanded={activePicker === "draft"} onClick={() => setActivePicker(activePicker === "draft" ? null : "draft")}><Icon name={QUICK_TODO_TAGS.find((tag) => tag.id === draftTag)?.icon ?? "tag"} size={16} /></button> : <QuickTodoAddTagButton disabled={interactionLocked} aria-label={draftTagLabel} title={draftTagLabel} aria-expanded={activePicker === "draft"} onClick={() => setActivePicker(activePicker === "draft" ? null : "draft")} />}
        {activePicker === "draft" && <QuickTodoTagPicker value={draftTag} onChange={(value) => { setDraftTag(value); setActivePicker(null); }} />}
      </span>
      <button type="button" className="quick-todo-save" title="添加待办" aria-label="添加待办" disabled={submitting} onClick={() => void submit()}>Add</button>
    </div></div>}
    {error && <p className="quick-todo-error" role="alert">{error}</p>}
    {!collapsed && <div className="quick-todo-list" ref={listRef}
      onPointerMove={handleDragMove}
      onPointerUp={(event) => void finishDrag(event, false)}
      onPointerCancel={(event) => void finishDrag(event, true)}
      onLostPointerCapture={handleLostPointerCapture}>
      {workMode && !completedView && <QuickTodoWorkGroups items={items} todoId={todoId} />}
      {workMode && <h3 className="quick-work-manual-title">{completedView ? "手工已完成" : "手工待办"}</h3>}
      {visibleItems.map((item) => {
        const itemTagLabel = quickTodoTagControlLabel(item.tag);
        const completionLabel = item.completed ? "取消完成" : "标记完成";
        const isDragged = dragSession?.draggedId === item.id;
        const markerClass = insertionMarker?.id === item.id ? ` quick-todo-insert-${insertionMarker.edge}` : "";
        const countdown = item.remindAt ? formatQuickTodoCountdown(item.remindAt, now) : null;
        return <Fragment key={item.id}><div data-todo-id={item.id} data-parent-id={item.parentId ?? ""} className={`quick-todo-row${item.parentId ? " quick-todo-child-row" : ""}${item.completed ? " completed" : ""}${markerClass}`}>
        {!completedView && <button type="button" className="quick-todo-drag-handle" aria-label="拖动排序" title={selectedTag ? "筛选状态下不可拖动排序" : "拖动排序"}
          onPointerDown={(event) => handleDragStart(event, item.id)}
          disabled={selectedTag !== null || reorderPending || (dragSession !== null && !isDragged)}><Icon name="drag_handle" size={16} /></button>
        }
        <AnimatedCheckbox
          className="quick-todo-check"
          checked={item.completed}
          label={completionLabel}
          disabled={interactionLocked}
          onChange={() => void onToggle(item.id).catch(() => undefined)}
          size={18}
        />
        {editingId === item.id ? (
          <input
            ref={editInputRef}
            className="quick-todo-text quick-todo-text-edit"
            aria-label="编辑待办内容"
            value={editingText}
            onChange={(event) => setEditingText(event.target.value)}
            onBlur={() => void submitEditing()}
            onKeyDown={(event) => {
              if (event.key === "Enter") { event.preventDefault(); void submitEditing(); }
              if (event.key === "Escape") { event.preventDefault(); cancelEditing(); }
            }}
          />
        ) : (
          <span className="quick-todo-text" onDoubleClick={() => beginEditing(item)} title="双击编辑">{item.text}</span>
        )}
        <span className="quick-todo-row-actions">
        {!completedView && !item.parentId && <button type="button" className="quick-todo-add-child" aria-label="添加子项目" title="添加子项目" disabled={interactionLocked} onClick={() => beginChildInput(item.id)}><Icon name="add_subtask" size={15} /></button>}
        {!completedView && <span className="quick-todo-reminder-control">
          <button type="button" className={`quick-todo-reminder-trigger${countdown ? " is-set" : ""}`} disabled={interactionLocked} aria-label={item.remindAt ? "修改提醒" : "设置提醒"} title={item.remindAt ? "修改提醒" : "设置提醒"} data-no-drag onClick={() => onOpenReminder(item.id)}>
            {countdown ?? <Icon name="alarm_clock" size={16} />}
          </button>
        </span>}
        {!completedView && <span className="quick-todo-link-control" onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) closeLinkPopover();
        }}>
          <button
            type="button"
            className={`quick-todo-link-trigger${item.link ? " is-set" : ""}${item.link && !noteTargets.some((target) => target.zone === item.link?.zone && target.name === item.link?.name) ? " is-missing" : ""}`}
            aria-label={item.link ? "打开关联便签" : "关联便签"}
            title={item.link ? (noteTargets.some((target) => target.zone === item.link?.zone && target.name === item.link?.name) ? "打开关联便签" : "关联文件不存在") : "关联便签"}
            data-no-drag
            disabled={interactionLocked}
            onClick={() => {
              if (!item.link) openLinkPicker(item);
              else if (noteTargets.some((target) => target.zone === item.link?.zone && target.name === item.link?.name)) void onOpenLinkedNote(item.link).catch(() => undefined);
              else openLinkManager(item);
            }}
            onContextMenu={(event) => { if (item.link) { event.preventDefault(); openLinkManager(item); } }}
          >
            <Icon name="link" size={15} />
          </button>
          {linkId === item.id && <div className="quick-todo-link-popover" data-no-drag>
            {linkMode === "manage" && item.link ? <>
              <div className="quick-todo-link-title"><Icon name="link" size={15} />{noteTargets.find((target) => target.zone === item.link?.zone && target.name === item.link?.name)?.title ?? item.link.name}</div>
              <button type="button" className="quick-todo-link-action" onClick={() => { closeLinkPopover(); void onOpenLinkedNote(item.link!).catch(() => undefined); }}>打开便签</button>
              <button type="button" className="quick-todo-link-action" onClick={() => setLinkMode("select")}>更换链接</button>
              <button type="button" className="quick-todo-link-action danger" onClick={() => void saveLink(item.id, null)}>解除链接</button>
            </> : <>
              <div className="quick-todo-link-title">选择关联便签</div>
              <input autoFocus value={linkQuery} placeholder="输入笔记标题…" aria-label="输入关联笔记标题" onChange={(event) => setLinkQuery(event.target.value)} />
              <div className="quick-todo-link-options">
                {noteTargetsLoading && <span className="quick-todo-link-empty">正在读取文件…</span>}
                {!noteTargetsLoading && !linkQuery.trim() && <span className="quick-todo-link-empty">请输入笔记标题</span>}
                {!noteTargetsLoading && linkResults.map((target) => (
                  <button type="button" key={`${target.zone}:${target.name}`} onClick={() => void saveLink(item.id, { zone: target.zone, name: target.name })}>
                    <span>{target.title}</span><small>{target.zoneLabel}</small>
                  </button>
                ))}
                {!noteTargetsLoading && linkQuery.trim() && linkResults.length === 0 && <span className="quick-todo-link-empty">没有匹配的 Markdown 文件</span>}
              </div>
            </>}
          </div>}
        </span>}
        {deleteId === item.id ? (
          <button
            type="button"
            className="quick-todo-delete quick-todo-delete-confirm"
            aria-label="确认删除待办"
            title="确认删除"
            disabled={interactionLocked}
            onClick={() => void onDelete(item.id).then(() => setDeleteId(null)).catch(() => undefined)}
          >
            <Icon name="confirm" size={16} />
          </button>
        ) : (
          <DeleteButton
            disabled={interactionLocked}
            className={`quick-todo-delete${returningDeleteId === item.id ? " delete-button--returning" : ""}`}
            aria-label="删除待办"
            title="删除待办"
            onClick={() => setDeleteId(item.id)}
            iconSize={11}
          />
        )}
        </span>
        <span className="quick-todo-tag-control quick-todo-row-tag" onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setActivePicker(null); }}>
          {item.tag ? <button type="button" className={`quick-todo-tag-trigger quick-todo-tag-trigger--semantic quick-todo-tag-${item.tag}`} disabled={interactionLocked} aria-label={itemTagLabel} title={itemTagLabel} aria-expanded={activePicker === item.id} onClick={() => setActivePicker(activePicker === item.id ? null : item.id)}><Icon name={QUICK_TODO_TAGS.find((tag) => tag.id === item.tag)?.icon ?? "tag"} size={15} /></button> : <QuickTodoAddTagButton disabled={interactionLocked} aria-label={itemTagLabel} title={itemTagLabel} aria-expanded={activePicker === item.id} onClick={() => setActivePicker(activePicker === item.id ? null : item.id)} />}
          {activePicker === item.id && <QuickTodoTagPicker value={item.tag} onChange={(value) => { setActivePicker(null); void onSetTag(item.id, value).catch(() => undefined); }} />}
        </span>
      </div>{!completedView && !item.parentId && childParentId === item.id && <div className="quick-todo-child-input" data-parent-id={item.id} onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) void submitChild(true); }}>
        <div className="compact-title-wrap">
          <TitleInput ref={childInputRef} autoFocus value={childDraft} placeholder="添加子项目…" aria-label="添加子项目" onChange={(event) => setChildDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void submitChild(); } if (event.key === "Escape") { event.preventDefault(); closeChildInput(); } }} />
        </div>
        <span className="quick-todo-tag-control quick-todo-child-tag" onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setActivePicker(null); }}>
          {childTag ? <button type="button" className={`quick-todo-tag-trigger quick-todo-tag-trigger--semantic quick-todo-tag-${childTag}`} aria-label={quickTodoTagControlLabel(childTag)} title={quickTodoTagControlLabel(childTag)} aria-expanded={activePicker === `child:${item.id}`} onClick={() => setActivePicker(activePicker === `child:${item.id}` ? null : `child:${item.id}`)}><Icon name={QUICK_TODO_TAGS.find((tag) => tag.id === childTag)?.icon ?? "tag"} size={16} /></button> : <QuickTodoAddTagButton aria-label={quickTodoTagControlLabel(childTag)} title={quickTodoTagControlLabel(childTag)} aria-expanded={activePicker === `child:${item.id}`} onClick={() => setActivePicker(activePicker === `child:${item.id}` ? null : `child:${item.id}`)} />}
          {activePicker === `child:${item.id}` && <QuickTodoTagPicker value={childTag} onChange={(value) => { setChildTag(value); setActivePicker(null); }} />}
        </span>
      </div>}</Fragment>;
      })}
      {!loading && visibleItems.length === 0 && <p className="quick-todo-empty">{completedView ? "暂无已完成待办" : "暂无待办"}</p>}
    </div>}
    <footer><button type="button" onClick={() => setCollapsed((value) => !value)}>{selectedTag ? visibleItems.length : pendingCount(items)} 条{completedView ? "已完成" : "待处理"} · {collapsed ? "展开" : "收起"}</button><span className="quick-todo-panel-footer-right"><span className="quick-todo-filter-bar" aria-label="按标签筛选">{QUICK_TODO_TAGS.map((tag) => <button key={tag.id} type="button" className={`quick-todo-filter-button quick-todo-tag-${tag.id}${selectedTag === tag.id ? " active" : ""}`} title={`${selectedTag === tag.id ? "取消" : "筛选"}${tag.label}`} aria-label={`${selectedTag === tag.id ? "取消" : "筛选"}${tag.label}`} aria-pressed={selectedTag === tag.id} onClick={() => setSelectedTag(selectedTag === tag.id ? null : tag.id)}><Icon name={tag.icon} size={16} /></button>)}</span>{footerActions && <span className="quick-todo-panel-footer-actions">{footerActions}</span>}</span></footer>
  </section>;
});
