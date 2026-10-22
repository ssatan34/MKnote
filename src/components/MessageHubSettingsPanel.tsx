import { useEffect, useRef, useState } from "react";
import { CloseButton } from "./CloseButton";
import { PasswordInput } from "./PasswordInput";
import { Icon } from "./Icon";
import type { AppConfig } from "../types";
import { appBridge } from "../services/appBridge";
import { syncService, type SyncStatus } from "../services/syncService";

export interface MessageHubSettingsPanelProps {
  config: AppConfig;
  onSave: (patch: {
    endpoint: string;
    bucket: string;
    objectKey: string;
    accessKey: string;
    secretKey: string;
  }) => Promise<void>;
  onTestConnection: (
    endpoint: string,
    bucket: string,
    objectKey: string,
    accessKey: string,
    secretKey: string,
  ) => Promise<void>;
  onSyncEnabledChange?: (enabled: boolean) => Promise<void>;
  onSyncBootstrap?: (mode: "local" | "remote") => Promise<void>;
  onSyncResolveConflicts?: (resolution: "local" | "remote") => Promise<void>;
  onClose?: () => void;
  embedded?: boolean;
}

export function MessageHubSettingsPanel({
  config,
  onSave,
  onTestConnection,
  onSyncEnabledChange,
  onSyncBootstrap,
  onSyncResolveConflicts,
  onClose,
  embedded = false,
}: MessageHubSettingsPanelProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [endpoint, setEndpoint] = useState(config.s3_endpoint ?? "");
  const [bucket, setBucket] = useState(config.s3_bucket ?? "mdnote");
  const [objectKey, setObjectKey] = useState(config.s3_object_key ?? "MDnote/messages.json");
  const [accessKey, setAccessKey] = useState(config.s3_access_key ?? "");
  const [secretKey, setSecretKey] = useState(config.s3_secret_key ?? "");
  const [testMsg, setTestMsg] = useState<string | null>(null);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [syncBusy, setSyncBusy] = useState(false);
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null);

  useEffect(() => {
    void syncService.status().then(setSyncStatus).catch(() => undefined);
    let unlisten: (() => void) | undefined;
    void appBridge.listen<SyncStatus>("mknote:sync-status-changed", (event) => {
      setSyncStatus(event.payload);
    }).then((stop) => { unlisten = stop; }).catch(() => undefined);
    return () => unlisten?.();
  }, []);

  const runTest = async () => {
    setTestMsg(null);
    setSaveMsg(null);
    setTesting(true);
    try {
      await onTestConnection(
        endpoint.trim(),
        bucket.trim(),
        objectKey.trim(),
        accessKey.trim(),
        secretKey.trim(),
      );
      setTestMsg("S3 连接成功");
    } catch (e) {
      setTestMsg(String(e));
    } finally {
      setTesting(false);
    }
  };

  const handleSave = async () => {
    setSaveMsg(null);
    setSaving(true);
    try {
      await onSave({
        endpoint: endpoint.trim(),
        bucket: bucket.trim(),
        objectKey: objectKey.trim(),
        accessKey: accessKey.trim(),
        secretKey: secretKey.trim(),
      });
      setSaveMsg("已保存");
    } catch (e) {
      setSaveMsg(String(e));
    } finally {
      setSaving(false);
    }
  };

  const canSubmit = accessKey.trim() && secretKey.trim() && endpoint.trim() && bucket.trim() && objectKey.trim();

  const handleSyncEnabledChange = async (enabled: boolean) => {
    if (!onSyncEnabledChange) return;
    setSyncBusy(true);
    try {
      await onSyncEnabledChange(enabled);
      setSyncStatus((previous) => previous ? { ...previous, enabled, state: enabled ? "ready" : "disabled" } : previous);
    } catch (e) {
      setSaveMsg(String(e));
    } finally {
      setSyncBusy(false);
    }
  };

  const handleBootstrap = async (mode: "local" | "remote") => {
    if (!onSyncBootstrap) return;
    setSyncBusy(true);
    try {
      await onSyncBootstrap(mode);
      const status = await syncService.status();
      setSyncStatus(status);
      setSaveMsg("已从云端建立同步基线");
    } catch (e) {
      setSaveMsg(String(e));
    } finally {
      setSyncBusy(false);
    }
  };

  const handleSelectedBootstrap = () => {
    void handleBootstrap("remote");
  };

  const handleResolveConflicts = async (resolution: "local" | "remote") => {
    if (!onSyncResolveConflicts) return;
    setSyncBusy(true);
    setSaveMsg(null);
    try {
      await onSyncResolveConflicts(resolution);
      setSyncStatus(await syncService.status());
      setSaveMsg(resolution === "local" ? "已保留本地版本并上传" : "已采用云端版本");
    } catch (e) {
      setSaveMsg(String(e));
      setSyncStatus(await syncService.status().catch(() => null));
    } finally {
      setSyncBusy(false);
    }
  };

  return (
    <div
      ref={rootRef}
      className={embedded ? "settings-embedded-panel message-hub-settings-popover" : "siyuan-settings-popover message-hub-settings-popover"}
      data-no-drag
      tabIndex={-1}
      onBlur={(e) => {
        if (embedded || !onClose) return;
        const related = e.relatedTarget as Node | null;
        if (e.currentTarget.contains(related)) return;
        if (related instanceof Element && related.closest("[data-popover-trigger]")) return;
        onClose();
      }}
    >
      <div className="siyuan-settings-head">
        <div>
          <strong>S3 同步</strong>
          <span>MinIO 等 S3 兼容存储</span>
        </div>
        {!embedded && onClose ? (
          <CloseButton title="关闭" aria-label="关闭" onClick={onClose} />
        ) : null}
      </div>

      <p className="siyuan-settings-hint">
    使用启用 HTTPS 的 MinIO / S3 兼容存储进行多设备同步。对象 Key 不含前导斜杠。
      </p>

      <label className="siyuan-settings-field">
        <span>S3 Endpoint</span>
        <input
          type="url"
          value={endpoint}
          placeholder="https://your-s3-endpoint.example"
          onChange={(e) => setEndpoint(e.target.value)}
        />
      </label>

      <label className="siyuan-settings-field">
        <span>Bucket</span>
        <input type="text" value={bucket} placeholder="mdnote" onChange={(e) => setBucket(e.target.value)} />
      </label>

      <label className="siyuan-settings-field">
        <span>Object Key</span>
        <input
          type="text"
          value={objectKey}
          placeholder="MDnote/messages.json"
          onChange={(e) => setObjectKey(e.target.value)}
        />
      </label>

      <label className="siyuan-settings-field">
        <span>Access Key</span>
        <input
          type="text"
          value={accessKey}
          autoComplete="username"
          onChange={(e) => setAccessKey(e.target.value)}
        />
      </label>

      <PasswordInput
        label="Secret Key"
        value={secretKey}
        autoComplete="current-password"
        onChange={(e) => setSecretKey(e.target.value)}
      />

      <div className="siyuan-settings-actions">
        <button
          type="button"
          className="siyuan-settings-test-btn mk-save-button mk-test-button"
          disabled={testing || !canSubmit}
          onClick={() => void runTest()}
        >
          <span>{testing ? "Testing…" : "Test"}</span>
        </button>
        <button
          type="button"
          className="siyuan-settings-save-btn mk-save-button"
          disabled={saving}
          onClick={() => void handleSave()}
        >
          <span>Save</span>
        </button>
      </div>

      {testMsg ? <p className="siyuan-settings-msg">{testMsg}</p> : null}
      {saveMsg ? <p className="siyuan-settings-msg siyuan-settings-msg--save">{saveMsg}</p> : null}

      <div className="siyuan-settings-sync-block">
        <div className="sync-settings-heading">
          <div className="siyuan-settings-field-head">
            <strong>自动同步</strong>
            <span>默认笔记、多个 Quick Todo、多个 Quick Pocket</span>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={config.sync_enabled}
            aria-label={config.sync_enabled ? "关闭自动同步" : "开启自动同步"}
            className={`sync-toggle${config.sync_enabled ? " is-on" : ""}`}
            disabled={syncBusy || !config.sync_initialized}
            onClick={() => void handleSyncEnabledChange(!config.sync_enabled)}
          >
            <span className="sync-toggle-track" aria-hidden="true">
              <span className="sync-toggle-thumb" />
            </span>
            <span className="sync-toggle-label">{config.sync_enabled ? "开启" : "关闭"}</span>
          </button>
        </div>
        {syncStatus?.conflicts || syncStatus?.lastError ? (
          <p className="siyuan-settings-hint">
            {syncStatus.conflicts ? `冲突 ${syncStatus.conflicts} 个` : ""}
            {syncStatus.conflicts && syncStatus.lastError ? "；" : ""}
            {syncStatus.lastError ? `最近错误：${syncStatus.lastError}` : ""}
          </p>
        ) : null}
        {syncStatus?.conflicts && onSyncResolveConflicts ? (
          <>
            <p className="siyuan-settings-hint">请选择一个版本作为当前冲突项目的最终版本。采用云端版本前会先保留本地冲突副本。</p>
            <div className="sync-conflict-actions">
              <button
                type="button"
                className="sync-conflict-button"
                disabled={syncBusy}
                onClick={() => void handleResolveConflicts("local")}
              >
                保留本地并上传
              </button>
              <button
                type="button"
                className="sync-conflict-button sync-conflict-button--remote"
                disabled={syncBusy}
                onClick={() => void handleResolveConflicts("remote")}
              >
                采用云端版本
              </button>
            </div>
          </>
        ) : null}
        {!config.sync_initialized ? (
          <>
            <p className="siyuan-settings-hint">首次使用会比较本地与云端：本地已有且不同的内容保留在本地，并另存云端冲突副本。之后本地单边变化上传、云端单边变化下载，双方变化时不覆盖本地。</p>
            <div className="sync-bootstrap-confirm">
              <span>确认后建立安全基线，并开启后台自动同步。</span>
              <button
                type="button"
                className="sync-bootstrap-confirm-button statusbar-btn statusbar-btn--siyuan"
                title={syncBusy ? "正在从云端建立同步基线" : "从云端建立基线并开始自动同步"}
                aria-label={syncBusy ? "正在建立同步基线" : "确认并开始同步"}
                disabled={syncBusy || !canSubmit}
                onClick={handleSelectedBootstrap}
              >
                <Icon name="sync_manual" size={16} />
              </button>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
