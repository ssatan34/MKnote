import { useEffect } from "react";
import { Icon } from "./Icon";
import type { NoteZone, RecentNoteRef } from "../types";
import "./RecentNotesPopover.css";

interface RecentNotesPopoverProps {
  recentNotes: RecentNoteRef[];
  resolveTitle: (zone: NoteZone, name: string) => string;
  onOpenNote: (zone: NoteZone, name: string) => void;
  onClear: () => void;
  onClose: () => void;
}

export function RecentNotesPopover({
  recentNotes,
  resolveTitle,
  onOpenNote,
  onClear,
  onClose,
}: RecentNotesPopoverProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const items = recentNotes.filter((ref) => ref.name.trim().length > 0).slice(0, 10);

  return (
    <div className="recent-notes-popover" role="dialog" aria-label="最近打开">
      <div className="recent-notes-popover-head">
        <p className="recent-notes-popover-title">最近打开</p>
        {items.length > 0 && (
          <button
            type="button"
            className="popover-clear-btn recent-notes-clear-btn"
            title="清空最近打开记录"
            aria-label="清空最近打开记录"
            onClick={onClear}
          >
            <Icon name="clear4" size={15} className="popover-clear-icon" />
          </button>
        )}
      </div>
      {items.length === 0 ? (
        <p className="recent-notes-popover-empty">暂无记录</p>
      ) : (
        <ul className="recent-notes-list">
          {items.map((ref) => (
            <li key={`${ref.zone}:${ref.name}:${ref.opened_at}`}>
              <button
                type="button"
                onClick={() => {
                  onOpenNote(ref.zone as NoteZone, ref.name);
                  onClose();
                }}
              >
                <span className="recent-notes-item-title">
                  {resolveTitle(ref.zone as NoteZone, ref.name)}
                </span>
                {ref.zone !== "default" && (
                  <span className="recent-notes-item-zone">{ref.zone}</span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

interface RecentNotesButtonProps {
  recentNotes: RecentNoteRef[];
  resolveTitle: (zone: NoteZone, name: string) => string;
  open: boolean;
  onToggle: () => void;
  onOpenNote: (zone: NoteZone, name: string) => void;
  onClear: () => void;
}

export function RecentNotesButton({
  recentNotes,
  resolveTitle,
  open,
  onToggle,
  onOpenNote,
  onClear,
}: RecentNotesButtonProps) {
  return (
    <span className="recent-notes-anchor" data-popover-anchor>
      <button
        type="button"
        className={`statusbar-btn statusbar-btn--recent-notes${open ? " active" : ""}`}
        title="最近打开"
        data-popover-trigger
        onMouseDown={(e) => e.preventDefault()}
        onClick={onToggle}
      >
        <Icon name="recent_notes" size={16} className="recent-notes-icon" />
      </button>
      {open && (
        <RecentNotesPopover
          recentNotes={recentNotes}
          resolveTitle={resolveTitle}
          onOpenNote={onOpenNote}
          onClear={onClear}
          onClose={onToggle}
        />
      )}
    </span>
  );
}
