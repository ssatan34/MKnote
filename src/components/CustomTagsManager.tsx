import { useEffect, useRef, useState } from "react";
import {
  isValidHexColor,
  normalizeHexInput,
  noteColorLabel,
  type CustomTagDef,
} from "../constants/noteColors";
import { DeleteButton } from "./DeleteButton";

type CustomTagsManagerProps = {
  customTags: readonly CustomTagDef[];
  colorLabels?: Partial<Record<string, string>> | null;
  onAddCustomTag: (name: string, hex: string) => void | Promise<void>;
  onUpdateCustomTag: (
    id: string,
    patch: { name?: string; hex?: string },
  ) => void | Promise<void>;
  onDeleteCustomTag: (id: string) => void | Promise<void>;
};

type EditField = "name" | "hex";

export function CustomTagsManager({
  customTags,
  colorLabels = null,
  onAddCustomTag,
  onUpdateCustomTag,
  onDeleteCustomTag,
}: CustomTagsManagerProps) {
  const [adding, setAdding] = useState(customTags.length === 0);
  const [draftName, setDraftName] = useState("");
  const [draftHex, setDraftHex] = useState("#7C3AED");
  const [addError, setAddError] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [returningDeleteId, setReturningDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ id: string; field: EditField } | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [editError, setEditError] = useState<string | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const editInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!editing) return;
    editInputRef.current?.focus();
    editInputRef.current?.select();
  }, [editing]);

  useEffect(() => {
    if (!deleteConfirmId) return;
    const timer = window.setTimeout(() => {
      setDeleteConfirmId((current) => (current === deleteConfirmId ? null : current));
      setReturningDeleteId(deleteConfirmId);
      window.setTimeout(() => setReturningDeleteId((current) => (current === deleteConfirmId ? null : current)), 320);
    }, 2000);
    return () => window.clearTimeout(timer);
  }, [deleteConfirmId]);

  const submitCustomTag = async () => {
    const name = draftName.trim();
    const hex = normalizeHexInput(draftHex);
    if (!name) {
      setAddError("请输入标签名称");
      return;
    }
    if (!isValidHexColor(hex)) {
      setAddError("颜色代码格式应为 #RGB 或 #RRGGBB");
      return;
    }
    setAddError(null);
    try {
      await onAddCustomTag(name, hex);
      setDraftName("");
      setDraftHex("#7C3AED");
      setAdding(false);
    } catch (e) {
      setAddError(e instanceof Error ? e.message : String(e));
    }
  };

  const startEdit = (tag: CustomTagDef, field: EditField) => {
    setDeleteConfirmId(null);
    setEditError(null);
    setEditing({ id: tag.id, field });
    setEditDraft(field === "name" ? tag.name : tag.hex);
  };

  const cancelEdit = () => {
    setEditing(null);
    setEditDraft("");
    setEditError(null);
  };

  const commitEdit = async () => {
    if (!editing) return;
    const value = editDraft.trim();
    if (!value) {
      setEditError(editing.field === "name" ? "标签名称不能为空" : "颜色代码不能为空");
      return;
    }
    if (editing.field === "hex") {
      const hex = normalizeHexInput(value);
      if (!isValidHexColor(hex)) {
        setEditError("颜色代码格式应为 #RGB 或 #RRGGBB");
        return;
      }
    }
    setEditError(null);
    setSavingEdit(true);
    try {
      await onUpdateCustomTag(
        editing.id,
        editing.field === "name" ? { name: value } : { hex: normalizeHexInput(value) },
      );
      cancelEdit();
    } catch (e) {
      setEditError(e instanceof Error ? e.message : String(e));
    } finally {
      setSavingEdit(false);
    }
  };

  const confirmDelete = async (id: string) => {
    setDeletingId(id);
    try {
      await onDeleteCustomTag(id);
      setDeleteConfirmId(null);
      if (editing?.id === id) cancelEdit();
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="custom-tags-manager">
      {adding ? (
        <div className="custom-tags-add-form">
          <label className="custom-tags-field">
            <span>标签名称</span>
            <input
              type="text"
              maxLength={12}
              placeholder="例如：项目 A"
              value={draftName}
              autoFocus
              onChange={(e) => setDraftName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void submitCustomTag();
                if (e.key === "Escape") {
                  setAdding(false);
                  setAddError(null);
                }
              }}
            />
          </label>
          <label className="custom-tags-field">
            <span>颜色代码</span>
            <div className="custom-tags-hex-row">
              <span
                className="custom-tags-preview"
                style={{
                  backgroundColor: isValidHexColor(normalizeHexInput(draftHex))
                    ? normalizeHexInput(draftHex)
                    : "#7C3AED",
                }}
                aria-hidden
              />
              <input
                type="text"
                maxLength={7}
                placeholder="#RRGGBB"
                value={draftHex}
                onChange={(e) => setDraftHex(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void submitCustomTag();
                  if (e.key === "Escape") {
                    setAdding(false);
                    setAddError(null);
                  }
                }}
              />
            </div>
          </label>
          <div className="custom-tags-add-actions">
            <button
              type="button"
              className="custom-tags-action-button custom-tags-action-button--add"
              onClick={() => void submitCustomTag()}
            >
              <span className="custom-tags-action-button__text">Add</span>
              <span className="custom-tags-action-button__icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" className="custom-tags-action-button__svg">
                  <line y1="5" y2="19" x1="12" x2="12" />
                  <line y1="12" y2="12" x1="5" x2="19" />
                </svg>
              </span>
            </button>
            <button
              type="button"
              className="custom-tags-action-button custom-tags-action-button--cancel"
              onClick={() => {
                setAdding(false);
                setAddError(null);
              }}
            >
              <span className="custom-tags-action-button__text">Cancel</span>
              <span className="custom-tags-action-button__icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" className="custom-tags-action-button__svg">
                  <line y1="6" y2="18" x1="6" x2="18" />
                  <line y1="6" y2="18" x1="18" x2="6" />
                </svg>
              </span>
            </button>
          </div>
          {addError && <p className="custom-tags-add-error">{addError}</p>}
        </div>
      ) : (
        <button type="button" className="custom-tags-add-entry" onClick={() => setAdding(true)}>
          + 添加自定义标签
        </button>
      )}

      {customTags.length > 0 && (
        <ul className="custom-tags-list">
          {customTags.map((tag) => {
            const editingName = editing?.id === tag.id && editing.field === "name";
            const editingHex = editing?.id === tag.id && editing.field === "hex";
            const confirmingDelete = deleteConfirmId === tag.id;

            return (
              <li key={tag.id} className="custom-tags-list-item">
                <span
                  className="custom-tags-swatch"
                  style={{ backgroundColor: tag.hex }}
                  aria-hidden
                />
                {editingName ? (
                  <input
                    ref={editInputRef}
                    type="text"
                    className="custom-tags-inline-input custom-tags-inline-input-name"
                    maxLength={12}
                    value={editDraft}
                    disabled={savingEdit}
                    onChange={(e) => setEditDraft(e.target.value)}
                    onBlur={(e) => {
                      const next = e.relatedTarget as Node | null;
                      if (e.currentTarget.closest(".custom-tags-list-item")?.contains(next)) return;
                      void commitEdit();
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") void commitEdit();
                      if (e.key === "Escape") cancelEdit();
                    }}
                  />
                ) : (
                  <span
                    className="custom-tags-name custom-tags-editable"
                    title={`${noteColorLabel(tag.id, colorLabels, customTags)}（双击编辑）`}
                    onDoubleClick={(e) => {
                      e.stopPropagation();
                      startEdit(tag, "name");
                    }}
                  >
                    {noteColorLabel(tag.id, colorLabels, customTags)}
                  </span>
                )}
                {editingHex ? (
                  <input
                    ref={editInputRef}
                    type="text"
                    className="custom-tags-inline-input custom-tags-inline-input-hex"
                    maxLength={7}
                    value={editDraft}
                    disabled={savingEdit}
                    onChange={(e) => setEditDraft(e.target.value)}
                    onBlur={(e) => {
                      const next = e.relatedTarget as Node | null;
                      if (e.currentTarget.closest(".custom-tags-list-item")?.contains(next)) return;
                      void commitEdit();
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") void commitEdit();
                      if (e.key === "Escape") cancelEdit();
                    }}
                  />
                ) : (
                  <span
                    className="custom-tags-hex custom-tags-editable"
                    title={`${tag.hex}（双击编辑）`}
                    onDoubleClick={(e) => {
                      e.stopPropagation();
                      startEdit(tag, "hex");
                    }}
                  >
                    {tag.hex}
                  </span>
                )}
                {confirmingDelete ? (
                  <div className="custom-tags-delete-confirm">
                    <button
                      type="button"
                      className="custom-tags-delete-confirm-danger"
                      disabled={deletingId === tag.id}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => void confirmDelete(tag.id)}
                    >
                      确认
                    </button>
                    <button
                      type="button"
                      className="custom-tags-delete-confirm-cancel"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => setDeleteConfirmId(null)}
                    >
                      取消
                    </button>
                  </div>
                ) : (
                  <DeleteButton
                    className={`custom-tags-delete-btn${returningDeleteId === tag.id ? " delete-button--returning" : ""}`}
                    title="删除标签"
                    disabled={deletingId === tag.id}
                    onClick={() => {
                      cancelEdit();
                      setDeleteConfirmId(tag.id);
                    }}
                    iconSize={12}
                  />
                )}
                {editError && editing?.id === tag.id && (
                  <span className="custom-tags-edit-error">{editError}</span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
