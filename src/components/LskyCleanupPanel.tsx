import { useState } from "react";
import type { LskyCleanupDeleteResult, LskyCleanupReport } from "../types";
import "./LskyCleanupPanel.css";

export interface LskyCleanupPanelProps {
  provider: "lsky" | "cloudimgs";
  onScan: () => Promise<LskyCleanupReport>;
  onDelete: (keys: string[]) => Promise<LskyCleanupDeleteResult>;
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function formatCreatedAt(timestamp: number) {
  if (timestamp <= 0) return "时间未知";
  return new Date(timestamp).toLocaleString("zh-CN", { hour12: false });
}

export function LskyCleanupPanel({ provider, onScan, onDelete }: LskyCleanupPanelProps) {
  const [report, setReport] = useState<LskyCleanupReport | null>(null);
  const [scanning, setScanning] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const isCloudImgs = provider === "cloudimgs";

  const runScan = async () => {
    setScanning(true);
    setConfirming(false);
    setMessage(null);
    try {
      const next = await onScan();
      setReport(next);
      if (next.candidates.length === 0) {
        setMessage("扫描完成，没有发现可清理图片");
      }
    } catch (error) {
      setReport(null);
      setMessage(String(error));
    } finally {
      setScanning(false);
    }
  };

  const confirmDelete = async () => {
    if (!report?.candidates.length) return;
    setDeleting(true);
    setMessage(null);
    try {
      const result = await onDelete(report.candidates.map((image) => image.key));
      const details = [
        isCloudImgs ? `已移入云图回收站 ${result.deleted} 张` : `成功删除 ${result.deleted} 张`,
        result.skipped.length ? `跳过 ${result.skipped.length} 张` : "",
        result.failed.length ? `失败 ${result.failed.length} 张` : "",
      ].filter(Boolean);
      const refreshed = await onScan();
      setReport(refreshed);
      setMessage(details.join("，"));
      setConfirming(false);
    } catch (error) {
      setMessage(String(error));
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="settings-section-stack lsky-cleanup-panel">
      <section className="settings-card">
        <div className="settings-card-head">
          <div>
            <strong>{isCloudImgs ? "云图图片清理" : "图床图片清理"}</strong>
            <span>{isCloudImgs ? "仅比较 MDnote 目录中的图片" : "比较全部笔记与超级管理员的 MDnote 相册"}</span>
          </div>
        </div>

        <p className="lsky-cleanup-hint">
          {isCloudImgs
            ? "回收站中的笔记仍视为有效引用；最近 30 分钟上传或时间未知的图片受保护。图片会移入云图回收站，服务端约 30 天后自动清理。"
            : "回收站中的笔记仍视为有效引用；最近 30 分钟上传的图片受保护。扫描和读取不完整时不会执行删除。"}
        </p>

        <button
          type="button"
          className="mk-save-button lsky-cleanup-scan"
          disabled={scanning || deleting}
          onClick={() => void runScan()}
        >
          <span>{scanning ? "正在扫描…" : isCloudImgs ? "扫描云图" : "扫描图床"}</span>
        </button>

        {report ? (
          <div className="lsky-cleanup-report" aria-live="polite">
            <div className="lsky-cleanup-stats">
              <span>已扫描笔记 <strong>{report.scanned_notes}</strong></span>
              <span>{isCloudImgs ? "目录图片" : "相册图片"} <strong>{report.total_album_images}</strong></span>
              <span>有效引用 <strong>{report.referenced_images}</strong></span>
              <span>保护期内 <strong>{report.protected_images}</strong></span>
            </div>
            <div className="lsky-cleanup-summary">
              <span>待清理</span>
              <strong>{report.candidates.length} 张 · {formatBytes(report.reclaimable_bytes)}</strong>
            </div>

            {report.candidates.length > 0 ? (
              <div className="lsky-cleanup-list" role="list" aria-label="待清理图片">
                {report.candidates.map((image) => (
                  <div key={image.key} className="lsky-cleanup-item" role="listitem">
                    <div>
                      <strong title={image.name}>{image.name}</strong>
                      <span>{formatCreatedAt(image.created_at_ms)}</span>
                    </div>
                    <span>{formatBytes(image.size)}</span>
                  </div>
                ))}
              </div>
            ) : null}

            {report.candidates.length > 0 && !confirming ? (
              <button
                type="button"
                className="lsky-cleanup-delete"
                disabled={deleting}
                onClick={() => setConfirming(true)}
              >
                {isCloudImgs ? "移入云图回收站" : "清理待清理图片"}
              </button>
            ) : null}

            {confirming ? (
              <div
                className="lsky-cleanup-confirm"
                role="alertdialog"
                aria-label={isCloudImgs ? "确认移入云图回收站" : "确认永久删除"}
              >
                <p>
                  {isCloudImgs
                    ? `确认将这 ${report.candidates.length} 张图片移入云图回收站？服务端约 30 天后自动清理。`
                    : `确认永久删除这 ${report.candidates.length} 张图片？此操作无法撤销。`}
                </p>
                <div>
                  <button type="button" disabled={deleting} onClick={() => setConfirming(false)}>取消</button>
                  <button type="button" className="danger" disabled={deleting} onClick={() => void confirmDelete()}>
                    {deleting ? "正在处理…" : isCloudImgs ? "确认移入回收站" : "确认永久删除"}
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        ) : null}

        {message ? <p className="lsky-cleanup-message" role="status">{message}</p> : null}
      </section>
    </div>
  );
}
