import { useCallback, useEffect, useRef, useState } from "react";
import type { NoteZone } from "../types";
import { tabKey } from "../utils/noteTabs";

export function usePoppedOutNotes() {
  const [poppedOutNotes, setPoppedOutNotes] = useState<Set<string>>(new Set());
  const poppedOutNotesRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    poppedOutNotesRef.current = poppedOutNotes;
  }, [poppedOutNotes]);

  const isPoppedOut = useCallback(
    (zone: NoteZone, name: string) => poppedOutNotesRef.current.has(tabKey(zone, name)),
    [],
  );

  const markPoppedOut = useCallback((zone: NoteZone, name: string) => {
    const key = tabKey(zone, name);
    setPoppedOutNotes((prev) => new Set([...prev, key]));
  }, []);

  const removePoppedOut = useCallback((zone: NoteZone, name: string) => {
    const key = tabKey(zone, name);
    setPoppedOutNotes((prev) => {
      const next = new Set(prev);
      next.delete(key);
      return next;
    });
  }, []);

  const renamePoppedOut = useCallback((zone: NoteZone, oldName: string, newName: string) => {
    const oldKey = tabKey(zone, oldName);
    const newKey = tabKey(zone, newName);
    setPoppedOutNotes((prev) => {
      if (!prev.has(oldKey)) return prev;
      const next = new Set(prev);
      next.delete(oldKey);
      next.add(newKey);
      return next;
    });
  }, []);

  return {
    poppedOutNotes,
    poppedOutNotesRef,
    isPoppedOut,
    markPoppedOut,
    removePoppedOut,
    renamePoppedOut,
  };
}
