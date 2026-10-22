import { appBridge } from "./appBridge";
import type { AppConfig } from "../types";
import type { NoteUploadConfigPatch } from "../utils/noteUpload";

export const noteUploadService = {
  setConfig(patch: NoteUploadConfigPatch) {
    return appBridge.invoke<AppConfig>("set_note_upload_config", { ...patch });
  },
  uploadObsidian(zone: string, name: string, rootDefault: boolean) {
    return appBridge.invoke<{ path: string; overwritten: boolean }>(
      "obsidian_upload_current_note", { zone, name, rootDefault },
    );
  },
};
