import { appBridge } from "./appBridge";
import { createMigrationSnapshotCache } from "../utils/migrationSnapshotCache";
import type {
  NoteRevision,
  NoteSnapshot,
  NoteSummary,
  NoteZone,
  SearchHit,
  TrashEntry,
} from "../types";

const prepareMigrationSnapshot = createMigrationSnapshotCache((zone, name) =>
  appBridge.invoke<void>("ensure_visual_editor_migration_snapshot", { zone, name }),
);

export const notesService = {
  list(zone: NoteZone | string) {
    return appBridge.invoke<NoteSummary[]>("list_notes", { zone });
  },

  read(zone: NoteZone | string, name: string) {
    return appBridge.invoke<string>("read_note", { zone, name });
  },

  readSnapshot(zone: NoteZone | string, name: string) {
    return appBridge.invoke<NoteSnapshot>("read_note_snapshot", { zone, name });
  },

  ensureVisualEditorMigrationSnapshot(zone: NoteZone | string, name: string) {
    return prepareMigrationSnapshot(zone, name);
  },

  write(zone: NoteZone | string, name: string, content: string, expectedContentHash?: string) {
    return appBridge.invoke<NoteRevision>("write_note_checked", {
      zone,
      name,
      content,
      expectedContentHash,
    });
  },

  writeDefault(content: string, expectedContentHash?: string) {
    return appBridge.invoke<NoteRevision>("write_default_note_checked", {
      content,
      expectedContentHash,
    });
  },

  readDefault() {
    return appBridge.invoke<string>("read_default_note");
  },

  readDefaultSnapshot() {
    return appBridge.invoke<NoteSnapshot>("read_default_note_snapshot");
  },

  ensureDefault() {
    return appBridge.invoke("ensure_default_note");
  },

  create(zone: NoteZone | string) {
    return appBridge.invoke<NoteSummary>("create_note", { zone });
  },

  quickCapture(content: string) {
    return appBridge.invoke<NoteSummary>("quick_capture_create", { content });
  },

  createFromTemplate(zone: NoteZone | string, templateId: string, title?: string | null) {
    return appBridge.invoke<NoteSummary>("create_note_from_template", { zone, templateId, title });
  },

  rename(zone: NoteZone | string, oldName: string, newTitle: string) {
    return appBridge.invoke<NoteSummary>("rename_note", { zone, oldName, newTitle });
  },

  move(fromZone: NoteZone | string, toZone: NoteZone | string, name: string) {
    return appBridge.invoke<NoteSummary>("move_note", { fromZone, toZone, name });
  },

  delete(zone: NoteZone | string, name: string) {
    return appBridge.invoke("delete_note", { zone, name });
  },

  deleteIfEmpty(zone: NoteZone | string, name: string) {
    return appBridge.invoke<boolean>("delete_empty_note_if_needed", { zone, name });
  },

  archive(zone: NoteZone | string, name: string) {
    return appBridge.invoke<NoteSummary>("archive_note", { zone, name });
  },

  restoreFromTrash(id: string) {
    return appBridge.invoke<NoteSummary>("restore_from_trash", { id });
  },

  permanentlyDeleteTrash(id: string) {
    return appBridge.invoke("permanently_delete_trash", { id });
  },

  setColor(zone: NoteZone | string, name: string, color: string | null) {
    return appBridge.invoke<NoteSummary>("set_note_color", { zone, name, color });
  },

  findBacklinks(title: string) {
    return appBridge.invoke<NoteSummary[]>("find_backlinks", { title });
  },

  getDir(zone: NoteZone | string) {
    return appBridge.invoke<string>("get_note_dir", { zone });
  },

  search(query: string, options: unknown = null) {
    return appBridge.invoke<SearchHit[]>("search_notes", { query, options });
  },

  listTrash() {
    return appBridge.invoke<TrashEntry[]>("list_trash");
  },

  emptyTrash() {
    return appBridge.invoke("empty_trash");
  },
};
