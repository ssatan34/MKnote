import { appBridge } from "./appBridge";
import type { CustomTagDef, NoteColorSummary, NoteFolderSummary, NoteSummary } from "../types";

export const libraryService = {
  refreshAgentIndex() {
    return appBridge.invoke("refresh_agent_index");
  },

  listFolders() {
    return appBridge.invoke<NoteFolderSummary[]>("list_folders");
  },

  listNoteColors() {
    return appBridge.invoke<NoteColorSummary[]>("list_note_colors");
  },

  listNotesByColor(color: string) {
    return appBridge.invoke<NoteSummary[]>("list_notes_by_color", { color });
  },

  listCustomTags() {
    return appBridge.invoke<CustomTagDef[]>("list_custom_tags");
  },

  createFolder(title: string) {
    return appBridge.invoke<NoteFolderSummary>("create_folder", { title });
  },

  renameFolder(oldId: string, newTitle: string) {
    return appBridge.invoke<NoteFolderSummary>("rename_folder", { oldId, newTitle });
  },

  addCustomTag(name: string, hex: string) {
    return appBridge.invoke<CustomTagDef>("add_custom_tag", { name, hex });
  },

  deleteCustomTag(id: string) {
    return appBridge.invoke("delete_custom_tag", { id });
  },

  updateCustomTag(id: string, patch: { name?: string | null; hex?: string | null }) {
    return appBridge.invoke<CustomTagDef>("update_custom_tag", {
      id,
      name: patch.name ?? null,
      hex: patch.hex ?? null,
    });
  },
};
