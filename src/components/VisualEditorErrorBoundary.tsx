import { Component, type ErrorInfo, type ReactNode } from "react";

interface VisualEditorErrorBoundaryProps {
  children: ReactNode;
  onError: (error: unknown) => void;
}

interface VisualEditorErrorBoundaryState {
  hasError: boolean;
}

// React 的错误边界仍需使用 class；它专门把 lazy chunk 加载/渲染失败转回旧编辑器。
export class VisualEditorErrorBoundary extends Component<
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
