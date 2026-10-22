import { appBridge } from "./appBridge";
import type { AppConfig } from "../types";

export const messageHubService = {
  setS3Config(patch: {
    endpoint?: string;
    bucket?: string;
    objectKey?: string;
    accessKey?: string;
    secretKey?: string;
  }) {
    return appBridge.invoke<AppConfig>("set_message_hub_s3_config", {
      endpoint: patch.endpoint,
      bucket: patch.bucket,
      objectKey: patch.objectKey,
      accessKey: patch.accessKey,
      secretKey: patch.secretKey,
    });
  },

  testConnection(args: {
    endpoint: string;
    bucket: string;
    objectKey: string;
    accessKey: string;
    secretKey: string;
  }) {
    return appBridge.invoke("message_hub_test_connection", args);
  },
};
