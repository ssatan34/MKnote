import { useCallback, useEffect, useRef, useState } from "react";
import { quickPocketService } from "../services/quickPocketService";
import { isLatestQuickPocketRequest, type QuickPocketItem, type QuickPocketSnapshot, type QuickPocketTag } from "../utils/quickPocketModel";
import { DEFAULT_QUICK_POCKET_ID } from "../utils/quickPocketRegistry";

export interface QuickPocketController {
  items: QuickPocketItem[];
  groups: QuickPocketSnapshot["groups"];
  loading: boolean;
  error: string | null;
  reload(): Promise<void>;
  add(title: string, body: string, tag: QuickPocketTag | null, groupId: string | null): Promise<QuickPocketItem[]>;
  update(id: string, title: string, body: string, tag: QuickPocketTag | null): Promise<QuickPocketItem[]>;
  remove(id: string): Promise<QuickPocketItem[]>;
  reorder(ids: string[]): Promise<QuickPocketItem[]>;
  createGroup(ids: string[], name: string): Promise<QuickPocketItem[]>;
  renameGroup(id: string, name: string): Promise<QuickPocketItem[]>;
  dissolveGroup(id: string): Promise<QuickPocketItem[]>;
  moveItem(id: string, groupId: string | null, ids: string[]): Promise<QuickPocketItem[]>;
}

function errorMessage(error: unknown): string { return error instanceof Error ? error.message : String(error); }

export function useQuickPocketController(pocketId = DEFAULT_QUICK_POCKET_ID): QuickPocketController {
  const [snapshot, setSnapshot] = useState<QuickPocketSnapshot>({ items: [], groups: [] });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const snapshotRef = useRef(snapshot);
  const requestVersionRef = useRef(0);
  snapshotRef.current = snapshot;

  const reload = useCallback(async () => {
    const requestVersion = ++requestVersionRef.current;
    setLoading(true);
    try {
      const next = await quickPocketService.list(pocketId);
      if (!isLatestQuickPocketRequest(requestVersion, requestVersionRef.current)) return;
      setSnapshot(next);
      setError(null);
    } catch (loadError) {
      if (!isLatestQuickPocketRequest(requestVersion, requestVersionRef.current)) return;
      setError(errorMessage(loadError));
    } finally {
      if (isLatestQuickPocketRequest(requestVersion, requestVersionRef.current)) setLoading(false);
    }
  }, [pocketId]);

  useEffect(() => {
    setSnapshot({ items: [], groups: [] });
    setError(null);
    let active = true;
    let unlisten: (() => void) | undefined;
    void quickPocketService.onChanged(() => { if (active) void reload(); }, pocketId).then((stop) => { if (!active) stop(); else unlisten = stop; });
    void reload();
    return () => { active = false; unlisten?.(); };
  }, [reload]);

  const runAction = useCallback(async (action: () => Promise<QuickPocketSnapshot>): Promise<QuickPocketItem[]> => {
    const requestVersion = ++requestVersionRef.current;
    try {
      const next = await action();
      if (!isLatestQuickPocketRequest(requestVersion, requestVersionRef.current)) return snapshotRef.current.items;
      setSnapshot(next);
      setError(null);
      return next.items;
    } catch (actionError) {
      if (!isLatestQuickPocketRequest(requestVersion, requestVersionRef.current)) return snapshotRef.current.items;
      setSnapshot(snapshotRef.current);
      setError(errorMessage(actionError));
      throw actionError;
    }
  }, []);

  return {
    items: snapshot.items, groups: snapshot.groups, loading, error, reload,
    add: (title, body, tag, groupId) => runAction(() => quickPocketService.add(title, body, tag, groupId, pocketId)),
    update: (id, title, body, tag) => runAction(() => quickPocketService.update(id, title, body, tag, pocketId)),
    remove: (id) => runAction(() => quickPocketService.delete(id, pocketId)),
    reorder: (ids) => runAction(() => quickPocketService.reorder(ids, pocketId)),
    createGroup: (ids, name) => runAction(() => quickPocketService.createGroup(ids, name, pocketId)),
    renameGroup: (id, name) => runAction(() => quickPocketService.renameGroup(id, name, pocketId)),
    dissolveGroup: (id) => runAction(() => quickPocketService.dissolveGroup(id, pocketId)),
    moveItem: (id, groupId, ids) => runAction(() => quickPocketService.moveItem(id, groupId, ids, pocketId)),
  };
}
