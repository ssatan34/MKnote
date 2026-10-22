export interface EditorFocusTarget {
  readonly isConnected: boolean;
  blur: () => void;
  focus: (options?: FocusOptions) => void;
}

export type EditorFocusScheduler = (callback: () => void) => void;

/**
 * 窗口移动会让 WebView2 的原生 IME 定位缓存停留在移动前的位置。
 * 先释放再在下一帧恢复编辑器焦点，促使浏览器重新计算候选框锚点，同时避免滚动编辑区。
 */
export function refreshEditorFocusAfterWindowMove(
  editor: EditorFocusTarget | null,
  schedule: EditorFocusScheduler = (callback) => {
    window.requestAnimationFrame(callback);
  },
): void {
  if (!editor?.isConnected) return;

  editor.blur();
  schedule(() => {
    if (editor.isConnected) editor.focus({ preventScroll: true });
  });
}
