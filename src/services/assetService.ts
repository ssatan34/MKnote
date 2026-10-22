import { appBridge } from "./appBridge";
import type { LskyCleanupDeleteResult, LskyCleanupReport } from "../types";

export const assetService = {
  uploadImage(filename: string, data: number[]) {
    return appBridge.invoke<string>("upload_image", { filename, data });
  },

  uploadToLsky(filename: string, data: number[]) {
    return appBridge.invoke<string>("upload_to_lsky", { filename, data });
  },

  scanLskyCleanup() {
    return appBridge.invoke<LskyCleanupReport>("scan_lsky_cleanup");
  },

  deleteLskyCleanup(keys: string[]) {
    return appBridge.invoke<LskyCleanupDeleteResult>("delete_lsky_cleanup", { keys });
  },
  scanCloudImgsCleanup() {
    return appBridge.invoke<LskyCleanupReport>("scan_cloudimgs_cleanup");
  },
  deleteCloudImgsCleanup(keys: string[]) {
    return appBridge.invoke<LskyCleanupDeleteResult>("delete_cloudimgs_cleanup", { keys });
  },

  downloadAndOverwrite(url: string, markdownPath: string) {
    return appBridge.invoke("download_and_overwrite_asset", { url, markdownPath });
  },

  resolveDisplayUrl(markdownPath: string) {
    return appBridge.invoke<string>("resolve_asset_display_url", { markdownPath });
  },

  importAsset(sourcePath: string) {
    return appBridge.invoke<string>("import_asset", { sourcePath });
  },

  overwriteAsset(markdownPath: string, dataBase64: string) {
    return appBridge.invoke("overwrite_asset", { markdownPath, dataBase64 });
  },

  importClipboardImage(ext: string, data: number[]) {
    return appBridge.invoke<string>("import_clipboard_image", { ext, data });
  },
};
