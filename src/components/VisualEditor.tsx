import { useEffect, useRef, useState, type RefObject } from "react";
import {
  createMilkdownVisualEditorAdapter,
} from "../visual-editor/visualEditorAdapter";
import {
  createVisualEditorSession,
  type VisualEditorCommand,
  type VisualEditorCommandSurface,
  type VisualEditorSession,
} from "../visual-editor/visualEditorSession";
import { Icon } from "./Icon";
import "./VisualEditor.css";

interface VisualEditorProps {
  noteKey: string;
  content: string;
  contentRevision: number;
  editorRef?: RefObject<HTMLDivElement | null>;
  commandRef?: RefObject<VisualEditorCommandSurface | null>;
  onChange: (value: string) => void;
  onPrepareMigrationSnapshot?: () => Promise<void>;
  onWikilinkNavigate?: (target: string) => void;
  onImageDoodle?: (localRel: string | null, hostedUrl: string | null) => void;
  onBlur?: () => void;
  onError?: (error: unknown) => void;
}

interface VisualEditorInputs {
  noteKey: string;
  content: string;
  contentRevision: number;
}

function assignEditorRef(ref: RefObject<HTMLDivElement | null> | undefined, value: HTMLDivElement | null): void {
  if (ref) ref.current = value;
}

function assignCommandRef(
  ref: RefObject<VisualEditorCommandSurface | null> | undefined,
  value: VisualEditorCommandSurface | null,
): void {
  if (ref) ref.current = value;
}

export function VisualEditor({
  noteKey,
  content,
  contentRevision,
  editorRef,
  commandRef,
  onChange,
  onPrepareMigrationSnapshot,
  onWikilinkNavigate,
  onImageDoodle,
  onBlur,
  onError,
}: VisualEditorProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const sessionRef = useRef<VisualEditorSession | null>(null);
  const activeNoteRef = useRef(noteKey);
  const appliedRevisionRef = useRef(contentRevision);
  const lastAdapterMarkdownRef = useRef(content);
  const onChangeRef = useRef(onChange);
  const onPrepareMigrationSnapshotRef = useRef(onPrepareMigrationSnapshot);
  const onWikilinkNavigateRef = useRef(onWikilinkNavigate);
  const onImageDoodleRef = useRef(onImageDoodle);
  const onBlurRef = useRef(onBlur);
  const onErrorRef = useRef(onError);
  const latestInputsRef = useRef<VisualEditorInputs>({ noteKey, content, contentRevision });
  const loadQueueRef = useRef<Promise<void>>(Promise.resolve());
  const loadRequestIdRef = useRef(0);
  const [error, setError] = useState<string | null>(null);
  const [findReplaceOpen, setFindReplaceOpen] = useState(false);
  const [findQuery, setFindQuery] = useState("");
  const [replaceText, setReplaceText] = useState("");
  const [findStatus, setFindStatus] = useState("");

  onChangeRef.current = onChange;
  onPrepareMigrationSnapshotRef.current = onPrepareMigrationSnapshot;
  onWikilinkNavigateRef.current = onWikilinkNavigate;
  onImageDoodleRef.current = onImageDoodle;
  onBlurRef.current = onBlur;
  onErrorRef.current = onError;
  latestInputsRef.current = { noteKey, content, contentRevision };

  const reportLoadError = (loadError: unknown): void => {
    const message = loadError instanceof Error ? loadError.message : "可视化编辑器加载失败";
    rootRef.current?.setAttribute("data-editor-ready", "false");
    setError(message);
    onErrorRef.current?.(loadError);
  };

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const handleImageClick = (event: MouseEvent): void => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const image = target.closest<HTMLImageElement>("img");
      if (!image || !root.contains(image)) return;

      const src = image.getAttribute("src")?.trim() ?? "";
      const hostedMarker = image.getAttribute("data-mk-hosted-url")?.trim() ?? "";
      const hostedUrl = /^https?:\/\//i.test(hostedMarker)
        ? hostedMarker
        : /^https?:\/\//i.test(src)
          ? src
          : null;
      const localMarker =
        image.getAttribute("data-mk-rel")?.trim() ??
        image.getAttribute("data-mk-local-rel")?.trim() ??
        "";
      const localRel = /^File\//i.test(localMarker) ? localMarker : null;
      if (!localRel && !hostedUrl) return;

      event.preventDefault();
      event.stopPropagation();
      onImageDoodleRef.current?.(localRel, hostedUrl);
    };

    root.addEventListener("click", handleImageClick);
    return () => root.removeEventListener("click", handleImageClick);
  }, []);

  useEffect(() => {
    let cancelled = false;

    const mountEditor = async (): Promise<void> => {
      const root = rootRef.current;
      if (!root) return;

      try {
        const adapter = await createMilkdownVisualEditorAdapter(root, latestInputsRef.current.content, {
          onWikilinkNavigate: (target) => onWikilinkNavigateRef.current?.(target),
        });
        if (cancelled) {
          adapter.destroy();
          return;
        }

        const session = createVisualEditorSession(adapter, (markdown) => {
          lastAdapterMarkdownRef.current = markdown;
          onChangeRef.current(markdown);
        });
        sessionRef.current = session;
        assignCommandRef(commandRef, {
          executeCommand: (command: VisualEditorCommand) => session.executeCommand(command),
          flushPendingChanges: () => {
            if (rootRef.current?.getAttribute("data-editor-ready") === "true") session.flushPendingChanges();
          },
        });

        const inputs = latestInputsRef.current;
        const requestId = ++loadRequestIdRef.current;
        activeNoteRef.current = inputs.noteKey;
        appliedRevisionRef.current = inputs.contentRevision;
        lastAdapterMarkdownRef.current = inputs.content;
        const initialLoad = async (): Promise<void> => {
          if (cancelled || loadRequestIdRef.current !== requestId) return;
          await onPrepareMigrationSnapshotRef.current?.();
          if (cancelled || loadRequestIdRef.current !== requestId) return;
          await session.loadNote(inputs.noteKey, inputs.content);
          if (!cancelled && loadRequestIdRef.current === requestId && activeNoteRef.current === inputs.noteKey) {
            rootRef.current?.setAttribute("data-editor-ready", "true");
          }
        };
        const queuedInitialLoad = loadQueueRef.current.then(initialLoad, initialLoad);
        loadQueueRef.current = queuedInitialLoad;
        await queuedInitialLoad;

        if (cancelled) {
          session.destroy();
          sessionRef.current = null;
          return;
        }

        assignEditorRef(editorRef, root.querySelector<HTMLDivElement>(".ProseMirror"));
      } catch (mountError) {
        if (cancelled) return;
        const message = mountError instanceof Error ? mountError.message : "可视化编辑器初始化失败";
        setError(message);
        onErrorRef.current?.(mountError);
      }
    };

    void mountEditor();
    return () => {
      cancelled = true;
      sessionRef.current?.destroy();
      sessionRef.current = null;
      assignEditorRef(editorRef, null);
      assignCommandRef(commandRef, null);
    };
  }, [commandRef, editorRef]);

  useEffect(() => {
    const session = sessionRef.current;
    if (!session) return;

    const noteChanged = noteKey !== activeNoteRef.current;
    if (noteChanged) {
      activeNoteRef.current = noteKey;
      appliedRevisionRef.current = contentRevision;
      lastAdapterMarkdownRef.current = content;
    } else {
      if (contentRevision === appliedRevisionRef.current) return;
      appliedRevisionRef.current = contentRevision;
      if (content === lastAdapterMarkdownRef.current) return;
    }

    lastAdapterMarkdownRef.current = content;
    rootRef.current?.setAttribute("data-editor-ready", "false");
    const requestId = ++loadRequestIdRef.current;
    let cancelled = false;
    const isCurrentRequest = (): boolean =>
      !cancelled &&
      loadRequestIdRef.current === requestId &&
      sessionRef.current === session;
    const loadNote = async (): Promise<void> => {
      if (!isCurrentRequest()) return;
      if (noteChanged) {
        await onPrepareMigrationSnapshotRef.current?.();
      }
      if (!isCurrentRequest()) return;
      await session.loadNote(noteKey, content);
      if (isCurrentRequest()) rootRef.current?.setAttribute("data-editor-ready", "true");
    };
    const queuedLoad = loadQueueRef.current.then(loadNote, loadNote);
    loadQueueRef.current = queuedLoad.catch((loadError) => {
      if (isCurrentRequest()) reportLoadError(loadError);
    });

    return () => {
      cancelled = true;
    };
  }, [content, contentRevision, noteKey]);

  const runVisualCommand = (command: VisualEditorCommand): void => {
    sessionRef.current?.executeCommand(command);
  };

  const findNext = (): void => {
    const found = sessionRef.current?.findNext(findQuery) ?? false;
    setFindStatus(found ? "已选中匹配项" : "未找到匹配项");
  };

  const replaceCurrent = (): void => {
    const replaced = sessionRef.current?.replaceCurrent(replaceText) ?? false;
    setFindStatus(replaced ? "已替换当前匹配项" : "请先查找一个匹配项");
  };

  const replaceAll = (): void => {
    const count = sessionRef.current?.replaceAll(findQuery, replaceText) ?? 0;
    setFindStatus(count > 0 ? `已替换 ${count} 处` : "未找到匹配项");
  };

  if (error) {
    return (
      <div className="visual-editor-error" role="status" data-testid="mknote-visual-editor-error">
        可视化编辑器暂不可用，已回退到旧编辑器
      </div>
    );
  }

  return (
    <div className="visual-editor-shell">
      <div className="visual-editor-table-toolbar" role="toolbar" aria-label="可视化编辑工具">
        <button
          type="button"
          className="visual-editor-table-toolbar-btn"
          data-testid="visual-editor-find-replace-toggle"
          title="查找替换"
          aria-label="查找替换"
          aria-expanded={findReplaceOpen}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => {
            setFindReplaceOpen((open) => !open);
            setFindStatus("");
          }}
        >
          <Icon name="search" size={16} />
        </button>
        <span className="visual-editor-table-toolbar-divider" aria-hidden="true" />
        <button
          type="button"
          className="visual-editor-table-toolbar-btn"
          data-testid="visual-editor-table-add-row"
          title="在当前行后添加一行"
          aria-label="在当前行后添加一行"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => runVisualCommand("add-table-row")}
        >
          <Icon name="insert_table_column" size={16} />
        </button>
        <button
          type="button"
          className="visual-editor-table-toolbar-btn"
          data-testid="visual-editor-table-delete-row"
          title="删除当前行"
          aria-label="删除当前行"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => runVisualCommand("delete-table-row")}
        >
          <Icon name="delete_table_row" size={16} />
        </button>
        <span className="visual-editor-table-toolbar-divider" aria-hidden="true" />
        <button
          type="button"
          className="visual-editor-table-toolbar-btn"
          data-testid="visual-editor-table-add-column"
          title="在当前列后添加一列"
          aria-label="在当前列后添加一列"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => runVisualCommand("add-table-column")}
        >
          <Icon name="insert_table_row" size={16} />
        </button>
        <button
          type="button"
          className="visual-editor-table-toolbar-btn"
          data-testid="visual-editor-table-delete-column"
          title="删除当前列"
          aria-label="删除当前列"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => runVisualCommand("delete-table-column")}
        >
          <Icon name="delete_table_column" size={16} />
        </button>
        <span className="visual-editor-table-toolbar-divider" aria-hidden="true" />
        <button
          type="button"
          className="visual-editor-table-toolbar-btn"
          data-testid="visual-editor-table-align-left"
          title="当前单元格左对齐"
          aria-label="当前单元格左对齐"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => runVisualCommand("align-table-left")}
        >
          <Icon name="align_left" size={16} />
        </button>
        <button
          type="button"
          className="visual-editor-table-toolbar-btn"
          data-testid="visual-editor-table-align-center"
          title="当前单元格居中"
          aria-label="当前单元格居中"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => runVisualCommand("align-table-center")}
        >
          <Icon name="align_center" size={16} />
        </button>
        <button
          type="button"
          className="visual-editor-table-toolbar-btn"
          data-testid="visual-editor-table-align-right"
          title="当前单元格右对齐"
          aria-label="当前单元格右对齐"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => runVisualCommand("align-table-right")}
        >
          <Icon name="align_right" size={16} />
        </button>
      </div>
      {findReplaceOpen && (
        <div
          className="visual-editor-find-replace"
          role="dialog"
          aria-label="查找替换"
          data-testid="visual-editor-find-replace-panel"
        >
          <label>
            查找
            <input
              data-testid="visual-editor-find-query"
              value={findQuery}
              onChange={(event) => setFindQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  findNext();
                }
              }}
              placeholder="输入要查找的文本"
            />
          </label>
          <label>
            替换为
            <input
              data-testid="visual-editor-replace-text"
              value={replaceText}
              onChange={(event) => setReplaceText(event.target.value)}
              placeholder="输入替换文本"
            />
          </label>
          <button
            type="button"
            data-testid="visual-editor-find-next"
            onMouseDown={(event) => event.preventDefault()}
            onClick={findNext}
          >
            查找下一个
          </button>
          <button
            type="button"
            data-testid="visual-editor-replace-current"
            onMouseDown={(event) => event.preventDefault()}
            onClick={replaceCurrent}
          >
            替换
          </button>
          <button
            type="button"
            data-testid="visual-editor-replace-all"
            onMouseDown={(event) => event.preventDefault()}
            onClick={replaceAll}
          >
            全部替换
          </button>
          <span role="status" data-testid="visual-editor-find-status">
            {findStatus}
          </span>
        </div>
      )}
      <div
        ref={rootRef}
        className="visual-editor-host markdown-preview"
        data-testid="mknote-visual-editor"
        data-editor-ready="false"
        role="textbox"
        aria-label="可视化 Markdown 编辑器"
        onBlur={() => {
          if (rootRef.current?.getAttribute("data-editor-ready") === "true") sessionRef.current?.flushPendingChanges();
          onBlurRef.current?.();
        }}
      />
    </div>
  );
}
