import {
  currentMonitor,
  getCurrentWindow,
  LogicalPosition,
  LogicalSize,
} from "@tauri-apps/api/window";

export const COMPACT_MIN = { width: 700, height: 440 } as const;
export const EXPANDED_MIN = { width: 720, height: 420 } as const;
export const FLOATER_SIZE = { width: 52, height: 52 } as const;
export const FLOATER_MIN = { width: 48, height: 48 } as const;

const DEFAULT_COMPACT_SIZE = { width: 760, height: 640 } as const;

export async function applyLayoutMinSize(layoutMode: string) {
  const win = getCurrentWindow();
  const min =
    layoutMode === "expanded"
      ? new LogicalSize(EXPANDED_MIN.width, EXPANDED_MIN.height)
      : new LogicalSize(COMPACT_MIN.width, COMPACT_MIN.height);
  await win.setMinSize(min);
}

/** 将逻辑坐标下的窗口左上角限制在当前显示器工作区内（贴边平移，不缩小窗口）。 */
export async function clampLogicalPosition(
  logicalX: number,
  logicalY: number,
  logicalW: number,
  logicalH: number,
): Promise<{ x: number; y: number }> {
  const monitor = await currentMonitor();
  if (!monitor) return { x: logicalX, y: logicalY };

  const s = monitor.scaleFactor;
  const wa = monitor.workArea;
  const left = wa.position.x / s;
  const top = wa.position.y / s;
  const right = left + wa.size.width / s;
  const bottom = top + wa.size.height / s;

  let x = logicalX;
  let y = logicalY;
  if (x + logicalW > right) x = Math.max(left, right - logicalW);
  if (y + logicalH > bottom) y = Math.max(top, bottom - logicalH);
  if (x < left) x = left;
  if (y < top) y = top;
  return { x, y };
}

/** 在指定逻辑位置展开紧凑窗：锚点为左上角，尺寸为 w×h，必要时贴边。 */
export async function placeCompactWindowAt(
  logicalX: number,
  logicalY: number,
  width: number,
  height: number,
) {
  const { x, y } = await clampLogicalPosition(logicalX, logicalY, width, height);
  const win = getCurrentWindow();
  await applyLayoutMinSize("compact");
  await win.setSize(new LogicalSize(width, height));
  await win.setPosition(new LogicalPosition(x, y));
}

export function compactSizeFromConfig(
  windowGeom?: { width: number; height: number } | null,
  fallback?: { w: number; h: number } | null,
) {
  if (fallback) return { width: fallback.w, height: fallback.h };
  if (windowGeom) return { width: windowGeom.width, height: windowGeom.height };
  return { ...DEFAULT_COMPACT_SIZE };
}

export async function readWindowLogicalPosition() {
  const win = getCurrentWindow();
  const scale = await win.scaleFactor();
  const pos = await win.outerPosition();
  return { x: pos.x / scale, y: pos.y / scale };
}
