import type { NoteZone } from "../types";

const DEFAULT_NOTE_NAME = "default-note.md";

interface NoteWriteTargetInput {
  zone: NoteZone;
  name: string;
  defaultNoteOpen: boolean;
}

/**
 * 根目录默认便签与 default 文件夹中的同名普通便签共享文件名，不能只靠 name 判断写入目标。
 */
export function isRootDefaultNote({
  zone,
  name,
  defaultNoteOpen,
}: NoteWriteTargetInput): boolean {
  return defaultNoteOpen && zone === "default" && name === DEFAULT_NOTE_NAME;
}
