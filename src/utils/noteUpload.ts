import type { AppConfig } from "../types";

export type UploadTarget = "none" | "siyuan" | "obsidian";
export interface NoteUploadConfigPatch {
  target: UploadTarget;
  noteDir?: string;
  attachmentDir?: string;
  conflict?: "rename" | "overwrite";
}

export function effectiveUploadTarget(config: AppConfig): UploadTarget {
  return config.note_upload_target ?? (
    [config.siyuan_api_url, config.siyuan_api_token, config.siyuan_notebook_id]
      .every((value) => Boolean(value?.trim())) ? "siyuan" : "none"
  );
}
