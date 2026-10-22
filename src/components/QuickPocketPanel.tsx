import { forwardRef, useEffect, useImperativeHandle, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { Icon, type IconId } from "./Icon";
import { CopyFeedbackIcon } from "./CopyFeedbackIcon";
import { DeleteButton } from "./DeleteButton";
import { CloseButton } from "./CloseButton";
import { QuickTodoAddTagButton } from "./QuickTodoAddTagButton";
import { QuickPocketTagPicker } from "./QuickPocketTagPicker";
import { QUICK_POCKET_TAGS, buildQuickPocketListNodes, filterQuickPocketItems, hasQuickPocketContent, maskPrivateBody, moveQuickPocketItemWithinTag, resolveQuickPocketDropPlacement, summarizeQuickPocketBody, type QuickPocketGroup, type QuickPocketItem, type QuickPocketTag } from "../utils/quickPocketModel";
import { shouldSubmitInputKey } from "../utils/quickInputModel";
import "./QuickPocketPanel.css";

export interface QuickPocketPanelProps {
  pocketName?: string;
  items: QuickPocketItem[];
  groups: QuickPocketGroup[];
  loading: boolean;
  error: string | null;
  onAdd(title: string, body: string, tag: QuickPocketTag | null, groupId: string | null): Promise<void>;
  onUpdate(id: string, title: string, body: string, tag: QuickPocketTag | null): Promise<void>;
  onDelete(id: string): Promise<void>;
  onReorder(ids: string[]): Promise<void>;
  onCreateGroup(ids: string[], name: string): Promise<void>;
  onRenameGroup(id: string, name: string): Promise<void>;
  onDissolveGroup(id: string): Promise<void>;
  onMoveItem(id: string, groupId: string | null, ids: string[]): Promise<void>;
  onClose(): void;
  onWindowDragStart?(): void;
  headerActions?: ReactNode;
  windowDragRegion?: boolean;
}

export interface QuickPocketPanelHandle { flushEditing(): Promise<void>; }
type FormState = { id: string | null; title: string; body: string; tag: QuickPocketTag | null; groupId: string | null };
const EMPTY_FORM: FormState = { id: null, title: "", body: "", tag: null, groupId: null };
const TAG_ICON: Record<QuickPocketTag, IconId> = { text: "edit2", command: "run_script2", path: "pick_folder2", private: "quick_lock_closed2" };

export const QuickPocketPanel = forwardRef<QuickPocketPanelHandle, QuickPocketPanelProps>(function QuickPocketPanel({ pocketName = "Quick Pocket", items, groups, loading, error, onAdd, onUpdate, onDelete, onReorder, onCreateGroup, onRenameGroup, onDissolveGroup, onMoveItem, onClose, onWindowDragStart, headerActions, windowDragRegion = false }, ref) {
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [inputOpen, setInputOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [returningDeleteId, setReturningDeleteId] = useState<string | null>(null);
  const [selectedTag, setSelectedTag] = useState<QuickPocketTag | null>(null);
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>(() => {
    try { return JSON.parse(localStorage.getItem("mknote.quick-pocket.collapsed-groups") ?? "{}"); } catch { return {}; }
  });
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [editingGroupName, setEditingGroupName] = useState("");
  const [dissolveGroupId, setDissolveGroupId] = useState<string | null>(null);
  const [pendingGroupIds, setPendingGroupIds] = useState<string[] | null>(null);
  const [groupNameDraft, setGroupNameDraft] = useState("");
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [draggedGroupId, setDraggedGroupId] = useState<string | null>(null);
  const [dragTargetId, setDragTargetId] = useState<string | null>(null);
  const [dragTargetIsGroupHeader, setDragTargetIsGroupHeader] = useState(false);
  const [dragPlacement, setDragPlacement] = useState<"before" | "after" | "group" | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [activeTagPickerId, setActiveTagPickerId] = useState<string | null>(null);
  const [previewItems, setPreviewItems] = useState(items);
  const listRef = useRef<HTMLDivElement>(null);
  const dragStartItemsRef = useRef(items);

  const filtered = selectedTag ? filterQuickPocketItems(previewItems, selectedTag) : null;
  const listNodes = selectedTag ? [] : buildQuickPocketListNodes(previewItems, groups);
  const visibleItems = selectedTag ? filtered ?? [] : listNodes.flatMap((node) => node.type === "item" ? [node.item] : node.items);

  useEffect(() => {
    if (form.id && !items.some((item) => item.id === form.id)) setForm(EMPTY_FORM);
    if (!draggedId && !draggedGroupId) setPreviewItems(items);
  }, [form.id, items, draggedId, draggedGroupId]);

  useEffect(() => {
    localStorage.setItem("mknote.quick-pocket.collapsed-groups", JSON.stringify(collapsedGroups));
  }, [collapsedGroups]);

  useEffect(() => {
    if (!deleteId) return;
    const timer = window.setTimeout(() => { setDeleteId(null); setReturningDeleteId(deleteId); window.setTimeout(() => setReturningDeleteId(null), 320); }, 2000);
    return () => window.clearTimeout(timer);
  }, [deleteId]);

  const openNew = (groupId: string | null = null) => { setForm({ ...EMPTY_FORM, groupId }); setInputOpen(true); };
  const openEdit = (item: QuickPocketItem) => { setForm({ id: item.id, title: item.title, body: item.body, tag: item.tag, groupId: item.groupId }); setInputOpen(true); };
  const submit = async () => {
    if (submitting) return;
    if (!hasQuickPocketContent(form.title, form.body)) { setForm(EMPTY_FORM); setInputOpen(false); return; }
    setSubmitting(true);
    try {
      if (form.id) await onUpdate(form.id, form.title, form.body, form.tag);
      else await onAdd(form.title, form.body, form.tag, form.groupId);
      setForm(EMPTY_FORM); setInputOpen(false);
    } catch {
      // 控制器负责展示持久化错误，保留表单内容以便用户重试。
    } finally { setSubmitting(false); }
  };
  useImperativeHandle(ref, () => ({ flushEditing: async () => { if (inputOpen) await submit(); } }), [inputOpen, form, submitting]);

  const beginItemDrag = (event: ReactPointerEvent<HTMLButtonElement>, id: string) => {
    if (event.button !== 0 || selectedTag && items.find((item) => item.id === id)?.groupId) return;
    if (!listRef.current) return;
    event.preventDefault(); listRef.current.setPointerCapture(event.pointerId); dragStartItemsRef.current = items; setDraggedId(id); setDragTargetId(null); setDragTargetIsGroupHeader(false); setDragPlacement(null);
  };
  const beginGroupDrag = (event: ReactPointerEvent<HTMLButtonElement>, id: string) => {
    if (event.button !== 0 || selectedTag) return;
    event.preventDefault(); listRef.current?.setPointerCapture(event.pointerId); dragStartItemsRef.current = items; setDraggedGroupId(id); setDragTargetId(null); setDragTargetIsGroupHeader(false); setDragPlacement(null);
  };
  const beginDragTarget = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!draggedId && !draggedGroupId) return;
    // 指针捕获后 event.target 固定为列表容器，必须按屏幕坐标重新命中真实条目。
    const row = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>("[data-pocket-id]");
    if (!row || row.dataset.pocketId === draggedId || (draggedGroupId && row.dataset.groupId === draggedGroupId)) return;
    const sourceItem = draggedId ? items.find((item) => item.id === draggedId) : undefined;
    const targetItem = items.find((item) => item.id === row.dataset.pocketId);
    if (!targetItem || (selectedTag && sourceItem?.groupId !== targetItem.groupId)) return;
    const targetIsGroupHeader = row.dataset.pocketGroupHeader === "true";
    const rect = row.getBoundingClientRect();
    const allowGrouping = Boolean(draggedId && !sourceItem?.groupId && !targetItem.groupId && !selectedTag);
    const placement = resolveQuickPocketDropPlacement(event.clientY, rect.top, rect.height, allowGrouping);
    setDragTargetId(row.dataset.pocketId ?? null);
    setDragTargetIsGroupHeader(targetIsGroupHeader);
    setDragPlacement(placement);
    if (draggedId && placement !== "group") {
      if (selectedTag) {
        const filteredWithoutSource = visibleItems.filter((item) => item.id !== draggedId);
        const targetIndex = filteredWithoutSource.findIndex((item) => item.id === row.dataset.pocketId);
        setPreviewItems(moveQuickPocketItemWithinTag(previewItems, draggedId, targetIndex + (placement === "after" ? 1 : 0), selectedTag));
        return;
      }
      const current = visibleItems.filter((item) => item.id !== draggedId);
      const next = { ...sourceItem!, groupId: targetIsGroupHeader ? sourceItem!.groupId : targetItem.groupId };
      const targetIndex = current.findIndex((item) => item.id === row.dataset.pocketId);
      const targetGroupLastIndex = targetIsGroupHeader && targetItem.groupId
        ? Math.max(...current.map((item, index) => item.groupId === targetItem.groupId ? index : -1))
        : targetIndex;
      const insertionIndex = Math.max(0, Math.min((placement === "after" ? targetGroupLastIndex + 1 : targetIndex), current.length));
      current.splice(Math.min(insertionIndex, current.length), 0, next);
      setPreviewItems(current);
    }
  };
  const finishDrag = async (event: ReactPointerEvent<HTMLDivElement>, cancelled = false) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    const sourceId = draggedId;
    const sourceGroupId = draggedGroupId;
    const targetId = dragTargetId;
    const targetWasGroupHeader = dragTargetIsGroupHeader;
    const placement = dragPlacement;
    const finalItems = cancelled ? dragStartItemsRef.current : previewItems;
    setDraggedId(null); setDraggedGroupId(null); setDragTargetId(null); setDragTargetIsGroupHeader(false); setDragPlacement(null); setPreviewItems(finalItems);
    if (cancelled || !targetId) return;
    const target = items.find((item) => item.id === targetId);
    if (!target) return;
    if (sourceGroupId) {
      const sourceIds = items.filter((item) => item.groupId === sourceGroupId).map((item) => item.id);
      const displayItems = buildQuickPocketListNodes(finalItems, groups).flatMap((node) => node.type === "item" ? [node.item] : node.items);
      const remaining = displayItems.filter((item) => !sourceIds.includes(item.id));
      const index = remaining.findIndex((item) => item.id === targetId);
      const targetGroupLastIndex = targetWasGroupHeader && target.groupId
        ? Math.max(...remaining.map((item, itemIndex) => item.groupId === target.groupId ? itemIndex : -1))
        : index;
      const insertAt = Math.max(0, placement === "after" ? targetGroupLastIndex + 1 : index);
      remaining.splice(insertAt, 0, ...displayItems.filter((item) => sourceIds.includes(item.id)));
      await onReorder(remaining.map((item) => item.id));
      return;
    }
    if (!sourceId) return;
    if (placement === "group") {
      if (target.groupId) await onMoveItem(sourceId, target.groupId, items.map((item) => item.id));
      else if (items.find((item) => item.id === sourceId)?.groupId) await onMoveItem(sourceId, null, items.map((item) => item.id));
      else {
        setPendingGroupIds([sourceId, targetId]);
        setGroupNameDraft("");
      }
      return;
    }
    await onMoveItem(sourceId, targetWasGroupHeader ? items.find((item) => item.id === sourceId)?.groupId ?? null : target.groupId, finalItems.map((item) => item.id));
  };

  const toggleGroup = (id: string) => setCollapsedGroups((current) => ({ ...current, [id]: !current[id] }));
  const startRenameGroup = (group: QuickPocketGroup) => { setEditingGroupId(group.id); setEditingGroupName(group.name); };
  const commitRenameGroup = async () => {
    try {
      if (editingGroupId && editingGroupName.trim()) await onRenameGroup(editingGroupId, editingGroupName.trim());
      setEditingGroupId(null);
    } catch {
      // 控制器负责展示持久化错误，保留编辑态以便用户重试。
    }
  };
  const confirmCreateGroup = async () => {
    if (!pendingGroupIds || !groupNameDraft.trim()) return;
    try {
      await onCreateGroup(pendingGroupIds, groupNameDraft.trim());
      setPendingGroupIds(null); setGroupNameDraft("");
    } catch {
      // 控制器负责展示持久化错误，保留分组表单以便用户重试。
    }
  };
  const copyBody = async (item: QuickPocketItem) => { try { await navigator.clipboard.writeText(item.body); setCopiedId(item.id); window.setTimeout(() => setCopiedId((current) => current === item.id ? null : current), 1500); } catch { setCopiedId(null); } };
  const renderItem = (item: QuickPocketItem) => {
    const summary = item.tag === "private" ? maskPrivateBody(item.body) : summarizeQuickPocketBody(item.body);
    const marker = dragTargetId === item.id ? ` quick-pocket-insert-${dragPlacement}` : "";
    return <div key={item.id} data-pocket-id={item.id} data-group-id={item.groupId ?? ""} className={`quick-pocket-row${draggedId === item.id ? " is-dragging" : ""}${marker}`} onDoubleClick={() => openEdit(item)}>
      <button type="button" className="quick-pocket-drag" title="拖动排序或分组" aria-label="拖动排序或分组" data-no-drag onPointerDown={(event) => beginItemDrag(event, item.id)}><Icon name="drag_handle" size={16} /></button>
      <span className="quick-pocket-copy" title={item.title}><strong>{item.title}</strong><span className={item.tag ? `quick-pocket-body-tag-${item.tag}` : ""}>{summary || "无内文"}</span></span>
      <button type="button" className="quick-pocket-row-action" title={copiedId === item.id ? "已复制内文" : "复制内文"} aria-label={copiedId === item.id ? "已复制内文" : "复制内文"} data-no-drag onClick={() => void copyBody(item)}><CopyFeedbackIcon copied={copiedId === item.id} size={16} /></button>
      {deleteId === item.id ? <button type="button" className="quick-pocket-row-action danger" title="确认删除" aria-label="确认删除" data-no-drag onClick={() => void onDelete(item.id).then(() => setDeleteId(null)).catch(() => undefined)}><Icon name="confirm" size={16} /></button> : <DeleteButton className={`quick-pocket-row-action${returningDeleteId === item.id ? " delete-button--returning" : ""}`} title="删除" aria-label="删除" data-no-drag onClick={() => setDeleteId(item.id)} iconSize={11} />}
      <span className="quick-pocket-tag-control" onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setActiveTagPickerId(null); }}>
        {item.tag ? <button type="button" className={`quick-pocket-tag quick-pocket-tag--set tag-${item.tag}`} title={QUICK_POCKET_TAGS.find((tag) => tag.id === item.tag)?.label} aria-label="设置标签" data-no-drag onClick={() => setActiveTagPickerId(activeTagPickerId === item.id ? null : item.id)}><Icon name={TAG_ICON[item.tag]} size={16} /></button> : <QuickTodoAddTagButton className="quick-pocket-tag" title="设置标签" aria-label="设置标签" data-no-drag onClick={() => setActiveTagPickerId(activeTagPickerId === item.id ? null : item.id)} />}
        {activeTagPickerId === item.id && <QuickPocketTagPicker value={item.tag} onChange={(selectedTag) => { const nextTag = item.tag === selectedTag ? null : selectedTag; setActiveTagPickerId(null); void onUpdate(item.id, item.title, item.body, nextTag).catch(() => undefined); }} />}
      </span>
    </div>;
  };
  const renderGroup = (group: QuickPocketGroup, members: QuickPocketItem[]) => {
    if (members.length < 2) return null;
    const collapsed = collapsedGroups[group.id] ?? false;
    return <section key={group.id} className={`quick-pocket-group${draggedGroupId === group.id ? " is-dragging" : ""}`} data-group-id={group.id}>
      <header className={`quick-pocket-group-header${dragTargetIsGroupHeader && dragTargetId === members[0].id ? ` quick-pocket-insert-${dragPlacement}` : ""}`} data-pocket-id={members[0].id} data-group-id={group.id} data-pocket-group-header="true">
        <button type="button" className="quick-pocket-group-drag" title="拖动分组" aria-label="拖动分组" data-no-drag onPointerDown={(event) => beginGroupDrag(event, group.id)}><Icon name="drag_handle" size={16} /></button>
        <button type="button" className="quick-pocket-group-collapse" title={collapsed ? "展开分组" : "折叠分组"} aria-label={collapsed ? "展开分组" : "折叠分组"} data-no-drag onClick={() => toggleGroup(group.id)}><Icon name={collapsed ? "tab_chevron_right" : "collapse"} size={14} /></button>
        {editingGroupId === group.id ? <input autoFocus className="quick-pocket-group-name-input" value={editingGroupName} onChange={(event) => setEditingGroupName(event.target.value)} onBlur={() => void commitRenameGroup()} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void commitRenameGroup(); } if (event.key === "Escape") setEditingGroupId(null); }} /> : <button type="button" className="quick-pocket-group-name" title="双击重命名" data-no-drag onDoubleClick={() => startRenameGroup(group)}>{group.name}</button>}
        <span className="quick-pocket-group-actions"><span className="quick-pocket-group-count">{members.length}</span><button type="button" className="quick-pocket-group-action" title="在此分组中新建条目" aria-label="在此分组中新建条目" data-no-drag onClick={() => openNew(group.id)}><Icon name="new_note" size={15} /></button>{dissolveGroupId === group.id ? <button type="button" className="quick-pocket-group-action danger" title="确认解散分组" aria-label="确认解散分组" data-no-drag onClick={() => void onDissolveGroup(group.id).then(() => setDissolveGroupId(null))}><Icon name="confirm" size={15} /></button> : <button type="button" className="quick-pocket-group-action" title="解散分组" aria-label="解散分组" data-no-drag onClick={() => setDissolveGroupId(group.id)}><Icon name="delete" size={15} /></button>}</span>
      </header>
      {!collapsed && <div className="quick-pocket-group-items">{members.map(renderItem)}</div>}
    </section>;
  };

  return <section className="quick-pocket-panel" aria-label={pocketName} onKeyDown={(event) => { if (event.key === "Escape" && inputOpen) { setInputOpen(false); setForm(EMPTY_FORM); } }}>
    <header className="quick-pocket-header" onMouseDown={(event) => { if (windowDragRegion && event.button === 0 && !(event.target as HTMLElement).closest("[data-no-drag]")) onWindowDragStart?.(); }}>
      <span className="quick-pocket-title"><Icon name="pills" size={18} />{pocketName}</span><span className="quick-pocket-actions"><button type="button" className="plusButton quick-pocket-new-button" title="新建笔记" aria-label="新建笔记" data-no-drag onClick={() => openNew()}><svg className="plusIcon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 30 30" aria-hidden="true"><path d="M13.75 23.75V16.25H6.25V13.75H13.75V6.25H16.25V13.75H23.75V16.25H16.25V23.75H13.75Z" /></svg></button>{headerActions}<CloseButton aria-label="关闭" title="关闭" onClick={onClose} /></span>
    </header>
    {inputOpen && <div className="quick-pocket-input" data-no-drag onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) void submit(); }}><div className="quick-pocket-title-field"><div className="quick-pocket-title-input-wrap"><input autoFocus value={form.title} placeholder="标题（可选）" onChange={(event) => setForm({ ...form, title: event.target.value })} onKeyDown={(event) => { if (shouldSubmitInputKey(event)) { event.preventDefault(); void submit(); } }} /><div className="quick-pocket-title-line" aria-hidden="true">&nbsp;</div></div><button type="button" className="quick-pocket-save" title="保存" aria-label="保存" disabled={submitting} onClick={() => void submit()}>Add</button></div><textarea value={form.body} placeholder="内文" rows={3} onChange={(event) => setForm({ ...form, body: event.target.value })} onKeyDown={(event) => { if (shouldSubmitInputKey(event)) { event.preventDefault(); void submit(); } }} /><div className="quick-pocket-input-footer"><span className="quick-pocket-tag-picker">{QUICK_POCKET_TAGS.map((tag) => <button key={tag.id} type="button" className={form.tag === tag.id ? `tag-${tag.id} active` : `tag-${tag.id}`} title={tag.label} aria-label={tag.label} onClick={() => setForm({ ...form, tag: form.tag === tag.id ? null : tag.id })}><Icon name={TAG_ICON[tag.id]} size={16} /></button>)}</span></div></div>}
    {pendingGroupIds && <div className="quick-pocket-group-dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setPendingGroupIds(null); }}>
      <div className="quick-pocket-group-dialog" role="dialog" aria-modal="true" aria-label="新建分组">
        <div className="quick-pocket-group-dialog-field">
          <input id="quick-pocket-group-name" className="quick-pocket-group-dialog-input" autoFocus value={groupNameDraft} placeholder="分组名称..." onChange={(event) => setGroupNameDraft(event.target.value)} onBlur={() => setPendingGroupIds(null)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void confirmCreateGroup(); } if (event.key === "Escape") setPendingGroupIds(null); }} />
          <div className="quick-pocket-group-dialog-line" aria-hidden="true">&nbsp;</div>
        </div>
        <button type="button" className="quick-pocket-group-dialog-add" data-no-drag onPointerDown={(event) => event.preventDefault()} onClick={() => void confirmCreateGroup()}>Add</button>
      </div>
    </div>}
    {error && <p className="quick-pocket-error" role="alert">{error}</p>}
    <div className="quick-pocket-list" ref={listRef} onPointerMove={beginDragTarget} onPointerUp={(event) => void finishDrag(event)} onPointerCancel={(event) => void finishDrag(event, true)} onLostPointerCapture={(event) => void finishDrag(event, true)}>
      {loading && items.length === 0 && <p className="quick-pocket-empty">正在读取…</p>}
      {!loading && items.length > 0 && visibleItems.length === 0 && <p className="quick-pocket-empty">该标签暂无内容</p>}
      {!loading && items.length === 0 && <p className="quick-pocket-empty">暂无内容，点击右上角输入</p>}
      {selectedTag ? visibleItems.map(renderItem) : listNodes.map((node) => node.type === "item" ? renderItem(node.item) : renderGroup(node.group, node.items))}
    </div>
    <footer className="quick-pocket-footer"><span className="quick-pocket-filter-bar" aria-label="按标签筛选">{QUICK_POCKET_TAGS.map((tag) => <button key={tag.id} type="button" className={`quick-pocket-filter-button tag-${tag.id}${selectedTag === tag.id ? " active" : ""}`} title={`${selectedTag === tag.id ? "取消" : "筛选"}${tag.label}`} aria-label={`${selectedTag === tag.id ? "取消" : "筛选"}${tag.label}`} onClick={() => setSelectedTag(selectedTag === tag.id ? null : tag.id)}><Icon name={TAG_ICON[tag.id]} size={16} /></button>)}</span><span className="quick-pocket-footer-status">{visibleItems.length} 个条目<span>{inputOpen ? "编辑中" : "已保存"}</span></span></footer>
  </section>;
});
