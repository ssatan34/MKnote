import { lazy, Suspense } from "react";
import type { RefObject } from "react";
import type { NoteZone, RecentNoteRef, TrashEntry } from "../../types";
import { IconSidebar } from "../CompactIcons";
import { Icon } from "../Icon";
import { RecentNotesButton } from "../RecentNotesPopover";
import { StatusBarMeta } from "./StatusBarMeta";
import { StatusBarNoteActions } from "./StatusBarNoteActions";
import type { UploadTarget } from "../../utils/noteUpload";
import { QuickPocketEntry } from "../QuickPocketEntry";
import { QuickTodoEntry } from "../QuickTodoEntry";

const TimelineView = lazy(() =>
  import("../TimelineView").then((module) => ({ default: module.TimelineView })),
);
const TrashPopover = lazy(() =>
  import("./TrashPopover").then((module) => ({ default: module.TrashPopover })),
);

type ViewMode = "edit" | "preview";

interface CompactStatusBarProps {
  libraryOpen: boolean;
  recentOpen: boolean;
  timelineOpen: boolean;
  trashOpen: boolean;
  archiveOpen: boolean;
  autostart: boolean;
  activeNote: string;
  activeZone: NoteZone;
  isPrivacyNote: boolean;
  defaultNoteOpen?: boolean;
  classificationEnabled: boolean;
  classificationBusy: boolean;
  onClassifyNote: () => void;
  siyuanUploading: boolean;
  uploadTarget: UploadTarget;
  uploadHint?: string | null;
  syncEnabled: boolean;
  syncInitialized: boolean;
  manualSyncBusy: boolean;
  recentNotes?: RecentNoteRef[];
  trashItems: TrashEntry[];
  trashClearConfirm: boolean;
  trashAnchorRef: RefObject<HTMLSpanElement | null>;
  deleteNoteAnchorRef: RefObject<HTMLSpanElement | null>;
  syncClass: string;
  syncText: string;
  charCount: number;
  lineNumber: number;
  viewMode: ViewMode;
  resolveRecentTitle?: (zone: NoteZone, name: string) => string;
  onClosePopover: () => void;
  onToggleLibrary: () => void;
  onToggleRecent: () => void;
  onToggleTimeline: () => void;
  onToggleTrash: () => void;
  onToggleArchive: () => void;
  onOpenNote: (zone: NoteZone, name: string) => void | Promise<void>;
  onClearRecentNotes?: () => void | Promise<void>;
  onCancelTrashClear: () => void;
  onRequestTrashClear: () => void;
  onConfirmTrashClear: () => void;
  onRestoreFromTrash: (id: string) => void | Promise<void>;
  onPermanentlyDeleteTrash: (id: string) => void | Promise<void>;
  onAutostartChange: (enabled: boolean) => void;
  onSiyuanUpload: () => void | Promise<void>;
  onManualSync: () => void | Promise<void>;
  onArchiveNote: () => void | Promise<void>;
  onDeleteCurrentNote: () => void | Promise<void>;
  onEnterPrivateMode?: () => void;
}

export function CompactStatusBar({
  libraryOpen,
  recentOpen,
  timelineOpen,
  trashOpen,
  archiveOpen,
  autostart,
  activeNote,
  activeZone,
  isPrivacyNote,
  defaultNoteOpen,
  classificationEnabled,
  classificationBusy,
  onClassifyNote,
  siyuanUploading,
  uploadTarget,
  uploadHint,
  syncEnabled,
  syncInitialized,
  manualSyncBusy,
  recentNotes,
  trashItems,
  trashClearConfirm,
  trashAnchorRef,
  deleteNoteAnchorRef,
  syncClass,
  syncText,
  charCount,
  lineNumber,
  viewMode,
  resolveRecentTitle,
  onClosePopover,
  onToggleLibrary,
  onToggleRecent,
  onToggleTimeline,
  onToggleTrash,
  onToggleArchive,
  onOpenNote,
  onClearRecentNotes,
  onCancelTrashClear,
  onRequestTrashClear,
  onConfirmTrashClear,
  onRestoreFromTrash,
  onPermanentlyDeleteTrash,
  onAutostartChange,
  onSiyuanUpload,
  onManualSync,
  onArchiveNote,
  onDeleteCurrentNote,
  onEnterPrivateMode,
}: CompactStatusBarProps) {
  return (
    <footer className="compact-statusbar" data-testid="mknote-statusbar" data-no-drag>
      <button
        type="button"
        className={`statusbar-btn${libraryOpen ? " active" : ""}`}
        data-library-toggle="true"
        title={libraryOpen ? "收起资料库" : "展开资料库"}
        onClick={() => {
          onClosePopover();
          onToggleLibrary();
        }}
      >
        <IconSidebar />
      </button>
      <QuickPocketEntry />
      <QuickTodoEntry />
      <RecentNotesButton
        recentNotes={recentNotes ?? []}
        resolveTitle={(zone, name) => resolveRecentTitle?.(zone, name) ?? name.replace(/\.md$/i, "")}
        open={recentOpen}
        onToggle={onToggleRecent}
        onOpenNote={onOpenNote}
        onClear={() => void onClearRecentNotes?.()}
      />
      <button
        type="button"
        className={`statusbar-btn statusbar-btn--timeline${timelineOpen ? " active" : ""}`}
        title="时间轴"
        onPointerDown={(e) => {
          e.stopPropagation();
          onToggleTimeline();
        }}
      >
        <Icon name="timeline" size={16} className="timeline-icon" />
      </button>
      {timelineOpen && (
        <Suspense fallback={null}>
          <TimelineView
            activeNote={activeNote}
            activeZone={activeZone}
            onClose={onClosePopover}
            onOpenNote={(zone, name) => {
              onClosePopover();
              void onOpenNote(zone, name);
            }}
          />
        </Suspense>
      )}
      <span className="statusbar-siyuan-group trash-anchor" ref={trashAnchorRef} data-popover-anchor>
        <button
          type="button"
          className={`statusbar-btn statusbar-btn--trash${trashOpen ? " active" : ""}`}
          title="回收站"
          data-popover-trigger
          onPointerDown={(e) => {
            e.stopPropagation();
            onToggleTrash();
          }}
        >
          <Icon name="recycle_bin" size={16} className="trash-icon" />
        </button>
        {trashOpen && (
          <Suspense fallback={null}>
            <TrashPopover
              items={trashItems}
              clearConfirm={trashClearConfirm}
              onCancelClear={onCancelTrashClear}
              onRequestClear={onRequestTrashClear}
              onConfirmClear={onConfirmTrashClear}
              onRestore={(id) => void onRestoreFromTrash(id)}
              onDelete={(id) => void onPermanentlyDeleteTrash(id)}
            />
          </Suspense>
        )}
      </span>
      <button
        type="button"
        className={`statusbar-btn${autostart ? " active" : ""}`}
        title={autostart ? "关闭开机自启" : "开启开机自启"}
        onClick={() => {
          onClosePopover();
          onAutostartChange(!autostart);
        }}
      >
        <Icon name="autostart" size={16} />
      </button>
      <button
        type="button"
        className={`statusbar-btn statusbar-btn--manual-sync${manualSyncBusy ? " active" : ""}`}
        title={
          manualSyncBusy
            ? "正在进行 S3 同步"
            : !syncInitialized
              ? "请先在同步设置中初始化 S3 同步"
              : !syncEnabled
                ? "请先开启 S3 自动同步"
                : "S3 一键同步"
        }
        aria-label="S3 一键同步"
        disabled={manualSyncBusy || !syncEnabled || !syncInitialized}
        onClick={() => {
          onClosePopover();
          void onManualSync();
        }}
      >
        <Icon name="sync_manual" size={16} className="manual-sync-icon" />
      </button>
      <StatusBarNoteActions
        uploadTarget={uploadTarget}
        uploadHint={uploadHint}
        anchorRef={deleteNoteAnchorRef}
        archiveOpen={archiveOpen}
        isPrivacyNote={isPrivacyNote}
        classificationEnabled={classificationEnabled}
        classificationBusy={classificationBusy}
        onClassifyNote={onClassifyNote}
        siyuanUploading={siyuanUploading}
        activeNote={activeNote}
        defaultNoteOpen={Boolean(defaultNoteOpen)}
        onToggleArchive={onToggleArchive}
        onClosePopover={onClosePopover}
        onSiyuanUpload={() => void onSiyuanUpload()}
        onArchiveNote={() => void onArchiveNote()}
        onDeleteCurrentNote={() => void onDeleteCurrentNote()}
      />
      <StatusBarMeta
        syncClass={syncClass}
        syncText={syncText}
        charCount={charCount}
        lineNumber={lineNumber}
        viewMode={viewMode}
        onEnterPrivateMode={onEnterPrivateMode}
      />
    </footer>
  );
}
