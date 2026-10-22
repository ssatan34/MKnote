import { useState } from "react";
import type { AppConfig, SiyuanNotebookSummary } from "../types";
import { effectiveUploadTarget, type NoteUploadConfigPatch, type UploadTarget } from "../utils/noteUpload";
import { appBridge } from "../services/appBridge";
import { SiyuanSettingsPanel } from "./SiyuanSettingsPanel";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "./ui/tabs";

interface Props {
  config: AppConfig;
  onSave: (patch: NoteUploadConfigPatch) => Promise<void>;
  onSiyuanSave: (patch: { apiUrl: string; apiToken: string; notebookId: string }) => Promise<void>;
  onTestConnection: (apiUrl: string, apiToken: string) => Promise<SiyuanNotebookSummary[]>;
}

export function NoteUploadSettingsPanel({ config, onSave, onSiyuanSave, onTestConnection }: Props) {
  const target = effectiveUploadTarget(config);
  const [tab, setTab] = useState(target === "obsidian" ? "obsidian" : "siyuan");
  const [siyuanVisited, setSiyuanVisited] = useState(target !== "obsidian");
  const [noteDir, setNoteDir] = useState(config.obsidian_note_dir ?? "");
  const [attachmentDir, setAttachmentDir] = useState(config.obsidian_attachment_dir ?? "");
  const [conflict, setConflict] = useState(config.obsidian_conflict ?? "rename");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const save = async (nextTarget: UploadTarget) => {
    setBusy(true);
    setMessage(null);
    try {
      await onSave({ target: nextTarget, noteDir, attachmentDir, conflict });
      setMessage("已保存");
    } catch (error) { setMessage(String(error)); }
    finally { setBusy(false); }
  };
  const chooseDirectory = async (kind: "note" | "attachment") => {
    try {
      const selected = await appBridge.dialog.open({ directory: true, multiple: false,
        title: kind === "note" ? "选择 Obsidian 笔记目标文件夹" : "选择 Obsidian 附件存放文件夹" });
      if (typeof selected === "string") {
        if (kind === "note") setNoteDir(selected); else setAttachmentDir(selected);
        setMessage(null);
      }
    } catch (error) { setMessage(String(error)); }
  };
  const enableSwitch = (platform: "siyuan" | "obsidian") => (
    <div className="settings-toggle-row">
      <span>启用{platform === "siyuan" ? "思源笔记" : "Obsidian"}上传</span>
      <button type="button" role="switch" aria-label={`启用${platform === "siyuan" ? "思源笔记" : "Obsidian"}上传`}
        aria-checked={target === platform} disabled={busy}
        className={`settings-toggle${target === platform ? " active" : ""}`}
        onClick={() => void save(target === platform ? "none" : platform)}>
        <span className="settings-toggle-thumb" />
      </button>
    </div>
  );

  return <div className="settings-section-stack note-upload-settings">
    <section className="settings-card">
    <div className="settings-card-head"><div><strong>笔记上传</strong><span>选择上传平台，启用后自动关闭另一项</span></div></div>
    <Tabs value={tab} onValueChange={(value) => { setTab(value); if (value === "siyuan") setSiyuanVisited(true); }}>
      <TabsList className="note-upload-tabs" aria-label="笔记上传平台">
        <TabsTrigger value="siyuan">思源笔记</TabsTrigger>
        <TabsTrigger value="obsidian">Obsidian</TabsTrigger>
      </TabsList>
      {siyuanVisited && <TabsContent value="siyuan" forceMount hidden={tab !== "siyuan"}>
        {enableSwitch("siyuan")}
        <SiyuanSettingsPanel embedded config={config} onSave={onSiyuanSave} onTestConnection={onTestConnection} />
      </TabsContent>}
      <TabsContent value="obsidian">
        {enableSwitch("obsidian")}
        <p className="siyuan-settings-hint">复制当前笔记与本地附件，并调整引用路径。复制后两边独立编辑。</p>
        <div className="siyuan-settings-field">
          <label htmlFor="obsidian-note-dir">笔记目标文件夹</label>
          <div className="note-upload-directory">
            <input id="obsidian-note-dir" value={noteDir} onChange={(event) => setNoteDir(event.target.value)} placeholder="Obsidian 仓库内的笔记文件夹" />
            <button type="button" className="note-upload-browse" aria-label="选择笔记文件夹" disabled={busy} onClick={() => void chooseDirectory("note")}>选择</button>
          </div>
        </div>
        <div className="siyuan-settings-field">
          <label htmlFor="obsidian-attachment-dir">附件存放文件夹</label>
          <div className="note-upload-directory">
            <input id="obsidian-attachment-dir" value={attachmentDir} onChange={(event) => setAttachmentDir(event.target.value)} placeholder="Obsidian 的附件文件夹" />
            <button type="button" className="note-upload-browse" aria-label="选择附件文件夹" disabled={busy} onClick={() => void chooseDirectory("attachment")}>选择</button>
          </div>
        </div>
        <p className="siyuan-settings-hint">两个文件夹需位于同一磁盘，建议均设在 Obsidian 仓库内。</p>
        <fieldset className="note-upload-conflict"><legend>同名笔记处理</legend>
          <label className={conflict === "rename" ? "selected" : ""}><input type="radio" name="obsidian-conflict" aria-label="重命名后复制" checked={conflict === "rename"} onChange={() => setConflict("rename")} /><span><strong>重命名后复制</strong><small>保留原笔记，生成「笔记 (1).md」</small></span></label>
          <label className={conflict === "overwrite" ? "selected" : ""}><input type="radio" name="obsidian-conflict" aria-label="直接覆盖" checked={conflict === "overwrite"} onChange={() => setConflict("overwrite")} /><span><strong>直接覆盖</strong><small>替换目标笔记中的现有内容</small></span></label>
        </fieldset>
        <p className="siyuan-settings-hint">同名附件内容相同则复用，内容不同则重命名。</p>
        <div className="siyuan-settings-actions"><button type="button" className="mk-save-button" disabled={busy} onClick={() => void save(target)}><span>{busy ? "保存中…" : "保存设置"}</span></button></div>
      </TabsContent>
    </Tabs>
    {message && <p role="status" className="siyuan-settings-msg">{message}</p>}
    </section>
  </div>;
}
