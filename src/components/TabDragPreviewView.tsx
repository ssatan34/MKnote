import { useEffect, useState } from "react";
import { appBridge } from "../services/appBridge";
import "./NoteTabsBar.css";
import "./TabDragPreviewView.css";

interface TabDragPreviewPayload {
  title: string;
  pinned: boolean;
  active: boolean;
  accentHex?: string;
  width: number;
  height: number;
}

export function TabDragPreviewView() {
  const [payload, setPayload] = useState<TabDragPreviewPayload | null>(null);

  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | undefined;
    void appBridge.invoke<TabDragPreviewPayload | null>("take_tab_drag_preview_state")
      .then((state) => { if (!disposed) setPayload(state); })
      .catch(() => undefined);
    void appBridge.listen<TabDragPreviewPayload>("mknote:tab-drag-preview", (event) => {
      if (!disposed) setPayload(event.payload);
    }).then((cleanup) => {
      if (disposed) cleanup();
      else unlisten = cleanup;
    });
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, []);

  if (!payload) return null;
  return (
    <div className="tab-drag-preview-root" aria-hidden>
      <div
        className={`note-tab note-tab-external-preview${payload.active ? " active" : ""}${payload.pinned ? " pinned" : ""}`}
        style={{
          width: payload.width,
          minWidth: payload.width,
          maxWidth: payload.width,
          height: payload.height,
          "--tab-accent": payload.accentHex,
        } as React.CSSProperties}
      >
        <span className="note-tab-label">{payload.title}</span>
      </div>
    </div>
  );
}
