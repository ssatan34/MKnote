import { useEffect, useRef, useState } from "react";
import { CloseButton } from "./CloseButton";
import { PasswordInput } from "./PasswordInput";
import type { AiConfig, AppConfig } from "../types";
import { testAiConnection } from "../utils/aiApi";

interface AiConfigPanelProps {
  config: AppConfig;
  onSave: (patch: AiConfig) => void | Promise<void>;
  onClose?: () => void;
  embedded?: boolean;
}

export function AiConfigPanel({ config, onSave, onClose, embedded = false }: AiConfigPanelProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const ai = config.ai_config ?? {};
  const [apiUrl, setApiUrl] = useState(ai.api_url ?? "");
  const [apiToken, setApiToken] = useState(ai.api_token ?? "");
  const [model, setModel] = useState(ai.model ?? "");
  const [models, setModels] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testMsg, setTestMsg] = useState<string | null>(null);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);

  useEffect(() => {
    rootRef.current?.focus({ preventScroll: true });
  }, []);

  const runTest = async () => {
    const url = apiUrl.trim();
    const token = apiToken.trim();
    if (!url || !token) {
      setTestMsg("请先填写 API 地址与 Token");
      return;
    }
    setTesting(true);
    setTestMsg(null);
    setSaveMsg(null);
    try {
      const result = await testAiConnection({
        apiUrl: url,
        apiToken: token,
        model,
      });
      setModels(result.models);
      setTestMsg(`已连接，对话接口可用（模型：${result.model}）`);
      if (!model.trim()) setModel(result.model);
    } catch (e) {
      setModels([]);
      setTestMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setTesting(false);
    }
  };

  const submit = async () => {
    setSaveMsg(null);
    setSaving(true);
    try {
      await onSave({
        api_url: apiUrl.trim() || null,
        api_token: apiToken.trim() || null,
        model: model.trim() || null,
      });
      setSaveMsg("已保存");
      onClose?.();
    } catch (e) {
      setSaveMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

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
          <strong>AI 助手配置</strong>
          <span>选中文本后使用润色、摘要、翻译与续写</span>
        </div>
        {!embedded && onClose ? (
          <CloseButton title="关闭" aria-label="关闭" onClick={onClose} />
        ) : null}
      </div>

      <p className="siyuan-settings-hint">
        填写 OpenAI 兼容 API 地址与 Token，保存后在编辑器中选中文本并点击工具栏 AI 按钮。
      </p>

      <label className="siyuan-settings-field">
        <span>API 地址</span>
        <input
          type="url"
          value={apiUrl}
          placeholder="https://api.openai.com/v1"
          onChange={(e) => setApiUrl(e.target.value)}
          spellCheck={false}
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
          disabled={testing || !apiUrl.trim() || !apiToken.trim()}
          onClick={() => void runTest()}
        >
          <span>{testing ? "Testing…" : "Test"}</span>
        </button>
        <button
          type="button"
          className="siyuan-settings-save-btn mk-save-button"
          disabled={saving}
          onClick={() => void submit()}
        >
          <span>Save</span>
        </button>
      </div>

      {testMsg ? <p className="siyuan-settings-msg">{testMsg}</p> : null}
      {saveMsg ? <p className="siyuan-settings-msg siyuan-settings-msg--save">{saveMsg}</p> : null}

      <label className="siyuan-settings-field">
        <span>模型</span>
        {models.length > 0 ? (
          <select value={model} onChange={(e) => setModel(e.target.value)}>
            <option value="">请选择…</option>
            {models.map((id) => (
              <option key={id} value={id}>
                {id}
              </option>
            ))}
          </select>
        ) : (
          <input
            value={model}
            onChange={(e) => setModel(e.target.value)}
            placeholder="gpt-4o-mini"
            spellCheck={false}
          />
        )}
      </label>
    </div>
  );
}
