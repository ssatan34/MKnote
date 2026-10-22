import { useEffect, useRef, useState } from "react";
import { quickPocketService } from "../services/quickPocketService";
import { isLatestQuickPocketRequest } from "../utils/quickPocketModel";
import { DEFAULT_QUICK_POCKET_ID, isValidQuickPocketName, MAX_QUICK_POCKET_NAME_LENGTH, type QuickPocketDefinition } from "../utils/quickPocketRegistry";
import { CopyFeedbackIcon } from "./CopyFeedbackIcon";
import { DeleteButton } from "./DeleteButton";
import { QuickDataDirectorySetting } from "./QuickDataDirectorySetting";
import "./QuickPocketSettingsPanel.css";

function errorMessage(error: unknown): string { return error instanceof Error ? error.message : String(error); }

export function QuickPocketSettingsPanel() {
  const [pockets, setPockets] = useState<QuickPocketDefinition[]>([]);
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [copiedPocketId, setCopiedPocketId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestVersionRef = useRef(0);

  const reload = async () => {
    const requestVersion = ++requestVersionRef.current;
    setLoading(true);
    try {
      const next = await quickPocketService.listPockets();
      if (!isLatestQuickPocketRequest(requestVersion, requestVersionRef.current)) return;
      setPockets(next); setError(null);
    } catch (loadError) {
      if (!isLatestQuickPocketRequest(requestVersion, requestVersionRef.current)) return;
      setError(errorMessage(loadError));
    } finally {
      if (isLatestQuickPocketRequest(requestVersion, requestVersionRef.current)) setLoading(false);
    }
  };

  useEffect(() => { void reload(); }, []);

  const createPocket = async () => {
    if (!isValidQuickPocketName(newName)) { setError(`Pocket 名称不能为空且不能超过 ${MAX_QUICK_POCKET_NAME_LENGTH} 个字符`); return; }
    const requestVersion = ++requestVersionRef.current;
    try {
      const pocket = await quickPocketService.createPocket(newName.trim());
      if (!isLatestQuickPocketRequest(requestVersion, requestVersionRef.current)) return;
      setPockets((current) => [...current, pocket]); setNewName(""); setError(null);
    }
    catch (createError) { if (isLatestQuickPocketRequest(requestVersion, requestVersionRef.current)) setError(errorMessage(createError)); }
  };

  const saveRename = async (pocket: QuickPocketDefinition) => {
    if (!isValidQuickPocketName(editingName)) { setError(`Pocket 名称不能为空且不能超过 ${MAX_QUICK_POCKET_NAME_LENGTH} 个字符`); return; }
    const requestVersion = ++requestVersionRef.current;
    try {
      const updated = await quickPocketService.renamePocket(pocket.id, editingName.trim());
      if (!isLatestQuickPocketRequest(requestVersion, requestVersionRef.current)) return;
      setPockets((current) => current.map((item) => item.id === updated.id ? updated : item)); setEditingId(null); setError(null);
    }
    catch (renameError) { if (isLatestQuickPocketRequest(requestVersion, requestVersionRef.current)) setError(errorMessage(renameError)); }
  };

  const startRename = (pocket: QuickPocketDefinition) => {
    setEditingId(pocket.id);
    setEditingName(pocket.name);
    setDeleteId(null);
    setError(null);
  };

  const deletePocket = async (pocketId: string) => {
    const requestVersion = ++requestVersionRef.current;
    try {
      const next = await quickPocketService.deletePocket(pocketId);
      if (!isLatestQuickPocketRequest(requestVersion, requestVersionRef.current)) return;
      setPockets(next); setDeleteId(null); setError(null);
    }
    catch (deleteError) { if (isLatestQuickPocketRequest(requestVersion, requestVersionRef.current)) setError(errorMessage(deleteError)); }
  };

  const copyPocketId = async (pocketId: string) => {
    try {
      await navigator.clipboard.writeText(pocketId);
      setCopiedPocketId(pocketId);
      window.setTimeout(() => setCopiedPocketId((current) => current === pocketId ? null : current), 1500);
    } catch {
      setCopiedPocketId(null);
    }
  };

  return <div className="settings-section-stack quick-pocket-manager">
    <QuickDataDirectorySetting kind="pocket" />
    <section className="settings-card">
      <div className="settings-card-head"><div><strong>Quick Pocket</strong><span>管理独立的 Pocket 及其 Markdown 数据</span></div></div>
      <div className="quick-pocket-manager-create">
        <div className="quick-pocket-manager-input-wrap">
          <input value={newName} maxLength={6} placeholder="新 Pocket 名称" aria-label="新 Pocket 名称" onChange={(event) => setNewName(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void createPocket(); } }} />
          <span className="quick-pocket-manager-count" aria-hidden="true">{Array.from(newName).length}/{MAX_QUICK_POCKET_NAME_LENGTH}</span>
        </div>
        <button type="button" className="mk-save-button" onClick={() => void createPocket()}><span>Save</span></button>
      </div>
      {error && <p className="quick-pocket-manager-error">{error}</p>}
      {loading ? <p className="quick-pocket-manager-muted">加载中…</p> : <div className="quick-pocket-manager-list">
        {pockets.map((pocket) => {
          const isDefault = pocket.id === DEFAULT_QUICK_POCKET_ID;
          const editing = editingId === pocket.id;
          return <div className={`quick-pocket-manager-row${isDefault ? " is-default" : ""}`} key={pocket.id}>
            {editing ? <input autoFocus value={editingName} maxLength={6} aria-label={`${pocket.name} 新名称`} onChange={(event) => setEditingName(event.target.value)} onBlur={() => setEditingId(null)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void saveRename(pocket); } if (event.key === "Escape") setEditingId(null); }} /> : <div className="quick-pocket-manager-name" onDoubleClick={() => { if (!isDefault) startRename(pocket); }} title={isDefault ? pocket.name : `${pocket.name}（双击重命名）`}><strong>{pocket.name}</strong><span>{pocket.id}</span></div>}
            {isDefault ? <span className="quick-pocket-manager-badge">默认</span> : editing ? <div className="quick-pocket-manager-actions"><button type="button" className="mk-save-button" onMouseDown={(event) => event.preventDefault()} onClick={() => void saveRename(pocket)}><span>Save</span></button></div> : <div className="quick-pocket-manager-actions"><button type="button" className="quick-pocket-manager-copy" title={copiedPocketId === pocket.id ? "已复制 Pocket ID" : "复制 Pocket ID"} aria-label={copiedPocketId === pocket.id ? "已复制 Pocket ID" : "复制 Pocket ID"} onClick={() => void copyPocketId(pocket.id)}><CopyFeedbackIcon copied={copiedPocketId === pocket.id} size={16} /></button>{deleteId === pocket.id ? <><DeleteButton iconSize={12} title="确认删除 Pocket" aria-label="确认删除 Pocket" onClick={() => void deletePocket(pocket.id)} /><button type="button" onClick={() => setDeleteId(null)}>取消</button></> : <DeleteButton iconSize={12} title="删除 Pocket" aria-label="删除 Pocket" onClick={() => { setEditingId(null); setDeleteId(pocket.id); }} />}</div>}
          </div>;
        })}
      </div>}
      <p className="quick-pocket-manager-note">默认 Pocket 使用现有 Quick Pocket.md，不能重命名或删除。新 Pocket 名称最多 6 个字符。</p>
    </section>
  </div>;
}
