export type QuickPocketTag = "text" | "command" | "path" | "private";

export interface QuickPocketItem {
  id: string;
  title: string;
  body: string;
  tag: QuickPocketTag | null;
  groupId: string | null;
}

export interface QuickPocketGroup {
  id: string;
  name: string;
}

export interface QuickPocketSnapshot {
  items: QuickPocketItem[];
  groups: QuickPocketGroup[];
}

/** 只有最新请求的结果可以覆盖当前 Pocket 快照。 */
export function isLatestQuickPocketRequest(requestVersion: number, currentVersion: number): boolean {
  return requestVersion === currentVersion;
}

export type QuickPocketListNode =
  | { type: "item"; item: QuickPocketItem }
  | { type: "group"; group: QuickPocketGroup; items: QuickPocketItem[] };

export function hasQuickPocketContent(title: string, body: string): boolean {
  return Boolean(title.trim() || body.trim());
}

export const QUICK_POCKET_TAGS: ReadonlyArray<{ id: QuickPocketTag; label: string; icon: string }> = [
  { id: "text", label: "文本", icon: "text" },
  { id: "command", label: "命令或代码", icon: "terminal" },
  { id: "path", label: "路径", icon: "folder" },
  { id: "private", label: "隐私", icon: "lock_closed" },
];

export function summarizeQuickPocketBody(body: string, maxLength = 72): string {
  const singleLine = body.replace(/\s+/g, " ").trim();
  return singleLine.length > maxLength ? `${singleLine.slice(0, Math.max(0, maxLength - 1))}…` : singleLine;
}

export function maskPrivateBody(body: string): string {
  const visibleLength = Math.min(Math.max(body.replace(/\s/g, "").length, 8), 16);
  return "•".repeat(visibleLength);
}

export function filterQuickPocketItems(items: QuickPocketItem[], tag: QuickPocketTag | null): QuickPocketItem[] {
  return tag ? items.filter((item) => item.tag === tag) : items;
}

export function moveQuickPocketItemWithinTag(items: QuickPocketItem[], id: string, targetIndex: number, tag: QuickPocketTag | null): QuickPocketItem[] {
  if (!tag) return moveQuickPocketItem(items, id, targetIndex);
  const visibleItems = filterQuickPocketItems(items, tag);
  const movedVisibleItems = moveQuickPocketItem(visibleItems, id, targetIndex);
  if (movedVisibleItems === visibleItems) return items;
  let visibleIndex = 0;
  return items.map((item) => item.tag === tag ? movedVisibleItems[visibleIndex++] : item);
}

export function moveQuickPocketItem(items: QuickPocketItem[], id: string, targetIndex: number): QuickPocketItem[] {
  const currentIndex = items.findIndex((item) => item.id === id);
  if (currentIndex < 0) return items;
  const next = items.slice();
  const [item] = next.splice(currentIndex, 1);
  next.splice(Math.max(0, Math.min(targetIndex, next.length)), 0, item);
  return next;
}

export function groupItems(items: QuickPocketItem[], groups: QuickPocketGroup[]): Array<QuickPocketGroup & { items: QuickPocketItem[] }> {
  return groups.map((group) => ({ ...group, items: items.filter((item) => item.groupId === group.id) })).filter((group) => group.items.length >= 2);
}

export function buildQuickPocketListNodes(items: QuickPocketItem[], groups: QuickPocketGroup[]): QuickPocketListNode[] {
  const validGroups = new Map(groupItems(items, groups).map((group) => [group.id, group]));
  const renderedGroups = new Set<string>();
  const nodes: QuickPocketListNode[] = [];
  for (const item of items) {
    const group = item.groupId ? validGroups.get(item.groupId) : undefined;
    if (!group) {
      nodes.push({ type: "item", item });
      continue;
    }
    if (renderedGroups.has(group.id)) continue;
    renderedGroups.add(group.id);
    nodes.push({ type: "group", group, items: group.items });
  }
  return nodes;
}

export function resolveQuickPocketDropPlacement(pointerY: number, top: number, height: number, allowGrouping: boolean): "before" | "after" | "group" {
  const ratio = (pointerY - top) / Math.max(1, height);
  if (allowGrouping && ratio >= 0.25 && ratio <= 0.75) return "group";
  return ratio < 0.5 ? "before" : "after";
}
