import { useEffect } from "react";
import type { AppConfig } from "../types";
import { appBridge } from "../services/appBridge";
import { createAsyncUnlistenCleanup } from "../utils/asyncUnlisten";
import { configService } from "../services/configService";
import { applyLayoutMinSize } from "../utils/windowLayout";

interface AppShellEffectsOptions {
  config: AppConfig | null;
  applyTheme: (config: AppConfig) => void;
  onConfigLoaded: (config: AppConfig) => void;
  onWindowFocusRevision: () => void;
  onShowDefaultMarkdownEditor: (options?: { preserveTodo?: boolean }) => Promise<unknown>;
}

export function useAppShellEffects({
  config,
  applyTheme,
  onConfigLoaded,
  onWindowFocusRevision,
  onShowDefaultMarkdownEditor,
}: AppShellEffectsOptions) {
  useEffect(() => {
    if (!config) return;
    const mode = config.theme_mode ?? "system";
    if (mode !== "system") return;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => applyTheme(config);
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, [applyTheme, config]);

  useEffect(() => {
    const cleanup = createAsyncUnlistenCleanup(appBridge.window.current()
      .listen("mknote:layout-compact", () => {
        onWindowFocusRevision();
        void configService.getConfig().then(async (nextConfig) => {
          onConfigLoaded(nextConfig);
          await onShowDefaultMarkdownEditor({ preserveTodo: true });
        });
      }));
    return cleanup;
  }, [onConfigLoaded, onShowDefaultMarkdownEditor, onWindowFocusRevision]);

  useEffect(() => {
    if (!config) return;
    void applyLayoutMinSize(config.layout_mode);
  }, [config?.layout_mode]);
}
