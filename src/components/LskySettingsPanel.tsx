import { useState } from "react";
import type {
  AppConfig,
  ImageHostConfigPatch,
  ImageHostProvider,
  LskyCleanupDeleteResult,
  LskyCleanupReport,
} from "../types";
import { resolveImageHostProvider } from "../utils/imageHost";
import { LskyCleanupPanel } from "./LskyCleanupPanel";
import { PasswordInput } from "./PasswordInput";
import { Tabs, TabsList, TabsTrigger } from "./ui/tabs";

interface ImageHostSettingsPanelProps {
  config: AppConfig;
  onSave: (patch: ImageHostConfigPatch) => Promise<void>;
  onLskyTestConnection: (url: string, email: string, password: string) => Promise<void>;
  onCloudImgsTestConnection: (url: string, password: string, directory: string) => Promise<void>;
  onScan: () => Promise<LskyCleanupReport>;
  onDelete: (keys: string[]) => Promise<LskyCleanupDeleteResult>;
  onCloudImgsCleanupScan: () => Promise<LskyCleanupReport>;
  onCloudImgsCleanupDelete: (keys: string[]) => Promise<LskyCleanupDeleteResult>;
}

export function ImageHostSettingsPanel({
  config,
  onSave,
  onLskyTestConnection,
  onCloudImgsTestConnection,
  onScan,
  onDelete,
  onCloudImgsCleanupScan,
  onCloudImgsCleanupDelete,
}: ImageHostSettingsPanelProps) {
  const [provider, setProvider] = useState<Exclude<ImageHostProvider, "none">>(
    config.image_host_provider === "cloudimgs" ? "cloudimgs" : "lsky",
  );
  const [enabled, setEnabled] = useState(resolveImageHostProvider(config) !== "none");
  const [lskyUrl, setLskyUrl] = useState(config.lsky_url ?? "");
  const [lskyEmail, setLskyEmail] = useState(config.lsky_email ?? "");
  const [lskyPassword, setLskyPassword] = useState(config.lsky_password ?? "");
  const [lskyStrategyId, setLskyStrategyId] = useState(String(config.lsky_strategy_id ?? 4));
  const [cloudimgsUrl, setCloudimgsUrl] = useState(
    config.cloudimgs_url ?? "",
  );
  const [cloudimgsPassword, setCloudimgsPassword] = useState(config.cloudimgs_password ?? "");
  const [cloudimgsDirectory, setCloudimgsDirectory] = useState(
    config.cloudimgs_directory ?? "MDnote",
  );
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const canTest = provider === "lsky"
    ? Boolean(lskyUrl.trim() && lskyEmail.trim() && lskyPassword.trim())
    : provider === "cloudimgs"
      ? Boolean(cloudimgsUrl.trim() && cloudimgsPassword.trim() && cloudimgsDirectory.trim())
      : false;

  const runTest = async () => {
    if (!canTest) return;
    setTesting(true);
    setMessage(null);
    try {
      if (provider === "lsky") {
        await onLskyTestConnection(lskyUrl.trim(), lskyEmail.trim(), lskyPassword.trim());
      } else {
        await onCloudImgsTestConnection(
          cloudimgsUrl.trim(),
          cloudimgsPassword.trim(),
          cloudimgsDirectory.trim(),
        );
      }
      setMessage("连接成功，并已确认目标相册/目录可用");
    } catch (error) {
      setMessage(String(error));
    } finally {
      setTesting(false);
    }
  };

  const save = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const parsedStrategyId = lskyStrategyId.trim() ? Number(lskyStrategyId) : null;
      if (
        parsedStrategyId !== null &&
        (!Number.isInteger(parsedStrategyId) || parsedStrategyId <= 0)
      ) {
        throw new Error("策略 ID 必须是大于 0 的整数");
      }
      await onSave({
        provider,
        enabled,
        lskyUrl: lskyUrl.trim(),
        lskyEmail: lskyEmail.trim(),
        lskyPassword: lskyPassword.trim(),
        lskyStrategyId: parsedStrategyId,
        cloudimgsUrl: cloudimgsUrl.trim(),
        cloudimgsPassword: cloudimgsPassword.trim(),
        cloudimgsDirectory: cloudimgsDirectory.trim(),
      });
      setMessage("已保存");
    } catch (error) {
      setMessage(String(error));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="settings-section-stack lsky-cleanup-panel">
      <section className="settings-card">
        <div className="settings-card-head">
          <div>
            <strong>图床配置</strong>
            <span>选择图片自动上传服务</span>
          </div>
        </div>

        <Tabs value={provider} onValueChange={(value) => setProvider(value as Exclude<ImageHostProvider, "none">)}>
          <TabsList aria-label="图床提供商">
            <TabsTrigger value="lsky" disabled={saving || testing}>兰空图床</TabsTrigger>
            <TabsTrigger value="cloudimgs" disabled={saving || testing}>云图</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="settings-toggle-row">
          <span>启用图床自动上传</span>
          <button type="button" role="switch" aria-label="启用图床自动上传" aria-checked={enabled}
            className={`settings-toggle${enabled ? " active" : ""}`}
            disabled={saving || testing} onClick={() => setEnabled(!enabled)}>
            <span className="settings-toggle-thumb" />
          </button>
        </div>
        <p className="siyuan-settings-hint">图片会保留本地副本；关闭后仅保存到本地。点击保存生效。</p>

        {provider === "lsky" ? (
          <>
            <label className="siyuan-settings-field">
              <span>图床地址</span>
              <input value={lskyUrl} onChange={(event) => setLskyUrl(event.target.value)} />
            </label>
            <label className="siyuan-settings-field">
              <span>账号</span>
              <input value={lskyEmail} onChange={(event) => setLskyEmail(event.target.value)} />
            </label>
            <PasswordInput
              label="密码"
              value={lskyPassword}
              autoComplete="current-password"
              onChange={(event) => setLskyPassword(event.target.value)}
            />
            <label className="siyuan-settings-field">
              <span>策略 ID</span>
              <input
                type="number"
                min={1}
                step={1}
                value={lskyStrategyId}
                onChange={(event) => setLskyStrategyId(event.target.value)}
              />
            </label>
          </>
        ) : null}

        {provider === "cloudimgs" ? (
          <>
            <label className="siyuan-settings-field">
              <span>云图地址</span>
              <input
                value={cloudimgsUrl}
                placeholder="https://cloudimgs.example.com"
                onChange={(event) => setCloudimgsUrl(event.target.value)}
              />
            </label>
            <PasswordInput
              label="访问密码"
              value={cloudimgsPassword}
              autoComplete="current-password"
              onChange={(event) => setCloudimgsPassword(event.target.value)}
            />
            <label className="siyuan-settings-field">
              <span>相册/目录</span>
              <input
                value={cloudimgsDirectory}
                placeholder="MDnote"
                onChange={(event) => setCloudimgsDirectory(event.target.value)}
              />
            </label>
            <p className="siyuan-settings-hint">
              地址填写云图站点根地址，不要附加 <code>/api</code>；上传会固定写入此相册/目录。
            </p>
          </>
        ) : null}

        <div className="siyuan-settings-actions">
          {enabled ? (
            <button
              type="button"
              className="mk-save-button mk-test-button"
              disabled={!canTest || testing || saving}
              onClick={() => void runTest()}
            >
              {testing ? "测试中…" : "测试连接"}
            </button>
          ) : null}
          <button type="button" className="mk-save-button" disabled={saving || testing} onClick={() => void save()}>
            {saving ? "保存中…" : "保存"}
          </button>
        </div>
        {message ? <p className="siyuan-settings-msg" role="status">{message}</p> : null}
      </section>

      {enabled ? (
        <LskyCleanupPanel
          key={provider}
          provider={provider}
          onScan={provider === "cloudimgs" ? onCloudImgsCleanupScan : onScan}
          onDelete={provider === "cloudimgs" ? onCloudImgsCleanupDelete : onDelete}
        />
      ) : null}
    </div>
  );
}

export const LskySettingsPanel = ImageHostSettingsPanel;
