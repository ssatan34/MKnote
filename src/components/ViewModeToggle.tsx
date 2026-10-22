import type { MouseEventHandler } from "react";
import "./ViewModeToggle.css";

type ViewMode = "edit" | "preview";

interface ViewModeToggleProps {
  disabled?: boolean;
  mode: ViewMode;
  onClick: MouseEventHandler<HTMLButtonElement>;
  privacyMask: boolean;
}

export function ViewModeToggle({ disabled = false, mode, onClick, privacyMask }: ViewModeToggleProps) {
  const isPreview = mode === "preview";
  const title = privacyMask ? "关闭隐私遮罩后可预览" : isPreview ? "编辑" : "预览";

  return (
    <button
      type="button"
      className={`view-mode-toggle${isPreview ? " active" : ""}`}
      title={title}
      aria-label={title}
      aria-pressed={isPreview}
      disabled={disabled}
      data-no-drag
      onClick={onClick}
    >
      <svg className="view-mode-toggle__svg" width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
        <path
          className="view-mode-toggle__eye-frame"
          d="M12 18C17.5229 18 22 12 22 12C22 12 17.5229 6 12 6C6.47715 6 2 12 2 12C2 12 6.47715 18 12 18Z"
        />
        <path
          className="view-mode-toggle__pupil"
          d="M12 14.5C13.3807 14.5 14.5 13.3807 14.5 12C14.5 10.6193 13.3807 9.5 12 9.5C10.6193 9.5 9.5 10.6193 9.5 12C9.5 13.3807 10.6193 14.5 12 14.5Z"
        />
        <path
          className="view-mode-toggle__edit-tip"
          fillRule="evenodd"
          clipRule="evenodd"
          d="M12 12V9.5L19.5 2L22 4.5L14.5 12H12Z"
        />
        <path
          className="view-mode-toggle__edit-line"
          d="M8 12H4.5C3.11929 12 2 13.1193 2 14.5C2 15.8807 3.11929 17 4.5 17H19.5C20.8807 17 22 18.1193 22 19.5C22 20.8807 20.8807 22 19.5 22H9"
        />
      </svg>
    </button>
  );
}
