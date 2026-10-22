import { Component, lazy, Suspense, useState, type ErrorInfo, type ReactNode, type RefObject } from "react";
import type { NoteSummary, NoteZone } from "../../types";
import { notesService } from "../../services/notesService";
import { resolveVisualEditorMode, shouldUseVisualEditor } from "../../utils/visualEditorMode";
import { inspectVisualEditorSourceBoundary } from "../../utils/visualEditorSourceBoundary";
import type { VisualEditorCommandSurface } from "../../visual-editor/visualEditorSession";
import { VisualEditorRecoveryPanel } from "../VisualEditorRecoveryPanel";

type ViewMode = "edit" | "preview";

interface VisualEditorErrorBoundaryProps {
  children: ReactNode;
  onError: (error: unknown) => void;
}

interface VisualEditorErrorBoundaryState {
  hasError: boolean;
}

// React 的错误边界仍需使用 class；它专门把 lazy chunk 加载/渲染失败转回旧编辑器。
class VisualEditorErrorBoundary extends Component<
  VisualEditorErrorBoundaryProps,
  VisualEditorErrorBoundaryState
> {
  state: VisualEditorErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): VisualEditorErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, _errorInfo: ErrorInfo): void {
    this.props.onError(error);
  }

  render(): ReactNode {
    return this.state.hasError ? null : this.props.children;
  }
}

const VisualEditor = lazy(() =>
  import("../VisualEditor").then((module) => ({ default: module.VisualEditor })),
);

interface EditorPaneProps {
  libraryOpen: boolean;
  activeZone: NoteZone;
  privateModeActive: boolean;
  privacyMask: boolean;
  viewMode: ViewMode;
  dragDropActive: boolean;
  activeNote: string;
  content: string;
  displayContent: string;
  contentRevision: number;
  privateContent: string;
  privateContentRevision: number;
  backlinks: NoteSummary[];
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  previewRef: RefObject<HTMLDivElement | null>;
  visualEditorCommandRef: RefObject<VisualEditorCommandSurface | null>;
  onFocusEditor: () => void;
  onContentChange: (value: string) => void;
  onPrivateContentChange?: (value: string) => void;
  onUpdateCursorLine: () => void;
  onEditorBlur: () => void;
  onWikilinkNavigate?: (title: string) => void;
  onImageDoodle: (localRel: string | null, hostedUrl: string | null) => void;
  onOpenNote: (zone: NoteZone, name: string) => void;
  onOpenSourceEditor?: () => void;
}

export function EditorPane({
  libraryOpen,
  activeZone,
  privateModeActive,
  privacyMask,
  viewMode,
  dragDropActive,
  activeNote,
  content,
  displayContent,
  contentRevision,
  privateContent,
  privateContentRevision,
  backlinks,
  textareaRef,
  previewRef,
  visualEditorCommandRef,
  onFocusEditor,
  onContentChange,
  onPrivateContentChange,
  onUpdateCursorLine,
  onEditorBlur,
  onWikilinkNavigate,
  onImageDoodle,
  onOpenNote,
  onOpenSourceEditor,
}: EditorPaneProps) {
  const [visualEditorFailed, setVisualEditorFailed] = useState(false);
  const openSourceEditor = () => {
    setVisualEditorFailed(true);
    onOpenSourceEditor?.();
  };
  const visualEditorRequested = shouldUseVisualEditor({
    mode: resolveVisualEditorMode(import.meta.env.VITE_MKNOTE_EDITOR_MODE),
    viewMode,
    privateModeActive,
    privacyMask,
  });
  const visualEditorSourceBoundary = visualEditorRequested
    ? inspectVisualEditorSourceBoundary(content)
    : null;
  const useVisualEditor = visualEditorRequested && !visualEditorFailed && !visualEditorSourceBoundary;

  if (libraryOpen) return null;

  return (
    <section
      className="compact-editor"
      data-view-mode={viewMode}
      data-testid="mknote-editor-pane"
      onMouseDown={(e) => {
        const target = e.target as HTMLElement;
        if (
          target.closest(
            "button, input, .compact-toolbar, .compact-statusbar, .markdown-toolbar, .ProseMirror, textarea",
          )
        ) {
          return;
        }
        onFocusEditor();
      }}
    >
      <div className="captain-log-editor-hud" aria-hidden="true">
        <span className="hud-corner hud-corner--tl"><i /><b /><em /></span>
        <span className="hud-corner hud-corner--tr"><i /><b /><em /></span>
        <span className="hud-corner hud-corner--bl"><i /><b /><em /></span>
        <span className="hud-corner hud-corner--br"><i /><b /><em /></span>
        <span className="hud-edge hud-edge--top" />
        <span className="hud-edge hud-edge--bottom" />
        <span className="hud-edge hud-edge--left" />
        <span className="hud-edge hud-edge--right" />
        <span className="hud-reticle" />
        <span className="hud-dial"><i /><b /></span>
        <span className="hud-spark hud-spark--top" />
        <span className="hud-spark hud-spark--right" />
        <span className="hud-spark hud-spark--bottom" />
      </div>
      {dragDropActive && (
        <div className="compact-editor-drag-overlay" aria-hidden="true">
          松开以导入图片
        </div>
      )}
      {privacyMask && (
        <div className="privacy-mask-banner" role="status">
          隐私遮罩已开启：疑似密钥行已遮罩，关闭后可正常编辑
        </div>
      )}
      {privacyMask && !privateModeActive ? (
        <textarea
          key={`${activeNote}:${contentRevision}:mask`}
          ref={textareaRef}
          className="editor privacy-masked"
          data-testid="mknote-editor-mask"
          aria-label="隐私遮罩编辑器"
          readOnly
          value={displayContent}
          spellCheck={false}
        />
      ) : viewMode === "edit" ? (
        <textarea
          key={privateModeActive ? `private:${privateContentRevision}` : `${activeNote}:${contentRevision}`}
          ref={textareaRef}
          className="editor"
          data-testid="mknote-markdown-editor"
          aria-label="Markdown 编辑器"
          defaultValue={privateModeActive ? privateContent : content}
          onInput={(e) => {
            if (privateModeActive) {
              onPrivateContentChange?.(e.currentTarget.value);
            } else {
              onContentChange(e.currentTarget.value);
              onUpdateCursorLine();
            }
          }}
          onSelect={privateModeActive ? undefined : onUpdateCursorLine}
          onClick={privateModeActive ? undefined : onUpdateCursorLine}
          onKeyUp={privateModeActive ? undefined : onUpdateCursorLine}
          onBlur={onEditorBlur}
          onDoubleClick={() => {
            if (privateModeActive) return;
            const el = textareaRef.current;
            if (!el || !onWikilinkNavigate) return;
            const pos = el.selectionStart;
            const text = el.value;
            const re = /\[\[([^\]|]+)(?:\|[^\]]*)?\]\]/g;
            let match: RegExpExecArray | null;
            while ((match = re.exec(text))) {
              const start = match.index;
              const end = start + match[0].length;
              if (pos >= start && pos <= end) {
                onWikilinkNavigate(match[1].trim());
                break;
              }
            }
          }}
          spellCheck={false}
          placeholder="在此输入 Markdown…"
        />
      ) : (
        <Suspense fallback={null}>
          {useVisualEditor ? (
            <VisualEditorErrorBoundary onError={openSourceEditor}>
              <VisualEditor
              noteKey={`${activeZone}:${activeNote}`}
              content={content}
              contentRevision={contentRevision}
              editorRef={previewRef}
              commandRef={visualEditorCommandRef}
              onChange={onContentChange}
              onPrepareMigrationSnapshot={async () => {
                await notesService.ensureVisualEditorMigrationSnapshot(activeZone, activeNote);
              }}
              onWikilinkNavigate={onWikilinkNavigate}
              onImageDoodle={onImageDoodle}
              onBlur={onEditorBlur}
              onError={openSourceEditor}
              />
            </VisualEditorErrorBoundary>
          ) : (
            <VisualEditorRecoveryPanel
              message={visualEditorSourceBoundary?.message}
              onOpenSourceEditor={onOpenSourceEditor}
            />
          )}
        </Suspense>
      )}
      {backlinks.length > 0 && (
        <div className="backlinks-panel">
          <strong>反向引用</strong>
          {backlinks.map((note) => (
            <button
              key={`${note.zone}:${note.name}`}
              type="button"
              onClick={() => onOpenNote(note.zone, note.name)}
            >
              {note.title}
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
