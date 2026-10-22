import { useEffect, useState } from "react";
import type { AppConfig, NoteClassificationConfig, NoteFolderSummary } from "../types";
import { libraryService } from "../services/libraryService";
import { noteClassificationService } from "../services/noteClassificationService";
import { PasswordInput } from "./PasswordInput";

interface Props {
  config: AppConfig;
  onSave: (settings: NoteClassificationConfig) => Promise<void>;
}

export function NoteClassificationSettingsPanel({ config, onSave }: Props) {
  const [settings, setSettings] = useState<NoteClassificationConfig>(() => config.note_classification ?? {
    enabled: false, provider: "official", official: { model: "jev-latest" },
    commandcode: { model: "typesafe/jev" }, folders: [],
  });
  const [folders, setFolders] = useState<NoteFolderSummary[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => {
    let live = true;
    void libraryService.listFolders().then((list) => { if (live) setFolders(list.filter(f => f.zone.startsWith("folder:"))); })
      .catch(e => { if (live) setMessage(String(e)); });
    return () => { live = false; };
  }, []);
  const connection = settings[settings.provider];
  const setConnection = (patch: Partial<typeof connection>) => setSettings(s => ({ ...s, [s.provider]: { ...s[s.provider], ...patch } }));
  const run = async (test: boolean) => {
    setBusy(true); setMessage("");
    try {
      if (test) await noteClassificationService.test(settings);
      else await onSave(settings);
      setMessage(test ? "连接成功" : "已保存");
    } catch (e) { setMessage(String(e)); }
    finally { setBusy(false); }
  };
  return (
    <div className="settings-embedded-panel jev-settings">
      <div className="siyuan-settings-head">
        <div><strong>Jev 自动归类</strong><span>关闭 Tab 后整理 Default 中的普通笔记，也可手动归类</span></div>
      </div>
      <fieldset disabled={busy} className="jev-settings-fields">
        <div className="settings-toggle-row">
          <span>启用自动归类</span>
          <button type="button" role="switch" aria-label="启用 Jev 自动归类" aria-checked={settings.enabled}
            className={`settings-toggle${settings.enabled ? " active" : ""}`}
            onClick={() => setSettings(s => ({ ...s, enabled: !s.enabled }))}>
            <span className="settings-toggle-thumb" />
          </button>
        </div>
        <label className="siyuan-settings-field">
          <span>模型来源</span>
          <select value={settings.provider} onChange={e => setSettings(s => ({ ...s, provider: e.target.value as NoteClassificationConfig["provider"] }))}>
            <option value="official">Jev 官方</option><option value="commandcode">Command Code</option>
          </select>
        </label>
        <PasswordInput label="API Key" value={connection.api_token ?? ""} autoComplete="off"
          onChange={e => setConnection({ api_token: e.target.value })} placeholder="当前来源的 API Key" />
        <label className="siyuan-settings-field">
          <span>模型</span>
          <input value={connection.model ?? ""} spellCheck={false}
            placeholder={settings.provider === "official" ? "jev-latest" : "typesafe/jev"}
            onChange={e => setConnection({ model: e.target.value })} />
        </label>
        <div className="jev-candidates-head"><strong>候选文件夹</strong><span>{settings.folders.length} 个已选</span></div>
        <p className="siyuan-settings-hint">选择已有文件夹，可补充用途说明。归类时将正文与候选说明发送到当前来源。</p>
        {folders.length === 0 && <p className="siyuan-settings-hint">请先在资料库创建文件夹。</p>}
        <div className="jev-folder-list">
          {folders.map(folder => {
            const choice = settings.folders.find(f => f.zone === folder.zone);
            return (
              <div className={`jev-folder-card${choice ? " selected" : ""}`} key={folder.zone}>
                <div className="settings-toggle-row">
                  <span>{folder.title}</span>
                  <button type="button" role="switch" aria-label={`将${folder.title}作为归类候选`} aria-checked={Boolean(choice)}
                    className={`settings-toggle${choice ? " active" : ""}`}
                    onClick={() => setSettings(s => ({ ...s, folders: choice ? s.folders.filter(f => f.zone !== folder.zone) : [...s.folders, { zone: folder.zone, description: "" }] }))}>
                    <span className="settings-toggle-thumb" />
                  </button>
                </div>
                {choice && (
                  <label className="siyuan-settings-field">
                    <span>用途说明</span>
                    <input aria-label={`${folder.title}的用途说明`} value={choice.description} placeholder="例如：开发教程、技术参考（可选）"
                      onChange={e => setSettings(s => ({ ...s, folders: s.folders.map(f => f.zone === folder.zone ? { ...f, description: e.target.value } : f) }))} />
                  </label>
                )}
              </div>
            );
          })}
        </div>
        {settings.folders.some(f => !folders.some(folder => folder.zone === f.zone)) && (
          <div className="siyuan-settings-actions">
            <span className="siyuan-settings-hint">有候选文件夹已不存在</span>
            <button type="button" className="mk-save-button mk-test-button"
              onClick={() => setSettings(s => ({ ...s, folders: s.folders.filter(f => folders.some(folder => folder.zone === f.zone)) }))}>
              <span>移除失效候选</span>
            </button>
          </div>
        )}
        <div className="siyuan-settings-actions">
          <button type="button" className="mk-save-button mk-test-button" disabled={!connection.api_token?.trim()} onClick={() => void run(true)}><span>测试连接</span></button>
          <button type="button" className="mk-save-button" onClick={() => void run(false)}><span>{busy ? "处理中…" : "保存设置"}</span></button>
        </div>
      </fieldset>
      {message && <p role="status" className="siyuan-settings-msg">{message}</p>}
    </div>
  );
}
