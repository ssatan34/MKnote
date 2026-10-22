import { appBridge } from "./appBridge";
import type { AppConfig, NoteZone, SiyuanNotebookSummary, SiyuanSyncedNoteRef, SiyuanSyncStatus, SiyuanUploadResult } from "../types";

export const siyuanService = {
  setConfig(patch: { apiUrl: string; apiToken: string; notebookId: string }) {
    return appBridge.invoke<AppConfig>("set_siyuan_config", {
      apiUrl: patch.apiUrl,
      apiToken: patch.apiToken,
      notebookId: patch.notebookId,
    });
  },

  testConnection(apiUrl: string, apiToken: string) {
    return appBridge.invoke<SiyuanNotebookSummary[]>("siyuan_test_connection", { apiUrl, apiToken });
  },

  uploadCurrentNote(zone: string, name: string, content: string, title: string) {
    return appBridge.invoke<SiyuanUploadResult>("siyuan_upload_current_note", { zone, name, content, title });
  },

  listSyncedNotes() {
    return appBridge.invoke<SiyuanSyncedNoteRef[]>("list_siyuan_synced_notes");
  },

  getSyncStatus(zone: NoteZone | string, name: string) {
    return appBridge.invoke<SiyuanSyncStatus>("get_siyuan_sync_status", { zone, name });
  },
};
