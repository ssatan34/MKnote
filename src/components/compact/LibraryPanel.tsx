import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type {
  AppConfig,
  CustomTagDef,
  NoteColorSummary,
  NoteFolderSummary,
  NoteSummary,
  NoteZone,
  SiyuanSyncedNoteRef,
} from "../../types";
import { noteColorLabel, noteColorTooltip } from "../../constants/noteColors";
import { sanitizeFilenameInput, validateFilenameTitle } from "../../utils/filenameValidation";
import { isFolderSelectionActive } from "../../utils/librarySelection";
import { filterLibraryNotes } from "../../utils/libraryVisibility";
import { ColorTagPicker, ColorTagSwatch } from "../ColorTagPicker";
import { Icon } from "../Icon";
import { DeleteButton } from "../DeleteButton";

interface LibraryPanelProps {
  motionState?: "open" | "closing";
  config: AppConfig;
  inboxNotes: NoteSummary[];
  folders: NoteFolderSummary[];
  noteColors: NoteColorSummary[];
  libraryNotes: NoteSummary[];
  libraryZone: NoteZone;
  activeColor: string | null;
  activeNote: string;
  activeZone: NoteZone;
  customTags?: CustomTagDef[];
  onAddCustomTag?: (name: string, hex: string) => void | Promise<void>;
  siyuanSyncedNotes?: SiyuanSyncedNoteRef[];
  onOpenNote: (zone: NoteZone, name: string) => void;
  onOpenNoteInMain: (zone: NoteZone, name: string) => void;
  onOpenNoteAsSticky: (zone: NoteZone, name: string) => void;
  onCreateNote: (zone: NoteZone) => void;
  onLibraryZoneChange: (zone: NoteZone) => void;
  onOpenLibraryFolder: () => void;
  onColorSelect: (color: string | null) => void;
  onMoveNote: (name: string, from: NoteZone, to: NoteZone) => void;
  onRenameNote: (zone: NoteZone, oldName: string, newTitle: string) => void;
  onDeleteNote: (zone: NoteZone, name: string) => void;
  onSetNoteColor: (zone: NoteZone, name: string, color: string | null) => void;
  onCreateFolder: (title: string) => void;
  onRenameFolder: (oldId: string, newTitle: string) => void;
}

function zoneLabel(zone: string, folders: NoteFolderSummary[]): string {
  if (zone === "default") return "Default";
  if (zone === "inbox") return "Inbox";
  if (zone === "archive") return "Archive";
  return folders.find((folder) => folder.zone === zone)?.title ?? zone;
}

function RenameDialog({
  initialValue,
  x,
  y,
  onSubmit,
  onCancel,
}: {
  initialValue: string;
  x: number;
  y: number;
  onSubmit: (value: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(initialValue);
  const dialogWidth = Math.min(420, Math.max(240, window.innerWidth - 32));
  const left = Math.max(16, Math.min(x - 18, window.innerWidth - dialogWidth - 16));
  const top = Math.max(12, Math.min(y - 28, window.innerHeight - 56));

  const submit = () => {
    const next = sanitizeFilenameInput(value.trim());
    if (!next) return;
    const err = validateFilenameTitle(next);
    if (err) return;
    onSubmit(next);
  };

  return (
    <div className="rename-backdrop" role="presentation" onClick={onCancel}>
      <div
        className="rename-dialog"
        role="dialog"
        aria-modal="true"
        style={{ left: `${left}px`, top: `${top}px` }}
        onClick={(e) => e.stopPropagation()}
      >
        <input
          value={value}
          autoFocus
          onBlur={onCancel}
          onFocus={(e) => e.currentTarget.select()}
          onChange={(e) => setValue(sanitizeFilenameInput(e.target.value))}
          onKeyDown={(e) => {
            if (e.key === "Enter") submit();
            if (e.key === "Escape") onCancel();
          }}
        />
      </div>
    </div>
  );
}

function CreateFolderDialog({
  anchor,
  onSubmit,
  onCancel,
}: {
  anchor: { left: number; top: number };
  onSubmit: (value: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState("");

  const submit = () => {
    const next = sanitizeFilenameInput(value.trim());
    if (!next || validateFilenameTitle(next)) return;
    onSubmit(next);
  };

  return createPortal(
    <div
      className="create-folder-backdrop"
      data-library-surface="true"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div
        className="create-folder-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="新建文件夹"
        style={{ left: `${anchor.left}px`, top: `${anchor.top}px` }}
      >
        <div className="input">
          <input
            className="to-do-input"
            autoFocus
            placeholder="文件夹名称..."
            name="folder-name"
            type="text"
            value={value}
            onChange={(e) => setValue(sanitizeFilenameInput(e.target.value))}
            onBlur={onCancel}
            onKeyDown={(e) => {
              if (e.key === "Enter") submit();
              if (e.key === "Escape") onCancel();
            }}
          />
          <div className="todo-line">&nbsp;</div>
        </div>
        <button
          type="button"
          className="input button"
          onPointerDown={(e) => e.preventDefault()}
          onClick={submit}
        >
          Add
        </button>
      </div>
    </div>,
    document.body,
  );
}

export function LibraryPanel({
  motionState = "open",
  config,
  inboxNotes,
  folders,
  noteColors,
  libraryNotes,
  libraryZone,
  activeColor,
  activeNote,
  activeZone,
  customTags = [],
  onAddCustomTag,
  siyuanSyncedNotes = [],
  onOpenNote,
  onOpenNoteInMain,
  onOpenNoteAsSticky,
  onCreateNote,
  onLibraryZoneChange,
  onOpenLibraryFolder,
  onColorSelect,
  onMoveNote,
  onRenameNote,
  onDeleteNote,
  onSetNoteColor,
  onCreateFolder,
  onRenameFolder,
}: LibraryPanelProps) {
  const [dragging, setDragging] = useState<{ name: string; zone: NoteZone } | null>(null);
  const [dropZone, setDropZone] = useState<NoteZone | null>(null);
  const didDragRef = useRef(false);
  const [noteColorMenu, setNoteColorMenu] = useState<string | null>(null);
  const [renameDialog, setRenameDialog] = useState<{
    value: string;
    x: number;
    y: number;
    onSubmit: (value: string) => void;
  } | null>(null);
  const [createFolderDialogAnchor, setCreateFolderDialogAnchor] = useState<{
    left: number;
    top: number;
  } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [returningDeleteTarget, setReturningDeleteTarget] = useState<string | null>(null);

  useEffect(() => {
    if (!deleteTarget) return;
    const timer = window.setTimeout(() => {
      setDeleteTarget((current) => (current === deleteTarget ? null : current));
      setReturningDeleteTarget(deleteTarget);
      window.setTimeout(() => setReturningDeleteTarget((current) => (current === deleteTarget ? null : current)), 320);
    }, 2000);
    return () => window.clearTimeout(timer);
  }, [deleteTarget]);

  const noteActionKey = (note: NoteSummary) => `${note.zone}:${note.name}`;
  const colorCounts = new Map(noteColors.map((item) => [item.color, item.note_count]));
  const totalTagged = [...colorCounts.values()].reduce((a, b) => a + b, 0);
  const colorFilterLabel = activeColor
    ? noteColorLabel(activeColor, config.note_color_labels, customTags)
    : null;
  const showFolderSelection = isFolderSelectionActive(activeColor);
  const siyuanSyncedKeys = new Set(
    siyuanSyncedNotes.map((item) => `${item.zone}:${item.name}`),
  );
  const visibleLibraryNotes = filterLibraryNotes(libraryNotes);

  const openRenameDialog = (
    value: string,
    point: { x: number; y: number },
    onSubmit: (value: string) => void,
  ) => {
    setRenameDialog({ value, x: point.x, y: point.y, onSubmit });
  };

  const zoneFromPoint = (x: number, y: number): NoteZone | null => {
    const el = document.elementFromPoint(x, y)?.closest("[data-drop-zone]");
    if (!el) return null;
    const zone = el.getAttribute("data-drop-zone");
    return zone ? (zone as NoteZone) : null;
  };

  useEffect(() => {
    if (!dragging) return;
    const payload = dragging;
    const onPointerMove = (e: PointerEvent) => {
      setDropZone(zoneFromPoint(e.clientX, e.clientY));
    };
    const onPointerUp = (e: PointerEvent) => {
      const target = zoneFromPoint(e.clientX, e.clientY);
      if (target && target !== payload.zone) {
        didDragRef.current = true;
        onMoveNote(payload.name, payload.zone, target);
      }
      setDragging(null);
      setDropZone(null);
    };
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    };
  }, [dragging, onMoveNote]);

  return (
    <aside
      className={`compact-library compact-library--${motionState}`}
      data-library-surface="true"
    >
      <div className="library-folders">
        <div
          className="library-section-title"
        >
          <button
            type="button"
            className="library-folder-title-button"
            title="双击打开当前文件夹"
            aria-label="文件夹，双击打开当前文件夹"
            onDoubleClick={onOpenLibraryFolder}
          >
            文件夹
          </button>
          <button
            type="button"
            className="new-folder-button"
            title="新建文件夹"
            onClick={(e) => {
              const iconRect = e.currentTarget.querySelector(".mk-icon")?.getBoundingClientRect();
              const rect = iconRect ?? e.currentTarget.getBoundingClientRect();
              setCreateFolderDialogAnchor({
                left: rect.right + 8,
                top: rect.top + rect.height / 2,
              });
            }}
            onDoubleClick={(e) => e.stopPropagation()}
          >
            <Icon name="new_folder" size={16} />
          </button>
        </div>
        <button
          type="button"
          data-drop-zone="inbox"
          className={`library-folder${showFolderSelection && libraryZone === "inbox" ? " active" : ""}${
            dropZone === "inbox" && dragging !== null && dragging.zone !== "inbox" ? " drop-target" : ""
          }`}
          onClick={() => onLibraryZoneChange("inbox")}
        >
          <span>Inbox</span>
          <strong>{inboxNotes.length}</strong>
        </button>
        {folders.map((folder) => (
          <div
            key={folder.zone}
            data-drop-zone={folder.zone}
            className={`library-folder-row${showFolderSelection && libraryZone === folder.zone ? " active" : ""}${
              dropZone === folder.zone && dragging !== null && dragging.zone !== folder.zone
                ? " drop-target"
                : ""
            }`}
          >
            <button
              type="button"
              className="library-folder"
              onClick={() => onLibraryZoneChange(folder.zone)}
              onDoubleClick={(e) => {
                if (folder.zone === "default") return;
                openRenameDialog(folder.title, { x: e.clientX, y: e.clientY }, (title) => {
                  if (title && title !== folder.title) onRenameFolder(folder.id, title);
                });
              }}
            >
              <span>{folder.title}</span>
              <strong>{folder.note_count}</strong>
            </button>
          </div>
        ))}
        <section className="library-tags">
          <div className="library-section-title">
            <span>颜色标签</span>
          </div>
          {totalTagged === 0 && (
            <p className="library-tags-hint">点击笔记圆点或顶栏圆点设置标签</p>
          )}
          <div className="library-color-tag-list">
            {noteColors.map((item) => {
              const count = item.note_count;
              const label = noteColorLabel(item.color, config.note_color_labels, customTags);
              return (
                <button
                  key={item.color}
                  type="button"
                  className={`library-tag-row${activeColor === item.color ? " active" : ""}`}
                  aria-label={`${label}，${count} 篇笔记`}
                  title={`${label}（全库 ${count}）`}
                  onClick={() => onColorSelect(activeColor === item.color ? null : item.color)}
                >
                  <ColorTagSwatch
                    color={item.color}
                    customTags={customTags}
                    className="library-tag-swatch"
                  />
                  <em>{label}</em>
                  <strong className="library-tag-count">{count > 0 ? count : ""}</strong>
                </button>
              );
            })}
          </div>
        </section>
      </div>
      <div className="library-files">
        <div className="library-section-title">
          <span>
            {activeColor && colorFilterLabel
              ? `${colorFilterLabel} · 全库`
              : libraryZone === "inbox"
                ? "Inbox"
                : folders.find((folder) => folder.zone === libraryZone)?.title ?? "Files"}
          </span>
          <strong>{visibleLibraryNotes.length}</strong>
          <button type="button" title="新建笔记" onClick={() => onCreateNote(libraryZone)}>
            <Icon name="new_note_in_folder" size={16} />
          </button>
        </div>
        {visibleLibraryNotes.map((note) => (
          <div
            key={`${note.zone}:${note.name}`}
            className={`library-note-card${
              activeZone === note.zone && activeNote === note.name ? " active" : ""
            }${dragging?.name === note.name && dragging.zone === note.zone ? " dragging" : ""}`}
            onClick={() => {
              if (didDragRef.current) {
                didDragRef.current = false;
                return;
              }
              onOpenNote(note.zone, note.name);
            }}
            onDoubleClick={(e) => {
              openRenameDialog(note.title, { x: e.clientX, y: e.clientY }, (title) => {
                if (title && title !== note.title) onRenameNote(note.zone, note.name, title);
              });
            }}
          >
            <div className="library-note-title">
              <span
                className="library-note-drag-handle"
                title="拖到左侧文件夹"
                onPointerDown={(e) => {
                  if (e.button !== 0) return;
                  e.stopPropagation();
                  e.preventDefault();
                  setDragging({ name: note.name, zone: note.zone });
                }}
                onClick={(e) => e.stopPropagation()}
              >
                ⠿
              </span>
              <button
                type="button"
                className="note-color-left-btn"
                title={noteColorTooltip(note.color, config.note_color_labels, customTags)}
                onClick={(e) => {
                  e.stopPropagation();
                  setNoteColorMenu(noteColorMenu === noteActionKey(note) ? null : noteActionKey(note));
                }}
              >
                <ColorTagSwatch color={note.color} customTags={customTags} className="note-color-mark" />
              </button>
              {noteColorMenu === noteActionKey(note) && (
                <div
                  className="note-color-menu note-color-menu-left"
                  onClick={(e) => e.stopPropagation()}
                >
                  <ColorTagPicker
                    value={note.color}
                    colorLabels={config.note_color_labels}
                    customTags={customTags}
                    onAddCustomTag={onAddCustomTag}
                    onChange={(color) => {
                      onSetNoteColor(note.zone, note.name, color);
                      setNoteColorMenu(null);
                    }}
                  />
                </div>
              )}
              <span className="library-note-text">
                <strong title={note.title}>
                  {note.title}
                  {siyuanSyncedKeys.has(`${note.zone}:${note.name}`) && (
                    <span className="library-note-siyuan-icon" title="已同步至思源">
                      <Icon name="sync_manual" size={12} />
                    </span>
                  )}
                </strong>
                <span className={`library-note-zone${activeColor ? "" : " is-placeholder"}`}>
                  {activeColor ? zoneLabel(note.zone, folders) : "\u00a0"}
                </span>
              </span>
            </div>
            <div className="library-note-actions">
              <button
                type="button"
                className="library-note-open-btn library-note-open-main"
                data-testid="library-note-open-main"
                title="在主界面打开（Lab）"
                aria-label="在主界面打开（Lab）"
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenNoteInMain(note.zone, note.name);
                }}
                onDoubleClick={(e) => e.stopPropagation()}
              >
                <Icon name="open_lab" size={14} />
              </button>
              <button
                type="button"
                className="library-note-open-btn library-note-open-sticky"
                data-testid="library-note-open-sticky"
                title="以便签模式打开"
                aria-label="以便签模式打开"
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenNoteAsSticky(note.zone, note.name);
                }}
                onDoubleClick={(e) => e.stopPropagation()}
              >
              <Icon name="open_sticky" size={14} />
              </button>
              {deleteTarget === noteActionKey(note) ? (
                <>
                  <button
                    type="button"
                    title="取消"
                    onClick={(e) => {
                      e.stopPropagation();
                      setDeleteTarget(null);
                    }}
                  >
                    <Icon name="close" size={14} />
                  </button>
                  <button
                    type="button"
                    title="确认删除"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeleteNote(note.zone, note.name);
                      setDeleteTarget(null);
                    }}
                  >
                    <Icon name="confirm" size={14} />
                  </button>
                </>
              ) : (
                <DeleteButton
                  className={`library-note-delete-btn${returningDeleteTarget === noteActionKey(note) ? " delete-button--returning" : ""}`}
                  title="删除"
                  onClick={(e) => {
                    e.stopPropagation();
                    setDeleteTarget(noteActionKey(note));
                  }}
                  iconSize={12}
                />
              )}
            </div>
          </div>
        ))}
        {visibleLibraryNotes.length === 0 && <p>暂无便签</p>}
      </div>
      {renameDialog && (
        <RenameDialog
          initialValue={renameDialog.value}
          x={renameDialog.x}
          y={renameDialog.y}
          onCancel={() => setRenameDialog(null)}
          onSubmit={(value) => {
            renameDialog.onSubmit(value);
            setRenameDialog(null);
          }}
        />
      )}
      {createFolderDialogAnchor && (
        <CreateFolderDialog
          anchor={createFolderDialogAnchor}
          onCancel={() => setCreateFolderDialogAnchor(null)}
          onSubmit={(value) => {
            onCreateFolder(value);
            setCreateFolderDialogAnchor(null);
          }}
        />
      )}
    </aside>
  );
}
