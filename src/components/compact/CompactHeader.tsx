import { lazy, Suspense, useRef, useState } from "react";
import type { Dispatch, MouseEvent, MutableRefObject, RefObject, SetStateAction } from "react";
import type {
  AppConfig,
  CustomTagDef,
  NoteSummary,
  NoteZone,
  LskyCleanupDeleteResult,
  LskyCleanupReport,
  ImageHostConfigPatch,
  SearchHit,
  SiyuanNotebookSummary,
  SiyuanSyncStatus,
  ThemeMode,
  ThemeStyle,
} from "../../types";
import { noteColorTooltip } from "../../constants/noteColors";
import { ColorTagPicker, ColorTagSwatch } from "../ColorTagPicker";
import {
  IconLogoPlaceholder,
} from "../CompactIcons";
import { Icon } from "../Icon";
import { CloseButton } from "../CloseButton";
import { WindowPinButton } from "../WindowPinButton";
import { ViewModeToggle } from "../ViewModeToggle";
import { SearchTitleButton } from "../SearchTitleButton";
import "../SettingsButton.css";
import { ThemeToggle } from "../ThemeToggle";
import { FullSearchPopover, TitleSearchPopover } from "./SearchPopovers";
import { FullSearchButton } from "../FullSearchButton";
import { TitleInput } from "../TitleInput";
import type { SettingsRoute } from "./UnifiedSettingsPanel";

const UnifiedSettingsPanel = lazy(() =>
  import("./UnifiedSettingsPanel").then((module) => ({ default: module.UnifiedSettingsPanel })),
);

type ViewMode = "edit" | "preview";

interface CompactHeaderProps {
  config: AppConfig;
  titleDraft: string;
  activeNoteColor: string | null;
  activeSiyuanSync?: SiyuanSyncStatus | null;
  defaultNoteOpen?: boolean;
  fullSearchOpen: boolean;
  searchOpen: boolean;
  settingsOpen: boolean;
  titleColorOpen: boolean;
  viewMode: ViewMode;
  privacyMask: boolean;
  themeMode: ThemeMode;
  customTags: CustomTagDef[];
  settingsRoute: SettingsRoute;
  searchQuery: string;
  searchResults: NoteSummary[];
  fullSearchQuery: string;
  fullSearchLoading: boolean;
  fullSearchResults: SearchHit[];
  titleInputRef: RefObject<HTMLInputElement | null>;
  titleColorWrapRef: RefObject<HTMLSpanElement | null>;
  titleClickSelectPendingRef: MutableRefObject<boolean>;
  onTitleBarMouseDown: (event: MouseEvent<HTMLElement>) => void;
  onOpenCapsule: () => void;
  onToggleTitleColor: () => void;
  onActiveNoteColorChange: (color: string | null) => void;
  onClosePopover: () => void;
  onTitleDraftChange: Dispatch<SetStateAction<string>>;
  onTitleChange: (title: string) => void;
  onTitleCommit: (title: string) => void;
  onOpenDefaultNote?: () => void;
  onFullSearchOpenChange: (open: boolean) => void;
  onToggleSearch: () => void;
  onTogglePreview: () => void;
  onTogglePin: () => void | Promise<void>;
  onThemeModeCycle: () => void;
  onOpenSettingsRoute: (route: SettingsRoute) => void;
  onHide: () => void;
  onOpenNote: (zone: NoteZone, name: string) => void;
  onSearchQueryChange: (value: string) => void;
  onFullSearchQueryChange: (value: string) => void;
  onSelectSettingsRoute: (route: SettingsRoute) => void;
  onGlobalHotkeysSave: (hotkeys: import("../../types").GlobalHotkeys) => void | Promise<void>;
  onThemeModeChange: (mode: ThemeMode) => void | Promise<void>;
  onThemeStyleChange: (theme: ThemeStyle) => void;
  onNoteColorLabelsChange: (labels: Record<string, string>) => void | Promise<void>;
  onPrivacyMaskChange: (enabled: boolean) => void;
  onAddCustomTag?: (name: string, hex: string) => void | Promise<void>;
  onUpdateCustomTag?: (id: string, patch: { name?: string; hex?: string }) => void | Promise<void>;
  onDeleteCustomTag?: (id: string) => void | Promise<void>;
  onSiyuanConfigSave: (patch: { apiUrl: string; apiToken: string; notebookId: string }) => Promise<void>;
  onUploadConfigSave: (patch: import("../../utils/noteUpload").NoteUploadConfigPatch) => Promise<void>;
  onSiyuanTestConnection: (apiUrl: string, apiToken: string) => Promise<SiyuanNotebookSummary[]>;
  onMessageHubSettingsSave?: (patch: {
    endpoint: string;
    bucket: string;
    objectKey: string;
    accessKey: string;
    secretKey: string;
  }) => Promise<void>;
  onMessageHubTestConnection?: (
    endpoint: string,
    bucket: string,
    objectKey: string,
    accessKey: string,
    secretKey: string,
  ) => Promise<void>;
  onSyncEnabledChange?: (enabled: boolean) => Promise<void>;
  onSyncBootstrap?: (mode: "local" | "remote") => Promise<void>;
  onSyncResolveConflicts?: (resolution: "local" | "remote") => Promise<void>;
  onLskyCleanupScan: () => Promise<LskyCleanupReport>;
  onLskyCleanupDelete: (keys: string[]) => Promise<LskyCleanupDeleteResult>;
  onCloudImgsCleanupScan: () => Promise<LskyCleanupReport>;
  onCloudImgsCleanupDelete: (keys: string[]) => Promise<LskyCleanupDeleteResult>;
  onImageHostConfigSave: (patch: ImageHostConfigPatch) => Promise<void>;
  onLskyTestConnection: (url: string, email: string, password: string) => Promise<void>;
  onCloudImgsTestConnection: (url: string, password: string, directory: string) => Promise<void>;
  onClassificationConfigSave: (settings: import("../../types").NoteClassificationConfig) => Promise<void>;
  onAiConfigSave: (patch: import("../../types").AiConfig) => void | Promise<void>;
  onPinnedTabLimitChange?: (limit: number) => void | Promise<void>;
  onFullscreenDodgeChange?: (enabled: boolean) => void | Promise<void>;
}

export function CompactHeader({
  config,
  titleDraft,
  activeNoteColor,
  activeSiyuanSync,
  defaultNoteOpen,
  fullSearchOpen,
  searchOpen,
  settingsOpen,
  titleColorOpen,
  viewMode,
  privacyMask,
  themeMode,
  customTags,
  settingsRoute,
  searchQuery,
  searchResults,
  fullSearchQuery,
  fullSearchLoading,
  fullSearchResults,
  titleInputRef,
  titleColorWrapRef,
  titleClickSelectPendingRef,
  onTitleBarMouseDown,
  onOpenCapsule,
  onToggleTitleColor,
  onActiveNoteColorChange,
  onClosePopover,
  onTitleDraftChange,
  onTitleChange,
  onTitleCommit,
  onOpenDefaultNote,
  onFullSearchOpenChange,
  onToggleSearch,
  onTogglePreview,
  onTogglePin,
  onThemeModeCycle,
  onOpenSettingsRoute,
  onHide,
  onOpenNote,
  onSearchQueryChange,
  onFullSearchQueryChange,
  onSelectSettingsRoute,
  onGlobalHotkeysSave,
  onThemeModeChange,
  onThemeStyleChange,
  onNoteColorLabelsChange,
  onPrivacyMaskChange,
  onAddCustomTag,
  onUpdateCustomTag,
  onDeleteCustomTag,
  onSiyuanConfigSave,
  onUploadConfigSave,
  onSiyuanTestConnection,
  onMessageHubSettingsSave,
  onMessageHubTestConnection,
  onSyncEnabledChange,
  onSyncBootstrap,
  onSyncResolveConflicts,
  onLskyCleanupScan,
  onLskyCleanupDelete,
  onCloudImgsCleanupScan,
  onCloudImgsCleanupDelete,
  onImageHostConfigSave,
  onLskyTestConnection,
  onCloudImgsTestConnection,
  onClassificationConfigSave,
  onAiConfigSave,
  onPinnedTabLimitChange,
  onFullscreenDodgeChange,
}: CompactHeaderProps) {
  const titleLocked = Boolean(defaultNoteOpen);
  const isGeneratedNumericTitle = /^\d{17}$/.test(titleDraft);
  const [titleEditing, setTitleEditing] = useState(false);
  const titleDragPendingRef = useRef(false);

  const placeTitleCaret = (input: HTMLInputElement) => {
    if (isGeneratedNumericTitle) {
      input.select();
    } else {
      input.setSelectionRange(titleDraft.length, titleDraft.length);
    }
  };

  return (
    <header
      className="compact-header"
      onMouseDown={onTitleBarMouseDown}
    >
      <div className="compact-header-left">
        <span
          className="compact-logo"
          data-no-drag
          title="点击将当前笔记转为胶囊模式"
          onMouseDown={(e) => {
            e.stopPropagation();
          }}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onOpenCapsule();
          }}
        >
          <IconLogoPlaceholder />
        </span>
        <span
          ref={titleColorWrapRef}
          className="title-color-wrap"
          data-popover-anchor
          data-no-drag
        >
          <button
            type="button"
            className={`title-color-btn${titleColorOpen ? " active" : ""}`}
            data-popover-trigger
            title={noteColorTooltip(activeNoteColor, config.note_color_labels, customTags)}
            onPointerDown={(e) => {
              e.stopPropagation();
              onToggleTitleColor();
            }}
          >
            <ColorTagSwatch
              color={activeNoteColor}
              customTags={customTags}
              className="note-color-trigger-dot"
            />
          </button>
          {titleColorOpen && (
            <div className="title-color-menu" onMouseDown={(e) => e.stopPropagation()}>
              <ColorTagPicker
                value={activeNoteColor}
                layout="horizontal"
                colorLabels={config.note_color_labels}
                customTags={customTags}
                showCustomTags
                onChange={(color) => {
                  onActiveNoteColorChange(color);
                  onClosePopover();
                }}
              />
            </div>
          )}
        </span>
        <div className="compact-title-wrap">
          <TitleInput
            ref={titleInputRef}
            className={`compact-title${titleLocked ? " locked" : ""}`}
            data-title-editing={titleEditing ? "true" : "false"}
            value={defaultNoteOpen ? "默认便签" : titleDraft}
            title={defaultNoteOpen ? "默认便签" : titleDraft}
            onChange={(e) => {
              if (titleLocked) return;
              onTitleDraftChange(e.target.value);
              onTitleChange(e.target.value);
            }}
            readOnly={titleLocked || !titleEditing}
            onMouseDown={(e) => {
              if (titleLocked || !titleEditing) {
                e.preventDefault();
                titleDragPendingRef.current = true;
                return;
              }
              titleClickSelectPendingRef.current = document.activeElement !== e.currentTarget;
            }}
            onMouseMove={(e) => {
              if (!titleDragPendingRef.current || e.buttons !== 1) return;
              titleDragPendingRef.current = false;
              onTitleBarMouseDown(e as unknown as MouseEvent<HTMLElement>);
            }}
            onMouseUp={(e) => {
              titleDragPendingRef.current = false;
              if (titleLocked || !titleEditing) return;
              if (!titleClickSelectPendingRef.current) return;
              placeTitleCaret(e.currentTarget);
              titleClickSelectPendingRef.current = false;
            }}
            onFocus={(e) => {
              if (titleLocked || !titleEditing) return;
              placeTitleCaret(e.currentTarget);
            }}
            onDoubleClick={(e) => {
              if (titleLocked) return;
              titleDragPendingRef.current = false;
              setTitleEditing(true);
              e.currentTarget.focus();
              if (isGeneratedNumericTitle) {
                e.currentTarget.select();
              } else {
                e.currentTarget.setSelectionRange(titleDraft.length, titleDraft.length);
              }
            }}
            onBlur={() => {
              titleClickSelectPendingRef.current = false;
              if (!titleLocked) {
                onTitleCommit(titleDraft);
                setTitleEditing(false);
              }
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.currentTarget.blur();
              }
            }}
          />
          {activeSiyuanSync?.synced && !titleLocked && (
            <span
              className="title-siyuan-badge"
              title={
                activeSiyuanSync.h_path
                  ? `已同步至思源：${activeSiyuanSync.h_path}`
                  : "已同步至思源"
              }
            >
              <Icon name="sync_manual" size={14} />
            </span>
          )}
        </div>
      </div>
      <div className="compact-header-actions" data-no-drag>
        <div className="header-action-group" aria-label="默认便签">
          <button
            type="button"
            className={`icon-btn default-note-btn${defaultNoteOpen ? " active" : ""}`}
            title="默认便签"
            onClick={() => onOpenDefaultNote?.()}
          >
            <Icon name="default_note" size={16} />
          </button>
        </div>
        <div className="header-action-group" aria-label="搜索">
          <FullSearchButton
            open={fullSearchOpen}
            onClick={() => {
              onClosePopover();
              onFullSearchOpenChange(!fullSearchOpen);
            }}
          />
          <SearchTitleButton
            open={searchOpen}
            onPointerDown={(e) => {
              e.stopPropagation();
              onFullSearchOpenChange(false);
              onToggleSearch();
            }}
          />
        </div>
        <div className="header-action-group" aria-label="编辑">
          <ViewModeToggle mode={viewMode} privacyMask={privacyMask} disabled={privacyMask} onClick={onTogglePreview} />
        </div>
        <div className="header-action-group" aria-label="窗口">
          <WindowPinButton pinned={config.always_on_top} className="pin-btn" onClick={() => void onTogglePin()} />
          <ThemeToggle mode={themeMode} onCycle={onThemeModeCycle} />
          <button
            type="button"
            className={`settings-btn${settingsOpen ? " active" : ""}`}
            aria-label="设置"
            title="设置"
            data-popover-trigger
            onPointerDown={(e) => {
              e.stopPropagation();
              onFullSearchOpenChange(false);
              if (settingsOpen) {
                onClosePopover();
              } else {
                onOpenSettingsRoute("appearance");
              }
            }}
          >
            <span className="bar bar1" aria-hidden="true" />
            <span className="bar bar2" aria-hidden="true" />
            <span className="bar bar1" aria-hidden="true" />
          </button>
          <CloseButton className="titlebar-close" title="隐藏到托盘" aria-label="隐藏到托盘" onClick={onHide} />
        </div>
      </div>
      {settingsOpen && (
        <Suspense fallback={null}>
          <UnifiedSettingsPanel
            config={config}
            activeRoute={settingsRoute}
            privacyMask={privacyMask}
            customTags={customTags}
            onSelectRoute={onSelectSettingsRoute}
            onClose={onClosePopover}
            onGlobalHotkeysSave={onGlobalHotkeysSave}
            onThemeModeChange={onThemeModeChange}
            onThemeStyleChange={onThemeStyleChange}
            onNoteColorLabelsChange={onNoteColorLabelsChange}
            onPrivacyMaskChange={onPrivacyMaskChange}
            onAddCustomTag={onAddCustomTag}
            onUpdateCustomTag={onUpdateCustomTag}
            onDeleteCustomTag={onDeleteCustomTag}
            onSiyuanConfigSave={onSiyuanConfigSave}
            onUploadConfigSave={onUploadConfigSave}
            onSiyuanTestConnection={onSiyuanTestConnection}
            onMessageHubSettingsSave={onMessageHubSettingsSave}
            onMessageHubTestConnection={onMessageHubTestConnection}
            onSyncEnabledChange={onSyncEnabledChange}
            onSyncBootstrap={onSyncBootstrap}
            onSyncResolveConflicts={onSyncResolveConflicts}
            onLskyCleanupScan={onLskyCleanupScan}
            onLskyCleanupDelete={onLskyCleanupDelete}
            onCloudImgsCleanupScan={onCloudImgsCleanupScan}
            onCloudImgsCleanupDelete={onCloudImgsCleanupDelete}
            onImageHostConfigSave={onImageHostConfigSave}
            onLskyTestConnection={onLskyTestConnection}
            onCloudImgsTestConnection={onCloudImgsTestConnection}
            onClassificationConfigSave={onClassificationConfigSave}
        onAiConfigSave={onAiConfigSave}
            onPinnedTabLimitChange={onPinnedTabLimitChange}
            onFullscreenDodgeChange={onFullscreenDodgeChange}
          />
        </Suspense>
      )}
      {searchOpen && (
        <TitleSearchPopover
          query={searchQuery}
          results={searchResults}
          onQueryChange={onSearchQueryChange}
          onOpenNote={onOpenNote}
          onClose={onClosePopover}
        />
      )}
      {fullSearchOpen && (
        <FullSearchPopover
          query={fullSearchQuery}
          loading={fullSearchLoading}
          results={fullSearchResults}
          onQueryChange={onFullSearchQueryChange}
          onOpenNote={onOpenNote}
          onClose={() => onFullSearchOpenChange(false)}
        />
      )}
    </header>
  );
}
