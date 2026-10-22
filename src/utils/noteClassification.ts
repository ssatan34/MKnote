import type { NoteClassificationConfig, NoteZone } from "../types";

export function canClassifyNote(zone: NoteZone, name: string, privacy = false, rootDefault = false): boolean {
  return zone === "default" && !privacy && !rootDefault && name !== "default-note.md" && name !== "待办事项.md";
}

export function classificationReady(settings?: NoteClassificationConfig): boolean {
  return Boolean(settings?.enabled && settings.folders.length && settings[settings.provider].api_token?.trim());
}
