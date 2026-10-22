import { useCallback, useEffect, useRef, useState } from "react";
import { useQuickTodoController } from "../hooks/useQuickTodoController";
import { useQuickTodoNoteTargets } from "../hooks/useQuickTodoNoteTargets";
import { useQuickTodoReminderScheduler } from "../hooks/useQuickTodoReminderScheduler";
import { quickTodoService } from "../services/quickTodoService";
import { windowService } from "../services/windowService";
import { openQuickTodoLinkedNote } from "../utils/quickTodoNoteLink";
import type { QuickTodoTag } from "../utils/quickTodoModel";
import { createQuickTodoEscapeHandler } from "../utils/quickTodoPanelModel";
import { DEFAULT_QUICK_TODO_ID, type QuickTodoDefinition } from "../utils/quickTodoRegistry";
import { Icon } from "./Icon";
import { QuickTodoPanel, type QuickTodoPanelHandle } from "./QuickTodoPanel";
import { QuickTodoPicker } from "./QuickTodoPicker";
import "./QuickTodoEntry.css";

function errorMessage(error: unknown): string { return error instanceof Error ? error.message : String(error); }

function QuickTodoReminderMonitor({ todoId }: { todoId: string }) {
  const controller = useQuickTodoController(todoId);
  useQuickTodoReminderScheduler(controller.items, async (id) => {
    await controller.setReminder(id, null);
  });
  return null;
}

export function QuickTodoEntry() {
  const entryRef = useRef<HTMLDivElement>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [todos, setTodos] = useState<QuickTodoDefinition[]>([]);
  const [pickerLoading, setPickerLoading] = useState(false);
  const [pickerError, setPickerError] = useState<string | null>(null);
  const [fallbackTodoId, setFallbackTodoId] = useState<string | null>(null);
  const [fallbackTodoName, setFallbackTodoName] = useState<string | null>(null);
  const [fallbackError, setFallbackError] = useState<string | null>(null);
  const controller = useQuickTodoController(fallbackTodoId ?? DEFAULT_QUICK_TODO_ID);
  const noteTargets = useQuickTodoNoteTargets();
  const panelRef = useRef<QuickTodoPanelHandle>(null);
  const pickerOpenRef = useRef(false);
  const closePickerRef = useRef<() => void>(() => undefined);

  const loadTodos = useCallback(async () => {
    setPickerLoading(true);
    try {
      const next = await quickTodoService.listTodos();
      setTodos(next);
      setPickerError(null);
    } catch (error) {
      setPickerError(`读取 Todo 列表失败：${errorMessage(error)}`);
    } finally { setPickerLoading(false); }
  }, []);

  useEffect(() => {
    void loadTodos();
    let unlisten: (() => void) | undefined;
    void quickTodoService.onRegistryChanged(() => void loadTodos()).then((stop) => { unlisten = stop; });
    return () => unlisten?.();
  }, [loadTodos]);

  useEffect(() => {
    if (!pickerOpen && !fallbackTodoId) return;
    const dismissIfOutside = (target: EventTarget | null) => {
      if (target instanceof Node && entryRef.current?.contains(target)) return;
      void Promise.resolve(panelRef.current?.flushEditing()).finally(() => {
        setPickerOpen(false); setFallbackTodoId(null); setFallbackTodoName(null);
      });
    };
    const onPointerDown = (event: PointerEvent) => dismissIfOutside(event.target);
    const onFocusIn = (event: FocusEvent) => dismissIfOutside(event.target);
    const onWindowBlur = () => dismissIfOutside(null);
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("focusin", onFocusIn, true);
    window.addEventListener("blur", onWindowBlur);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("focusin", onFocusIn, true);
      window.removeEventListener("blur", onWindowBlur);
    };
  }, [pickerOpen, fallbackTodoId]);

  useEffect(() => {
    if (!fallbackTodoId) return;
    const handleEscape = createQuickTodoEscapeHandler(
      () => setFallbackTodoId(null),
      () => pickerOpenRef.current,
      () => closePickerRef.current(),
    );
    const onKeyDown = (event: KeyboardEvent) => handleEscape(event);
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [fallbackTodoId]);

  const openWindow = async (todo: QuickTodoDefinition) => {
    try {
      await windowService.openQuickTodo(todo.id);
      setPickerOpen(false); setFallbackTodoId(null); setFallbackError(null);
    } catch (error) {
      setFallbackError(`打开 ${todo.name} 独立窗口失败：${errorMessage(error)}；已回退到程序内面板。`);
      setFallbackTodoId(todo.id); setFallbackTodoName(todo.name); setPickerOpen(false);
    }
  };

  const close = async () => {
    await panelRef.current?.flushEditing();
    setFallbackTodoId(null); setFallbackTodoName(null); setPickerOpen(false);
  };

  return <div ref={entryRef} className="quick-todo-entry">
    {todos.map((todo) => <QuickTodoReminderMonitor key={todo.id} todoId={todo.id} />)}
    <button type="button" className="icon-btn quick-todo-trigger" title="打开 Quick Todo" aria-label="打开 Quick Todo" aria-expanded={pickerOpen || Boolean(fallbackTodoId)} onClick={() => { if (fallbackTodoId) void close(); else { setPickerOpen((open) => !open); if (!pickerOpen) void loadTodos(); } }}>
      <Icon name="task" size={16} className="quick-todo-icon" />
    </button>
    {pickerOpen && <QuickTodoPicker todos={todos} loading={pickerLoading} error={pickerError} onOpen={(todo) => void openWindow(todo)} />}
    {fallbackTodoId && <div className="quick-todo-popover" data-no-drag>
      <QuickTodoPanel
        ref={panelRef}
        todoName={fallbackTodoName ?? "Quick Todo"}
        todoId={fallbackTodoId}
        items={controller.items}
        loading={controller.loading}
        error={fallbackError ?? controller.error}
        onAdd={async (text, tag, parentId) => { await controller.add(text, tag, parentId); }}
        onEdit={async (id, text) => { await controller.edit(id, text); }}
        onSetTag={async (id: string, tag: QuickTodoTag | null) => { await controller.setTag(id, tag); }}
        onOpenReminder={(itemId) => { void windowService.openQuickTodoReminder(fallbackTodoId, itemId).catch((error) => setFallbackError("打开提醒设置窗口失败：" + errorMessage(error))); }}
        noteTargets={noteTargets.targets}
        noteTargetsLoading={noteTargets.loading}
        onRefreshNoteTargets={noteTargets.refresh}
        onSetLink={async (id, link) => { await controller.setLink(id, link); }}
        onOpenLinkedNote={async (link) => { await openQuickTodoLinkedNote(link, noteTargets.targets); }}
        onToggle={async (id) => { await controller.toggle(id); }}
        onDelete={async (id) => { await controller.remove(id); }}
        onReorder={(ids) => controller.reorder(ids)}
        onClose={() => void close()}
        onPickerOpenChange={(open, closePicker) => { pickerOpenRef.current = open; closePickerRef.current = closePicker; }}
      />
    </div>}
  </div>;
}
