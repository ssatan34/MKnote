import type { ImageHostProvider } from "../types";

export interface ImageHostProviderConfig {
  image_host_provider?: string | null;
  lsky_enabled?: boolean;
  image_host_enabled?: boolean | null;
}

/**
 * 兼容旧版只保存 lsky_enabled 的配置，同时阻止未知值意外触发上传。
 */
export function resolveImageHostProvider(config: ImageHostProviderConfig): ImageHostProvider {
  if (config.image_host_enabled === false) return "none";
  const configured = config.image_host_provider?.trim().toLowerCase();
  if (configured === "none" || configured === "lsky" || configured === "cloudimgs") {
    return configured;
  }
  if (configured) return "none";
  return config.lsky_enabled ? "lsky" : "none";
}
