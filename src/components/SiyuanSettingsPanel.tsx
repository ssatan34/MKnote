import { useCallback, useEffect, useRef, useState } from "react";
import { CloseButton } from "./CloseButton";
import { PasswordInput } from "./PasswordInput";
import type { AppConfig, SiyuanNotebookSummary } from "../types";

export interface SiyuanSettingsPanelProps {
  config: AppConfig;
  onSave: (patch: { apiUrl: string; apiToken: string; notebookId: string }) => Promise<void>;
  onTestConnection: (apiUrl: string, apiToken: string) => Promise<SiyuanNotebookSummary[]>;
  onClose?: () => void;
  embedded?: boolean;
}

export function SiyuanSettingsPanel({
  config,
  onSave,
  onTestConnection,
  onClose,
  embedded = false,
}: SiyuanSettingsPanelProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const notebookMenuRef = useRef<HTMLDivElement>(null);
  const [apiUrl, setApiUrl] = useState(config.siyuan_api_url ?? "http://127.0.0.1:6806");
  const [apiToken, setApiToken] = useState(config.siyuan_api_token ?? "");
  const [notebookId, setNotebookId] = useState(config.siyuan_notebook_id ?? "");
  const [notebooks, setNotebooks] = useState<SiyuanNotebookSummary[]>([]);
  const [testMsg, setTestMsg] = useState<string | null>(null);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loadingNotebooks, setLoadingNotebooks] = useState(false);
  const [notebookMenuOpen, setNotebookMenuOpen] = useState(false);

  const loadNotebooks = useCallback(
    async (url: string, token: string) => {
      const list = await onTestConnection(url.trim(), token.trim());
      setNotebooks(list);
      return list;
    },
    [onTestConnection],
  );

  useEffect(() => {
    if (!embedded) rootRef.current?.focus();
    const url = (config.siyuan_api_url ?? "").trim();
    const token = (config.siyuan_api_token ?? "").trim();
    if (!url || !token) return;
    let cancelled = false;
    setLoadingNotebooks(true);
    void onTestConnection(url, token)
      .then((list) => {
        if (!cancelled) setNotebooks(list);
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setLoadingNotebooks(false);
      });
    return () => {
      cancelled = true;
    };
  }, [config.siyuan_api_url, config.siyuan_api_token, onTestConnection, embedded]);

  useEffect(() => {
    setNotebookId(config.siyuan_notebook_id ?? "");
  }, [config.siyuan_notebook_id]);

  useEffect(() => {
    if (!notebookMenuOpen) return;
    const handlePointerDown = (event: PointerEvent) => {
      if (!notebookMenuRef.current?.contains(event.target as Node)) {
        setNotebookMenuOpen(false);
      }
    };
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [notebookMenuOpen]);

  const runTest = async () => {
    setTestMsg(null);
    setSaveMsg(null);
    setTesting(true);
    try {
      const list = await loadNotebooks(apiUrl, apiToken);
      setTestMsg(`已连接，找到 ${list.length} 个笔记本`);
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
        apiUrl: apiUrl.trim(),
        apiToken: apiToken.trim(),
        notebookId,
      });
      setSaveMsg("已保存");
    } catch (e) {
      setSaveMsg(String(e));
    } finally {
      setSaving(false);
    }
  };

  const savedNotebook = notebooks.find((nb) => nb.id === notebookId);
  const showSavedPlaceholder = Boolean(notebookId && !savedNotebook);
  const selectedNotebookLabel = savedNotebook?.name
    ?? (notebookId
      ? (loadingNotebooks ? "已保存的笔记本（加载中…）" : "已保存的笔记本")
      : (loadingNotebooks ? "正在加载笔记本…" : "请选择…"));
  const notebookOptions = [
    { id: "", label: loadingNotebooks ? "正在加载笔记本…" : "请选择…" },
    ...(showSavedPlaceholder
      ? [{ id: notebookId, label: loadingNotebooks ? "已保存的笔记本（加载中…）" : "已保存的笔记本" }]
      : []),
    ...notebooks.map((notebook) => ({
      id: notebook.id,
      label: notebook.name + (notebook.closed ? "（已关闭）" : ""),
    })),
  ];

  return (
    <div
      ref={rootRef}
      className={embedded ? "settings-embedded-panel" : "siyuan-settings-popover"}
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
          <strong>思源笔记</strong>
          <span>上传当前便签到 /MKnote/（便签标题）</span>
        </div>
        {!embedded && onClose ? (
          <CloseButton title="关闭" aria-label="关闭" onClick={onClose} />
        ) : null}
      </div>

      <p className="siyuan-settings-hint">
        在思源「设置 → 关于」复制 API Token。远程地址请填完整根 URL（若反代带路径，需包含该路径）。
      </p>

      <label className="siyuan-settings-field">
        <span>API 地址</span>
        <input
          type="url"
          value={apiUrl}
          placeholder="http://127.0.0.1:6806"
          onChange={(e) => setApiUrl(e.target.value)}
        />
      </label>

      <PasswordInput
        label="API Token"
        value={apiToken}
        autoComplete="off"
        placeholder="Token …"
        onChange={(e) => setApiToken(e.target.value)}
      />

      <div className="siyuan-settings-actions">
        <button
          type="button"
          className="siyuan-settings-test-btn mk-save-button mk-test-button"
          disabled={testing || !apiToken.trim()}
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

      <label className="siyuan-settings-field">
        <span>目标笔记本</span>
        <div ref={notebookMenuRef} className="siyuan-notebook-select">
          <button
            type="button"
            className="siyuan-notebook-select-trigger"
            disabled={loadingNotebooks && notebooks.length === 0}
            aria-haspopup="listbox"
            aria-expanded={notebookMenuOpen}
            onClick={() => setNotebookMenuOpen((open) => !open)}
          >
            <span className="siyuan-notebook-select-value">{selectedNotebookLabel}</span>
            <span className="siyuan-notebook-select-chevron" aria-hidden="true" />
          </button>
          {notebookMenuOpen ? (
            <div className="siyuan-notebook-select-menu" role="listbox" aria-label="目标笔记本">
              {notebookOptions.map((option) => (
                <button
                  key={option.id || "empty"}
                  type="button"
                  className={"siyuan-notebook-select-option" + (option.id === notebookId ? " selected" : "")}
                  role="option"
                  aria-selected={option.id === notebookId}
                  onClick={() => {
                    setNotebookId(option.id);
                    setNotebookMenuOpen(false);
                  }}
                >
                  {option.label}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </label>
    </div>
  );
}
