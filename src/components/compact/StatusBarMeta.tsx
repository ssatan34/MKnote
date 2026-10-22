import { memo } from "react";

interface StatusBarMetaProps {
  syncClass: string;
  syncText: string;
  charCount: number;
  lineNumber: number;
  viewMode: "edit" | "preview";
  onEnterPrivateMode?: () => void;
}

function StatusBarMetaComponent({
  syncClass,
  syncText,
  charCount,
  lineNumber,
  viewMode,
  onEnterPrivateMode,
}: StatusBarMetaProps) {
  return (
    <>
      <span className={`statusbar-sync statusbar-sync--${syncClass}`}>
        <span className={`sync-dot sync-dot--${syncClass}`} />
        本地 · {syncText}
      </span>
      <span className="statusbar-spacer" />
      <span
        title="字数（Ctrl+点击进入隐私模式）"
        style={{ cursor: "default" }}
        onClick={(e) => {
          if (e.ctrlKey) {
            e.preventDefault();
            onEnterPrivateMode?.();
          }
        }}
      >
        <span className="statusbar-count">{charCount} 字</span>
      </span>
      <span className="statusbar-sep" aria-hidden="true" />
      <span className="statusbar-line">{viewMode === "edit" ? `${lineNumber} 行` : "预览"}</span>
    </>
  );
}

export const StatusBarMeta = memo(StatusBarMetaComponent);
