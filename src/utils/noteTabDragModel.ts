/**
 * 按稳定 key 计算新的 Tab 顺序，不修改原数组。
 * 拖拽库只负责识别 active/over，业务层只在结束时提交一次顺序变更。
 */
export function reorderTabsByKey<T>(
  tabs: T[],
  activeKey: string,
  overKey: string,
  getKey: (tab: T) => string,
): T[] {
  if (activeKey === overKey) return tabs;
  const fromIndex = tabs.findIndex((tab) => getKey(tab) === activeKey);
  const toIndex = tabs.findIndex((tab) => getKey(tab) === overKey);
  if (fromIndex < 0 || toIndex < 0) return tabs;

  const next = [...tabs];
  const [moved] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, moved);
  return next;
}

interface Point {
  x: number;
  y: number;
}

interface ClientPoint {
  clientX: number;
  clientY: number;
}

interface ElementOrigin {
  left: number;
  top: number;
}

export interface TabDragRect {
  key: string;
  left: number;
  right: number;
}

/** 把鼠标在原 Tab 内的抓取点原样交给浏览器原生拖拽预览。 */
export function nativePreviewOffset(rect: ElementOrigin, input: ClientPoint): Point {
  return {
    x: input.clientX - rect.left,
    y: input.clientY - rect.top,
  };
}

/**
 * 以被拖拽 Tab 的左右边缘计算侵入量。
 * 同一个 8px 边界同时负责进入和退出，避免出现需要多退一段才复原的滞回区。
 */
export function findTabIntrusionTarget(
  rects: TabDragRect[],
  activeKey: string,
  pointerX: number,
  grabOffsetX: number,
  activeWidth: number,
  threshold = 8,
): string {
  const activeIndex = rects.findIndex((rect) => rect.key === activeKey);
  if (activeIndex < 0) return activeKey;

  const activeRect = rects[activeIndex];
  const draggedLeft = pointerX - grabOffsetX;
  const draggedRight = draggedLeft + activeWidth;
  let targetKey = activeKey;

  if (draggedLeft > activeRect.left) {
    for (let index = activeIndex + 1; index < rects.length; index += 1) {
      if (draggedRight <= rects[index].left + threshold) break;
      targetKey = rects[index].key;
    }
    return targetKey;
  }

  if (draggedLeft < activeRect.left) {
    for (let index = activeIndex - 1; index >= 0; index -= 1) {
      if (draggedLeft >= rects[index].right - threshold) break;
      targetKey = rects[index].key;
    }
  }

  return targetKey;
}

/** 计算补位 Tab 的水平 FLIP 位移；被拖拽 Tab 本身只由原生预览跟随鼠标。 */
export function getTabDisplacement(
  keys: string[],
  activeKey: string,
  overKey: string,
  activeWidth: number,
): Record<string, number> {
  const displacement = Object.fromEntries(keys.map((key) => [key, 0]));
  const activeIndex = keys.indexOf(activeKey);
  const overIndex = keys.indexOf(overKey);
  if (activeIndex < 0 || overIndex < 0 || activeIndex === overIndex) return displacement;

  if (activeIndex < overIndex) {
    for (let index = activeIndex + 1; index <= overIndex; index += 1) {
      displacement[keys[index]] = -activeWidth;
    }
    return displacement;
  }

  for (let index = overIndex; index < activeIndex; index += 1) {
    displacement[keys[index]] = activeWidth;
  }
  return displacement;
}

/**
 * 原生 HTML 拖拽期间 WebView 可能延迟框架重绘，因此补位动画需要同步写入现有元素。
 * 这里保持 DOM 无关，便于验证每个 Tab 都会收到明确的水平位移或复原值。
 */
export function applyTabDisplacement<T>(
  items: T[],
  displacement: Record<string, number>,
  getKey: (item: T) => string,
  applyX: (item: T, x: number) => void,
): void {
  items.forEach((item) => applyX(item, displacement[getKey(item)] ?? 0));
}

export function clearTabDisplacementWithoutAnimation<T>(
  items: readonly T[],
  setTransition: (item: T, value: string) => void,
  setTransform: (item: T, value: string) => void,
): void {
  for (const item of items) {
    setTransition(item, "none");
    setTransform(item, "");
  }
}

/** 普通标签与锁定标签属于两个视觉区域，只允许在各自区域内排序。 */
export function canReorderTabGroups(activePinned: boolean, overPinned: boolean): boolean {
  return activePinned === overPinned;
}
