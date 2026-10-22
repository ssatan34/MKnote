import { appBridge } from "./appBridge";
import type { AppConfig } from "../types";
import { createProtectedSyncTick } from "../utils/syncTick";

export interface SyncStatus {
  enabled: boolean;
  initialized: boolean;
  state: "disabled" | "ready" | "conflict" | string;
  pendingItems: number;
  conflicts: number;
  lastSuccessAtMs: number | null;
  lastError: string | null;
}

const runTick = createProtectedSyncTick((editorDirty: boolean) =>
  appBridge.invoke<SyncStatus>("sync_tick", { editorDirty }),
  () => appBridge.invoke<void>("sync_protect_default_note"),
);

export const syncService = {
  status() {
    return appBridge.invoke<SyncStatus>("sync_status");
  },

  setEnabled(enabled: boolean) {
    return appBridge.invoke<AppConfig>("set_sync_enabled", { enabled });
  },

  bootstrap(mode: "local" | "remote") {
    return appBridge.invoke<SyncStatus>("sync_bootstrap", { mode });
  },

  tick(editorDirty = false) {
    return runTick(editorDirty);
  },

  resolveConflicts(resolution: "local" | "remote") {
    return appBridge.invoke<SyncStatus>("sync_resolve_conflicts", { resolution });
  },
};
