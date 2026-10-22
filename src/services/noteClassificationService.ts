import { appBridge } from "./appBridge";
import type { AppConfig, NoteClassificationConfig, NoteSummary } from "../types";

export interface FolderDecision { target_zone: string; content_hash: string }

export const noteClassificationService = {
  save(settings: NoteClassificationConfig) {
    return appBridge.invoke<AppConfig>("set_note_classification_config", { settings });
  },
  test(settings: NoteClassificationConfig) {
    return appBridge.invoke<void>("test_note_classification_connection", { settings });
  },
  suggest(name: string) {
    return appBridge.invoke<FolderDecision>("suggest_note_folder", { name });
  },
  apply(name: string, decision: FolderDecision) {
    return appBridge.invoke<NoteSummary>("apply_note_classification", {
      name, targetZone: decision.target_zone, expectedContentHash: decision.content_hash,
    });
  },
};
