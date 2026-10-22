import { useEffect, useState, type RefObject } from "react";
import { IconSync } from "../CompactIcons";
import { Icon } from "../Icon";
import { ConfirmActionPopover } from "./ConfirmActionPopover";
import { DeleteButton } from "../DeleteButton";
import type { UploadTarget } from "../../utils/noteUpload";

interface StatusBarNoteActionsProps {
  anchorRef: RefObject<HTMLSpanElement | null>;
  archiveOpen: boolean;
  isPrivacyNote: boolean;
  classificationEnabled: boolean;
  classificationBusy: boolean;
  onClassifyNote: () => void;
  siyuanUploading: boolean;
  uploadTarget: UploadTarget;
  uploadHint?: string | null;
  activeNote: string | null;
  defaultNoteOpen: boolean;
  onToggleArchive: () => void;
  onClosePopover: () => void;
  onSiyuanUpload: () => void;
  onArchiveNote: () => void;
  onDeleteCurrentNote: () => void;
}

export function StatusBarNoteActions({
  anchorRef,
  archiveOpen,
  isPrivacyNote,
  classificationEnabled,
  classificationBusy,
  onClassifyNote,
  siyuanUploading,
  uploadTarget,
  uploadHint,
  activeNote,
  defaultNoteOpen,
  onToggleArchive,
  onClosePopover,
  onSiyuanUpload,
  onArchiveNote,
  onDeleteCurrentNote,
}: StatusBarNoteActionsProps) {
  const [deleteConfirming, setDeleteConfirming] = useState(false);

  useEffect(() => {
    if (!deleteConfirming) return;
    const timer = window.setTimeout(() => setDeleteConfirming(false), 5000);
    const resetOnWindowBlur = () => setDeleteConfirming(false);
    const resetOnOutsidePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Element) || !target.closest("[data-delete-action]")) {
        setDeleteConfirming(false);
      }
    };
    window.addEventListener("blur", resetOnWindowBlur);
    document.addEventListener("pointerdown", resetOnOutsidePointerDown, true);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("blur", resetOnWindowBlur);
      document.removeEventListener("pointerdown", resetOnOutsidePointerDown, true);
    };
  }, [deleteConfirming]);

  const handleDeleteClick = () => {
    if (deleteConfirming) {
      setDeleteConfirming(false);
      onDeleteCurrentNote();
      return;
    }
    setDeleteConfirming(true);
  };

  return (
    <span className="statusbar-note-actions" ref={anchorRef} data-popover-anchor>
      <button type="button" className={`statusbar-btn${classificationBusy ? " active" : ""}`}
        aria-label="Jev 自动归类" title={classificationBusy ? "正在归类" : "使用 Jev 将当前笔记归入候选文件夹"}
        disabled={!classificationEnabled || classificationBusy || isPrivacyNote || defaultNoteOpen || !activeNote}
        onPointerDown={event => event.preventDefault()} onClick={onClassifyNote}>
        <Icon name="ai" size={16} />
      </button>
      {uploadTarget !== "none" && <button
        type="button"
        className={`statusbar-btn statusbar-btn--siyuan${siyuanUploading ? " active" : ""}${uploadHint ? " upload-success" : ""}`}
        title={
          isPrivacyNote
              ? "隐私便签不能上传"
              : (uploadTarget === "obsidian" ? "复制当前便签到 Obsidian" : "上传当前便签到思源笔记（MKnote 覆盖思源）")
        }
        disabled={isPrivacyNote || siyuanUploading || !activeNote}
        // Keep editor focus until click: blur-save can shift the status bar mid-click.
        onPointerDown={(event) => event.preventDefault()}
        onClick={() => {
          onClosePopover();
          onSiyuanUpload();
        }}
      >
        <span className="siyuan-upload-icon"><IconSync /></span>
      </button>}
      <button
        type="button"
        className={`statusbar-btn statusbar-btn--archive${archiveOpen ? " active" : ""}`}
        title="归档到 archive 文件夹"
        data-popover-trigger
        disabled={!activeNote}
        onPointerDown={(e) => {
          e.stopPropagation();
          onToggleArchive();
        }}
      >
        <Icon name="archive" size={16} className="archive-icon" />
      </button>
      {archiveOpen && (
        <ConfirmActionPopover
          className="mk-floating-popover archive-note-confirm statusbar-popover-up"
          ariaLabel="确认归档"
          title="归档当前笔记？"
          description="将移动到 archive 文件夹，可随时在资料库找回。"
          confirmLabel="确认归档"
          onConfirm={() => {
            onClosePopover();
            onArchiveNote();
          }}
          onCancel={onClosePopover}
        />
      )}
      {deleteConfirming ? (
        <button
          type="button"
          className="statusbar-btn statusbar-delete-confirm-btn"
          title="再次点击确认删除"
          aria-label="确认删除当前笔记"
          data-delete-action
          disabled={!activeNote || defaultNoteOpen}
          onClick={handleDeleteClick}
          onBlur={() => setDeleteConfirming(false)}
        >
          <Icon name="confirm" size={16} />
        </button>
      ) : (
        <DeleteButton
          className="statusbar-btn"
          title={defaultNoteOpen ? "默认便签不可删除" : "删除当前笔记"}
          data-delete-action
          disabled={!activeNote || defaultNoteOpen}
          aria-label="删除当前笔记"
          onClick={handleDeleteClick}
          onBlur={() => setDeleteConfirming(false)}
          iconSize={11}
        />
      )}
    </span>
  );
}
