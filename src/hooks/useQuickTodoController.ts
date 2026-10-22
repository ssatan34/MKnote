import { useCallback, useEffect, useRef, useState } from "react";
import { quickTodoService } from "../services/quickTodoService";
import { createQuickTodoMutationQueue, isLatestQuickTodoRequest, type QuickTodoItem, type QuickTodoLink, type QuickTodoTag } from "../utils/quickTodoModel";
import { DEFAULT_QUICK_TODO_ID } from "../utils/quickTodoRegistry";

export interface QuickTodoController {
  items: QuickTodoItem[];
  loading: boolean;
  error: string | null;
  reload(): Promise<void>;
  add(text: string, tag: QuickTodoTag | null, parentId?: string | null): Promise<QuickTodoItem[]>;
  edit(id: string, text: string): Promise<QuickTodoItem[]>;
  setTag(id: string, tag: QuickTodoTag | null): Promise<QuickTodoItem[]>;
  setReminder(id: string, remindAt: string | null): Promise<QuickTodoItem[]>;
  setLink(id: string, link: QuickTodoLink | null): Promise<QuickTodoItem[]>;
  toggle(id: string): Promise<QuickTodoItem[]>;
  remove(id: string): Promise<QuickTodoItem[]>;
  reorder(ids: string[]): Promise<QuickTodoItem[]>;
  clearCompleted(): Promise<QuickTodoItem[]>;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function useQuickTodoController(todoId = DEFAULT_QUICK_TODO_ID): QuickTodoController {
  const [items, setItems] = useState<QuickTodoItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const itemsRef = useRef(items);
  const requestVersionRef = useRef(0);
  const pendingMutationsRef = useRef(0);
  const readsInFlightRef = useRef(0);
  const mutationQueueRef = useRef(createQuickTodoMutationQueue());
  itemsRef.current = items;

  const reload = useCallback(async (silent = false) => {
    if (silent && (pendingMutationsRef.current || readsInFlightRef.current)) return;
    readsInFlightRef.current++;
    const requestVersion = ++requestVersionRef.current;
    if (!silent) setLoading(true);
    try {
      const next = await quickTodoService.list(todoId);
      if (!isLatestQuickTodoRequest(requestVersion, requestVersionRef.current)) return;
      if (JSON.stringify(next) !== JSON.stringify(itemsRef.current)) setItems(next);
      setError(null);
    } catch (loadError) {
      if (!isLatestQuickTodoRequest(requestVersion, requestVersionRef.current)) return;
      setError(errorMessage(loadError));
    } finally {
      readsInFlightRef.current--;
      if (isLatestQuickTodoRequest(requestVersion, requestVersionRef.current)) setLoading(false);
    }
  }, [todoId]);

  useEffect(() => {
    let active = true;
    let unlisten: (() => void) | undefined;
    void quickTodoService.onChanged(() => {
      if (active) void reload();
    }, todoId).then((stop) => {
      if (!active) stop();
      else unlisten = stop;
    });
    void reload();
    // Allnote can update the shared Work file without broadcasting a Tauri event.
    // Poll only while idle and visible; never overtake queued local mutations.
    const interval = window.setInterval(() => {
      if (active && document.visibilityState === 'visible') void reload(true);
    }, 2000);
    return () => {
      active = false;
      window.clearInterval(interval);
      unlisten?.();
    };
  }, [reload, todoId]);

  const runListAction = useCallback(
    async (action: () => Promise<QuickTodoItem[]>): Promise<QuickTodoItem[]> => {
      pendingMutationsRef.current++;
      const requestVersion = ++requestVersionRef.current;
      try { return await mutationQueueRef.current(async () => {
        try {
          const next = await action();
          if (!isLatestQuickTodoRequest(requestVersion, requestVersionRef.current)) return itemsRef.current;
          setLoading(false);
          setItems(next);
          setError(null);
          return next;
        } catch (actionError) {
          if (!isLatestQuickTodoRequest(requestVersion, requestVersionRef.current)) return itemsRef.current;
          setLoading(false);
          setItems(itemsRef.current);
          setError(errorMessage(actionError));
          throw actionError;
        }
      }); } finally { pendingMutationsRef.current--; }
    },
    [],
  );

  return {
    items,
    loading,
    error,
    reload,
    add: (text, tag, parentId = null) => runListAction(() => quickTodoService.add(text, tag, parentId, todoId)),
    edit: (id, text) => runListAction(() => quickTodoService.edit(id, text, todoId)),
    setTag: (id, tag) => runListAction(() => quickTodoService.setTag(id, tag, todoId)),
    setReminder: (id, remindAt) => runListAction(() => quickTodoService.setReminder(id, remindAt, todoId)),
    setLink: (id, link) => runListAction(() => quickTodoService.setLink(id, link, todoId)),
    toggle: (id) => runListAction(() => quickTodoService.toggle(id, todoId)),
    remove: (id) => runListAction(() => quickTodoService.delete(id, todoId)),
    reorder: (ids) => runListAction(() => quickTodoService.reorder(ids, todoId)),
    clearCompleted: () => runListAction(() => quickTodoService.clearCompleted(todoId)),
  };
}
