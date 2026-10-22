import { useCallback, useEffect, useRef } from "react";
import type { NoteRevision, NoteZone } from "../types";
import {
  createRevisionAwareWriteQueue,
  type RevisionAwareWrite,
} from "../utils/revisionAwareWriteQueue";

export interface QueuedNoteWrite extends RevisionAwareWrite {
  zone: NoteZone;
  name: string;
}

function saveKey(zone: NoteZone, name: string): string {
  return `${zone}::${name}`;
}

export function useQueuedNoteWriter(
  write: (save: QueuedNoteWrite) => Promise<NoteRevision>,
) {
  const writeRef = useRef(write);
  const queueRef = useRef<{
    enqueue(key: string, save: QueuedNoteWrite): Promise<NoteRevision>;
  } | null>(null);

  useEffect(() => {
    writeRef.current = write;
  }, [write]);

  if (!queueRef.current) {
    queueRef.current = createRevisionAwareWriteQueue<NoteRevision, QueuedNoteWrite>(
      (save) => writeRef.current(save),
    );
  }

  return useCallback(
    (save: QueuedNoteWrite) => queueRef.current!.enqueue(saveKey(save.zone, save.name), save),
    [],
  );
}
