import type { RefObject } from "react";
import type { FormatAction } from "../../utils/editorFormat";
import { FONT_TOOLBAR_ITEMS, MARKDOWN_TOOLBAR_GROUPS } from "../../utils/editorFormat";
import type { OpenTabRef } from "../../types";
import { Icon } from "../Icon";
import { ScriptRunButton } from "./ScriptRunButton";
import { TemplatePicker } from "./TemplatePicker";

type PinnedTabChoice = OpenTabRef & { title: string };

interface MarkdownToolbarProps {
  fontSize: number;
  activeNote: string;
  isActiveTabPinned: boolean;
  replacePinPrompt: OpenTabRef | null;
  pinnedTabChoices: PinnedTabChoice[];
  tabPinWrapRef: RefObject<HTMLDivElement | null>;
  onFormat: (action: FormatAction) => void;
  onPreserveSelection: () => void;
  onBumpFont: (delta: number) => void;
  onClosePopover: () => void;
  onToggleTabPin?: () => void;
  onReplacePinnedTab?: (replaced: OpenTabRef) => void;
}

export function MarkdownToolbar({
  fontSize,
  activeNote,
  isActiveTabPinned,
  replacePinPrompt,
  pinnedTabChoices,
  tabPinWrapRef,
  onFormat,
  onPreserveSelection,
  onBumpFont,
  onClosePopover,
  onToggleTabPin,
  onReplacePinnedTab,
}: MarkdownToolbarProps) {
  return (
    <div className="markdown-toolbar-shell" data-no-drag>
      <div className="markdown-toolbar markdown-toolbar--scroll">
        {MARKDOWN_TOOLBAR_GROUPS.map((group, groupIndex) => (
          <div key={groupIndex} className="markdown-toolbar-group">
            {group.items.map((item) => (
              <button
                key={item.action}
                type="button"
                className="markdown-toolbar-btn"
                title={item.title}
              onMouseDown={(e) => {
                e.preventDefault();
                onPreserveSelection();
              }}
                onClick={() => onFormat(item.action)}
              >
                <Icon name={item.icon} size={16} />
              </button>
            ))}
          </div>
        ))}
      </div>
      <div className="markdown-toolbar-actions font-stepper-toolbar" data-no-drag>
        <div className="font-stepper">
          <button
            type="button"
            className="markdown-toolbar-btn"
            title="减小字号"
            onClick={() => onBumpFont(-1)}
            aria-label="减小字号"
          >
            <Icon name="font_decrease" size={16} />
          </button>
          <span>{fontSize}</span>
          <button
            type="button"
            className="markdown-toolbar-btn"
            title="增大字号"
            onClick={() => onBumpFont(1)}
            aria-label="增大字号"
          >
            <Icon name="font_increase" size={16} />
          </button>
        </div>
      </div>
      <div className="markdown-toolbar-actions" ref={tabPinWrapRef} data-popover-anchor>
        <button
          type="button"
          className={`markdown-toolbar-btn tab-pin-btn${isActiveTabPinned ? " active" : ""}`}
          title={isActiveTabPinned ? "取消置顶标签" : "置顶标签"}
          disabled={!activeNote}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            onClosePopover();
            onToggleTabPin?.();
          }}
        >
          {isActiveTabPinned ? <Icon name="lock_closed2" size={16} /> : <Icon name="lock_open2" size={16} />}
        </button>
        {replacePinPrompt && pinnedTabChoices.length > 0 && (
          <div
            className="mk-floating-popover tab-replace-pin-popover"
            role="dialog"
            aria-label="选择要替换的置顶标签"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="mk-floating-popover-head">
              <strong>最多置顶 2 个标签</strong>
              <span>点击要替换的置顶标签</span>
            </div>
            <ul className="tab-replace-pin-list">
              {pinnedTabChoices.map((item) => (
                <li key={`${item.zone}:${item.name}`}>
                  <button
                    type="button"
                    className="tab-replace-pin-item"
                    onClick={() => onReplacePinnedTab?.(item)}
                  >
                    {item.title}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

interface CompactEditorToolbarProps {
  templateOpen: boolean;
  isPrivacyNote: boolean;
  isScriptNote: boolean;
  scriptRunning: boolean;
  activeNote: string;
  onToggleTemplate: () => void;
  onSelectTemplate: (templateId: string) => void | Promise<void>;
  onUndo: () => void;
  onRedo: () => void;
  onFormat: (action: FormatAction) => void;
  onPreserveSelection: () => void;
  onAiAssist: () => void;
  onRunScript: () => void;
  onOpenContainingFolder: () => void;
}

export function CompactEditorToolbar({
  templateOpen,
  isPrivacyNote,
  isScriptNote,
  scriptRunning,
  activeNote,
  onToggleTemplate,
  onSelectTemplate,
  onUndo,
  onRedo,
  onFormat,
  onPreserveSelection,
  onAiAssist,
  onRunScript,
  onOpenContainingFolder,
}: CompactEditorToolbarProps) {
  return (
    <aside className="compact-toolbar">
      <TemplatePicker
        open={templateOpen}
        onToggle={onToggleTemplate}
        onSelect={onSelectTemplate}
      />
      <button type="button" className="icon-btn" title="撤销" onClick={onUndo}>
        <Icon name="undo" size={16} />
      </button>
      <button type="button" className="icon-btn" title="重做" onClick={onRedo}>
        <Icon name="redo" size={16} />
      </button>
      <div className="compact-toolbar-divider" aria-hidden="true" />
      {FONT_TOOLBAR_ITEMS.map((item) => (
        <button
          key={item.action}
          type="button"
          className="icon-btn"
          title={item.title}
          onMouseDown={(e) => {
            e.preventDefault();
            onPreserveSelection();
          }}
          onClick={() => onFormat(item.action)}
        >
          <Icon name={item.icon} size={16} />
        </button>
      ))}
      <div className="compact-toolbar-divider" aria-hidden="true" />
      <button
        type="button"
        className="icon-btn ai-assist-btn"
        title={isPrivacyNote ? "隐私便签不支持 AI 助手" : "AI 助手（先选中文本）"}
        disabled={isPrivacyNote}
        onMouseDown={(e) => e.preventDefault()}
        onClick={onAiAssist}
      >
        <Icon name="ai_assist" size={16} className="ai-assist-icon" />
        <span className="ai-assist-label" aria-hidden="true">AI</span>
      </button>
      {isScriptNote && <ScriptRunButton running={scriptRunning} onRun={onRunScript} />}
      <button
        type="button"
        className="icon-btn open-containing-folder-btn"
        title="在资源管理器中打开所在文件夹"
        disabled={!activeNote}
        onMouseDown={(e) => e.preventDefault()}
        onClick={onOpenContainingFolder}
      >
        <Icon name="open_containing_folder" size={16} className="open-containing-folder-icon" />
      </button>
      <span className="toolbar-spacer" />
    </aside>
  );
}
