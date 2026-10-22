import { appBridge } from "./appBridge";
import type { AppConfig } from "../types";

export const aiService = {
  setConfig(patch: {
    api_url?: string | null;
    api_token?: string | null;
    model?: string | null;
  }) {
    return appBridge.invoke<AppConfig>("set_ai_config", {
      apiUrl: patch.api_url,
      apiToken: patch.api_token,
      model: patch.model,
    });
  },
};
