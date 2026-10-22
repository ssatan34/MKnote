import { useEffect, useRef } from "react";
import { listen, TauriEvent } from "@tauri-apps/api/event";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { getCurrentWindow } from "@tauri-apps/api/window";

const IMAGE_EXT = /\.(png|jpe?g|gif|webp|bmp|svg)$/i;

function isImagePath(path: string): boolean {
  const normalized = path.replace(/\\/g, "/");
  return IMAGE_EXT.test(normalized);
}

type DropPayload = { paths?: string[] };

async function processDropPaths(
  paths: string[],
  dropGuardRef: React.MutableRefObject<{ key: string; ts: number } | null>,
  onImportAsset: (path: string) => Promise<string>,
  onImported: (relativePath: string) => void,
  onError?: (message: string) => void,
) {
  const imagePaths = paths.filter(isImagePath);
  if (imagePaths.length === 0) return;

  const guardKey = imagePaths.join("|");
  const now = Date.now();
  const guard = dropGuardRef.current;
  if (guard && guard.key === guardKey && now - guard.ts < 300) {
    return;
  }
  dropGuardRef.current = { key: guardKey, ts: now };

  for (const path of imagePaths) {
    try {
      const rel = await onImportAsset(path);
      onImported(rel);
    } catch (e) {
      onError?.(e instanceof Error ? e.message : String(e));
    }
  }
}

export function useTauriImageDrop(
  enabled: boolean,
  onImportAsset: ((path: string) => Promise<string>) | undefined,
  onImported: (relativePath: string) => void,
  onError?: (message: string) => void,
  onDragActive?: (active: boolean) => void,
) {
  const onImportedRef = useRef(onImported);
  const onErrorRef = useRef(onError);
  const onDragActiveRef = useRef(onDragActive);
  const onImportAssetRef = useRef(onImportAsset);
  const dropGuardRef = useRef<{ key: string; ts: number } | null>(null);

  onImportedRef.current = onImported;
  onErrorRef.current = onError;
  onDragActiveRef.current = onDragActive;
  onImportAssetRef.current = onImportAsset;

  useEffect(() => {
    if (!enabled || !onImportAssetRef.current) return;

    const handleDragEvent = (event: {
      payload: {
        type: "enter" | "over" | "drop" | "leave";
        paths?: string[];
      };
    }) => {
      const { type, paths = [] } = event.payload;
      if (type === "enter" || type === "over") {
        onDragActiveRef.current?.(true);
        return;
      }
      if (type === "leave") {
        onDragActiveRef.current?.(false);
        return;
      }
      if (type !== "drop") return;
      onDragActiveRef.current?.(false);
      void processDropPaths(
        paths,
        dropGuardRef,
        (path) => onImportAssetRef.current!(path),
        (rel) => onImportedRef.current(rel),
        (msg) => onErrorRef.current?.(msg),
      );
    };

    const handleRawDrop = (paths: string[]) => {
      onDragActiveRef.current?.(false);
      void processDropPaths(
        paths,
        dropGuardRef,
        (path) => onImportAssetRef.current!(path),
        (rel) => onImportedRef.current(rel),
        (msg) => onErrorRef.current?.(msg),
      );
    };

    const unsubs: Array<() => void> = [];
    let cancelled = false;

    void (async () => {
      const eventTargets = [
        listen<DropPayload>(TauriEvent.DRAG_ENTER, () => {
          onDragActiveRef.current?.(true);
        }),
        listen<DropPayload>(TauriEvent.DRAG_LEAVE, () => {
          onDragActiveRef.current?.(false);
        }),
        listen<DropPayload>(TauriEvent.DRAG_DROP, (event) => {
          handleRawDrop(event.payload.paths ?? []);
        }),
        listen<string[]>("mknote:file-drop", (event) => {
          handleRawDrop(event.payload);
        }),
        getCurrentWebview()
          .onDragDropEvent(handleDragEvent)
          .catch(() => undefined),
        getCurrentWindow()
          .onDragDropEvent(handleDragEvent)
          .catch(() => undefined),
      ];

      const results = await Promise.all(eventTargets);
      if (cancelled) {
        for (const result of results) {
          if (typeof result === "function") result();
        }
        return;
      }
      for (const result of results) {
        if (typeof result === "function") unsubs.push(result);
      }
    })();

    return () => {
      cancelled = true;
      for (const unlisten of unsubs) unlisten();
      onDragActiveRef.current?.(false);
    };
  }, [enabled]);
}
