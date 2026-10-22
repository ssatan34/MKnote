import { getVersion } from "@tauri-apps/api/app";
import { invoke as tauriInvoke } from "@tauri-apps/api/core";
import { emit as tauriEmit, listen as tauriListen, type EventCallback, type UnlistenFn } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { open, type OpenDialogOptions } from "@tauri-apps/plugin-dialog";
import { measureAsync, measureBlocking } from "../utils/perf";

export const appBridge = {
  invoke<T>(command: string, args?: Record<string, unknown>): Promise<T> {
    return measureAsync(
      `invoke:${command}`,
      () => measureBlocking(
        `invoke:${command}`,
        () => tauriInvoke<T>(command, args),
        { command, operation: "tauri-invoke-dispatch" },
      ),
      { command },
    );
  },

  listen<T>(event: string, handler: EventCallback<T>): Promise<UnlistenFn> {
    return measureAsync(
      `listen:${event}`,
      () => tauriListen<T>(event, handler),
      { event },
    );
  },

  emit<T>(event: string, payload?: T): Promise<void> {
    return measureAsync(
      `emit:${event}`,
      () => tauriEmit(event, payload),
      { event },
    );
  },

  window: {
    current() {
      return getCurrentWindow();
    },

    show(): Promise<void> {
      return appBridge.invoke("show_window");
    },

    hide(): Promise<void> {
      return appBridge.invoke("hide_window");
    },

    startDragging(): Promise<void> {
      return measureAsync("window:startDragging", () => getCurrentWindow().startDragging());
    },
  },

  dialog: {
    open(options?: OpenDialogOptions) {
      return measureAsync("dialog:open", () => open(options));
    },
  },

  app: {
    version(): Promise<string> {
      return measureAsync("app:version", () => getVersion());
    },
  },
};
