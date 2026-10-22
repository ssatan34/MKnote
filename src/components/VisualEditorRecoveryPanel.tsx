interface VisualEditorRecoveryPanelProps {
  onOpenSourceEditor?: () => void;
  message?: string;
}

export function VisualEditorRecoveryPanel({ onOpenSourceEditor, message }: VisualEditorRecoveryPanelProps) {
  return (
    <div className="visual-editor-recovery" role="status" data-testid="visual-editor-recovery">
      <p data-testid="visual-editor-recovery-message">
        {message ?? "可视化编辑器暂不可用，笔记内容仍保留在源码编辑器中。"}
      </p>
      <button
        type="button"
        className="visual-editor-recovery-button"
        onClick={onOpenSourceEditor}
        disabled={!onOpenSourceEditor}
      >
        打开源码编辑
      </button>
    </div>
  );
}
