import { useCallback, useEffect, useRef, useState } from "react";
import { libraryService } from "../services/libraryService";
import { notesService } from "../services/notesService";
import type { NoteFolderSummary, NoteZone } from "../types";
import type { QuickTodoNoteTarget } from "../utils/quickTodoModel";

function zoneLabel(zone: NoteZone, folders: NoteFolderSummary[]): string {
  if (zone === "default") return "默认";
  if (zone === "inbox") return "收件箱";
  if (zone === "private") return "私密";
  if (zone === "folder:archive") return "存档";
  return folders.find((folder) => folder.zone === zone)?.title ?? zone;
}

export function useQuickTodoNoteTargets() {
  const [targets, setTargets] = useState<QuickTodoNoteTarget[]>([]);
  const [loading, setLoading] = useState(true);
  const mountedRef = useRef(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const folders = await libraryService.listFolders();
      const zones = Array.from(new Set<NoteZone>(["default", "inbox", "private", "folder:archive", ...folders.map((folder) => folder.zone)]));
      const notes = (await Promise.all(zones.map((zone) => notesService.list(zone)))).flat();
      const next = notes
        .map((note) => ({
          zone: note.zone,
          name: note.name,
          title: note.title || note.name,
          zoneLabel: zoneLabel(note.zone, folders),
        }))
        .sort((left, right) => `${left.zoneLabel}${left.title}`.localeCompare(`${right.zoneLabel}${right.title}`, "zh-CN"));
      if (mountedRef.current) setTargets(next);
    } catch {
      if (mountedRef.current) setTargets([]);
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    return () => {
      mountedRef.current = false;
    };
  }, [refresh]);

  return { targets, loading, refresh };
}
