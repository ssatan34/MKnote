import { useEffect, useState } from "react";
import { appBridge } from "../services/appBridge";
import { configService, type QuickDataDirectorySettings } from "../services/configService";

export function QuickDataDirectorySetting({ kind }: { kind: "todo" | "pocket" }) {
  const name = kind === "todo" ? "Quick Todo" : "Quick Pocket";
  const [settings, setSettings] = useState<QuickDataDirectorySettings | null>(null);
  const [directory, setDirectory] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setSettings(null);
    setError(null);
    void configService.getQuickDataDirectories().then((value) => {
      if (cancelled) return;
      setSettings(value);
      setDirectory((kind === "todo" ? value.todo_dir : value.pocket_dir) ?? "");
    }).catch((error: unknown) => { if (!cancelled) setError(String(error)); });
    return () => { cancelled = true; };
  }, [kind]);

  const chooseDirectory = async () => {
    setBusy(true);
    setError(null);
    try {
      const selected = await appBridge.dialog.open({ directory: true, multiple: false, title: `选择 ${name} 数据目录` });
      if (typeof selected === "string") { setDirectory(selected); setSaved(false); }
    } catch (error) { setError(String(error)); }
    finally { setBusy(false); }
  };

  const save = async () => {
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const value = await configService.setQuickDataDirectory(kind, directory.trim() || null);
      setSettings(value);
      setDirectory((kind === "todo" ? value.todo_dir : value.pocket_dir) ?? "");
      setSaved(true);
    } catch (error) { setError(String(error)); }
    finally { setBusy(false); }
  };

  const activeDirectory = settings && (kind === "todo" ? settings.active_todo_dir : settings.active_pocket_dir);
  const restartRequired = settings && (kind === "todo" ? settings.todo_restart_required : settings.pocket_restart_required);
  return <section className="settings-card">
    <div className="settings-card-head"><div><strong>数据目录</strong><span>{name} 的读取、保存与 S3 同步位置</span></div></div>
    <div className="siyuan-settings-field">
      <label htmlFor={`quick-${kind}-data-dir`}>{name} 数据目录</label>
      <div className="note-upload-directory">
        <input id={`quick-${kind}-data-dir`} disabled={busy || !settings} value={directory} placeholder="留空使用程序默认 inbox 目录" onChange={(event) => { setDirectory(event.target.value); setSaved(false); }} />
        <button type="button" className="note-upload-browse" disabled={busy || !settings} onClick={() => void chooseDirectory()} aria-label={`选择 ${name} 数据目录`}>选择</button>
      </div>
    </div>
    <p className="siyuan-settings-hint">选择已存在的文件夹；Todo 和 Pocket 可以使用同一目录。留空并保存可恢复默认位置。</p>
    <p className="siyuan-settings-hint">默认文件为 {name}.md，其他列表位于 {name}/&lt;ID&gt;.md。修改后重启生效，不会自动移动、复制或删除原文件。</p>
    {activeDirectory && <p className="siyuan-settings-hint" style={{ overflowWrap: "anywhere" }}>当前使用：{activeDirectory}</p>}
    <div className="siyuan-settings-actions"><button type="button" className="mk-save-button" disabled={busy || !settings} onClick={() => void save()}><span>{busy ? "处理中…" : "保存目录"}</span></button></div>
    {error ? <p role="alert" className="siyuan-settings-msg">{error}</p> : (saved || restartRequired) && <p role="status" className="siyuan-settings-msg">{restartRequired ? "目录已保存，请完全退出并重新启动软件后生效。当前仍使用原目录。" : "目录已保存。"}</p>}
  </section>;
}
