import { useRef } from "react";
import type { NoteZone } from "../types";
import { parseTabKey, tabKey } from "../utils/noteTabs";

export interface TabSession {
  content: string;
  contentHash?: string;
  editorRevision?: number;
  dirty: boolean;
  history: { stack: string[]; index: number };
  viewMode?: "edit" | "preview";
}

export function useTabSessions() {
  const sessionsRef = useRef<Map<string, TabSession>>(new Map());

  const get = (zone: NoteZone, name: string) => sessionsRef.current.get(tabKey(zone, name));

  const set = (zone: NoteZone, name: string, session: TabSession) => {
    sessionsRef.current.set(tabKey(zone, name), session);
  };

  const remove = (zone: NoteZone, name: string) => {
    sessionsRef.current.delete(tabKey(zone, name));
  };

  const renameKey = (zone: NoteZone, oldName: string, newName: string) => {
    const oldKey = tabKey(zone, oldName);
    const session = sessionsRef.current.get(oldKey);
    if (!session) return;
    sessionsRef.current.delete(oldKey);
    sessionsRef.current.set(tabKey(zone, newName), session);
  };

  const removeExcept = (keep: Array<{ zone: NoteZone; name: string }>) => {
    const keepKeys = new Set(keep.map((t) => tabKey(t.zone, t.name)));
    for (const key of [...sessionsRef.current.keys()]) {
      if (!keepKeys.has(key)) sessionsRef.current.delete(key);
    }
  };

  const migrateKeyZone = (oldZone: NoteZone, oldName: string, newZone: NoteZone, newName: string) => {
    const oldKey = tabKey(oldZone, oldName);
    const session = sessionsRef.current.get(oldKey);
    if (!session) return;
    sessionsRef.current.delete(oldKey);
    sessionsRef.current.set(tabKey(newZone, newName), session);
  };

  const clear = () => sessionsRef.current.clear();

  return { get, set, remove, renameKey, removeExcept, migrateKeyZone, clear, sessionsRef, parseTabKey };
}
